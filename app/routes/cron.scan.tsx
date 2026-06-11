// routes/cron.scan.tsx
//
// Daily monitoring sweep, hit by an external scheduler (Render Cron Job) once a day.
// Protected by a shared secret (constant-time compare, header only — never in the URL).
//
// The sweep runs OFF the request thread: we authorize, kick it off, and return 202
// immediately, so total work time never depends on shop count (which would otherwise
// blow past platform HTTP timeouts and silently drop the tail). Shops are processed
// with bounded concurrency and a hard per-shop deadline so one hung store can't stall
// the batch, and the same-day guard makes scheduler retries idempotent.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import crypto from "node:crypto";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { isProViaAdmin } from "../medic/billing.server";
import { runMonitorForShop, getMonitorConfig, scannedToday } from "../medic/monitor.server";
import { sendAlertEmail } from "../medic/email.server";

const SHOP_CONCURRENCY = 3;
const PER_SHOP_TIMEOUT_MS = 45_000;

function constantTimeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — never run an unprotected sweep
  const header = request.headers.get("authorization") || "";
  return constantTimeEqual(header, `Bearer ${secret}`);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function processShop(shop: string) {
  const cfg = await getMonitorConfig(shop);
  if (cfg && cfg.enabled === false) return { shop, skipped: "monitoring disabled" };
  if (await scannedToday(shop)) return { shop, skipped: "already scanned today" };

  let admin;
  try {
    ({ admin } = await unauthenticated.admin(shop));
  } catch {
    return { shop, skipped: "no valid session (likely uninstalled)" };
  }

  if (!(await isProViaAdmin(admin))) return { shop, skipped: "not Pro" };

  const { diff } = await runMonitorForShop(admin, shop);
  let emailed = false;
  if (diff.changed && cfg?.alertEmail) {
    const r = await sendAlertEmail(cfg.alertEmail, shop, diff);
    emailed = r.sent;
  }
  return { shop, changed: diff.changed, emailed, summary: diff.summary };
}

// Bounded-concurrency worker pool over the shop list.
async function runSweep() {
  const sessions = await prisma.session.findMany({
    where: { isOnline: false },
    select: { shop: true },
    distinct: ["shop"],
  });
  const shops = sessions.map((s) => s.shop);

  const results: Array<Record<string, unknown>> = [];
  let cursor = 0;
  async function worker() {
    while (cursor < shops.length) {
      const shop = shops[cursor++];
      try {
        results.push(await withTimeout(processShop(shop), PER_SHOP_TIMEOUT_MS));
      } catch (err) {
        results.push({ shop, error: err instanceof Error ? err.message : "failed" });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SHOP_CONCURRENCY, shops.length || 1) }, worker),
  );
  console.log(`[medic][cron] swept ${results.length} shop(s)`);
  return results;
}

// Authorize, then run the sweep WITHOUT blocking the response. Errors are logged.
function kickOff(request: Request): Response {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  runSweep().catch((err) => console.error("[medic][cron] sweep failed:", err));
  return Response.json({ ok: true, started: true }, { status: 202 });
}

export const loader = ({ request }: LoaderFunctionArgs) => kickOff(request);
export const action = ({ request }: ActionFunctionArgs) => kickOff(request);
