import prisma from "./db.server";

const SHOFFI_ENDPOINT = "https://platform.shoffi.app/v1/newMerchant";

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
    });
    if (!res.ok) throw new Error(`Shoffi newMerchant responded ${res.status}`);
  } catch (err) {
    // Release the claim so a later load retries the attribution ping.
    console.error("Shoffi newMerchant failed; will retry on next load:", err);
    await prisma.shoffiNotification.delete({ where: { shop } }).catch(() => {});
  }
}
