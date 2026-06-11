// routes/cron.scan.tsx
//
// Daily monitoring sweep, hit by an external scheduler (Render Cron Job) once a day.
// Protected by a shared secret. For every shop with a stored offline session that is
// on Pro and has monitoring enabled, it runs a monitor cycle and emails an alert when
// new ghost code appears. No-ops cleanly if email/secret aren't configured.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { isProViaAdmin } from "../medic/billing.server";
import { runMonitorForShop, getMonitorConfig } from "../medic/monitor.server";
import { sendAlertEmail } from "../medic/email.server";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never run an unprotected sweep
  const header = request.headers.get("authorization") || "";
  const url = new URL(request.url);
  return header === `Bearer ${secret}` || url.searchParams.get("key") === secret;
}

async function runSweep() {
  // Distinct shops that have an offline session stored (i.e. installed the app).
  const sessions = await prisma.session.findMany({
    where: { isOnline: false },
    select: { shop: true },
    distinct: ["shop"],
  });

  const results: Array<Record<string, unknown>> = [];
  for (const { shop } of sessions) {
    try {
      const cfg = await getMonitorConfig(shop);
      if (cfg && cfg.enabled === false) {
        results.push({ shop, skipped: "monitoring disabled" });
        continue;
      }
      const { admin } = await unauthenticated.admin(shop);
      if (!(await isProViaAdmin(admin))) {
        results.push({ shop, skipped: "not Pro" });
        continue;
      }
      const { diff } = await runMonitorForShop(admin, shop);
      let emailed = false;
      if (diff.changed && cfg?.alertEmail) {
        const r = await sendAlertEmail(cfg.alertEmail, shop, diff);
        emailed = r.sent;
      }
      results.push({ shop, changed: diff.changed, emailed, summary: diff.summary });
    } catch (err) {
      results.push({ shop, error: err instanceof Error ? err.message : "failed" });
    }
  }
  return results;
}

// Support both GET (simple cron pingers) and POST.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const results = await runSweep();
  return Response.json({ ok: true, scanned: results.length, results });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const results = await runSweep();
  return Response.json({ ok: true, scanned: results.length, results });
};
