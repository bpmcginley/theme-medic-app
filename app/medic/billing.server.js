// billing.server.js
//
// Plan gating for the deep scan. Free tier: FREE_SCAN_LIMIT deep scans per calendar
// month. Pro ($19/mo, 7-day trial): unlimited scans + the upcoming daily monitoring
// and drift alerts.
//
// Quota rows (ScanEvent) are created ONLY for free-tier scans, and the claim is
// atomic — a single conditional INSERT — so concurrent submits can't race past the
// limit (check-then-act with a multi-second scan in between is a barn-door TOCTOU).
// Pro scans create no rows, so a shop that downgrades later isn't locked out by
// usage it already paid for.

import prisma from "../db.server";

export const FREE_SCAN_LIMIT = 3;

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function scansUsedThisMonth(shop) {
  return prisma.scanEvent.count({
    where: { shop, createdAt: { gte: monthStart() } },
  });
}

/**
 * Atomically claim one free-tier scan slot. The INSERT only fires while the shop is
 * under the limit, and SQLite serializes writers, so N concurrent claims can never
 * yield more than FREE_SCAN_LIMIT rows. Binds `now` from JS (not CURRENT_TIMESTAMP)
 * so stored values use Prisma's own DateTime encoding and stay comparable.
 *
 * @returns {Promise<boolean>} true if a slot was claimed; false = quota exhausted.
 */
export async function claimFreeScan(shop) {
  const affected = await prisma.$executeRaw`
    INSERT INTO ScanEvent (shop, createdAt)
    SELECT ${shop}, ${new Date()}
    WHERE (
      SELECT COUNT(*) FROM ScanEvent
      WHERE shop = ${shop} AND createdAt >= ${monthStart()}
    ) < ${FREE_SCAN_LIMIT}
  `;
  return affected > 0;
}

/**
 * Best-effort release of the most recent claim — a scan that failed should not
 * consume quota. Never throws (the scan error is the one the user needs to see).
 */
export async function releaseScanClaim(shop) {
  try {
    const newest = await prisma.scanEvent.findFirst({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });
    if (newest) await prisma.scanEvent.delete({ where: { id: newest.id } });
  } catch {
    /* losing one quota slot to an error beats masking the scan failure */
  }
}

/**
 * Check the shop's subscription state without redirecting.
 * @returns {Promise<boolean>} true if the shop has an active Pro subscription.
 */
export async function hasProPlan(billing, planName, isTest) {
  const { hasActivePayment } = await billing.check({
    plans: [planName],
    isTest,
  });
  return hasActivePayment;
}

/**
 * Pro check usable WITHOUT a request session (e.g. the cron job's offline admin
 * client), by querying the subscription directly. Returns true if any active
 * subscription exists.
 */
export async function isProViaAdmin(admin) {
  try {
    const res = await admin.graphql(
      `#graphql
        query activeSubs {
          currentAppInstallation {
            activeSubscriptions { status name }
          }
        }`,
    );
    const json = await res.json();
    const subs = json.data?.currentAppInstallation?.activeSubscriptions ?? [];
    return subs.some((s) => s.status === "ACTIVE");
  } catch {
    return false;
  }
}
