import prisma from "./db.server";

const SHOFFI_ENDPOINT = "https://platform.shoffi.app/v1/newMerchant";

// Shoffi pairs the install to the affiliate's referral click within a 60-SECOND window
// of the Shopify install, so the call must land fast. We fire it from the install-time
// app load (see app.tsx) and, to survive a transient blip without waiting for the
// merchant's *next* app open (which could be minutes later), retry a few times in-task
// with short backoff and a per-attempt timeout. Worst case stays well under the window.
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 3000]; // waits before attempt 2 and attempt 3
const PER_ATTEMPT_TIMEOUT_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tell Shoffi about a newly-installed merchant so affiliate installs can be attributed.
// Shoffi matches the merchant's install IP (XFF) against the affiliate's click IP, so
// this must fire from a real merchant browser request (the embedded app load), not a
// background job. Fires at most once per shop — the ShoffiNotification row is the marker.
//
// Safe to call on every app load: after the first success it short-circuits on a single
// indexed lookup, and any failure (or a missing SHOFFI_API_KEY) never breaks the load.
export async function notifyShoffiNewMerchant({
  shop,
  xff,
}: {
  shop: string;
  xff: string | null;
}): Promise<void> {
  const apiKey = process.env.SHOFFI_API_KEY;
  if (!apiKey) return; // integration not configured (e.g. local dev) — no-op.

  // Fast path: already notified — avoid a write on every subsequent load.
  if (await prisma.shoffiNotification.findUnique({ where: { shop } })) return;

  // Atomically claim before posting so concurrent first-loads don't double-fire.
  try {
    await prisma.shoffiNotification.create({ data: { shop } });
  } catch {
    return; // another request claimed it first.
  }

  const startedAt = Date.now();
  try {
    await postWithRetry({ apiKey, shop, xff });
    console.log(
      `Shoffi newMerchant ok for ${shop} in ${Date.now() - startedAt}ms`,
    );
  } catch (err) {
    // Release the claim so a later load retries the attribution ping.
    console.error(
      "Shoffi newMerchant failed after retries; will retry on next load:",
      err,
    );
    await prisma.shoffiNotification.delete({ where: { shop } }).catch(() => {});
  }
}

async function postWithRetry(args: {
  apiKey: string;
  shop: string;
  xff: string | null;
}): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      await postOnce(args);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function postOnce({
  apiKey,
  shop,
  xff,
}: {
  apiKey: string;
  shop: string;
  xff: string | null;
}): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch(SHOFFI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        shopName: shop,
        appId: process.env.SHOFFI_APP_ID || "379827027969",
        XFF: xff ?? "",
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Shoffi newMerchant responded ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}
