// billing.server.js
//
// Plan gating for the deep scan. Free tier: FREE_SCAN_LIMIT deep scans per calendar
// month. Pro ($19/mo, 7-day trial): unlimited scans + the upcoming daily monitoring
// and drift alerts. Scan usage is tracked in SQLite via Prisma (ScanEvent rows).

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

export async function recordScan(shop) {
  await prisma.scanEvent.create({ data: { shop } });
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
