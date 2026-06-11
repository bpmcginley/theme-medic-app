// monitor.server.js
//
// M4: the recurring-value engine. Re-runs the deep theme scan on a schedule, diffs the
// result against the shop's previous snapshot, and surfaces NEW ghost code so the
// merchant hears about it the moment an app uninstall leaves junk behind — without
// having to open the app. diffScans() is pure (unit-tested); the rest does I/O.

import prisma from "../db.server";
import { deepScan } from "./themeScan.server";

// Reduce a full ScanResult to the few facts we store and compare over time.
export function summarizeScan(scanResult) {
  const actionable = (scanResult.apps ?? []).filter((a) => a.status !== "active");
  return {
    findings: scanResult.totals?.findings ?? 0,
    deadBytes: scanResult.totals?.bytes ?? 0,
    apps: actionable.map((a) => ({
      appId: a.appId,
      name: a.app,
      status: a.status,
      bytes: a.bytes,
      findingCount: a.findings.length,
    })),
  };
}

/**
 * Pure diff between two scan summaries. Flags apps that newly appeared and apps whose
 * footprint grew. Returns { changed, newApps, grewApps, summary }.
 */
export function diffScans(prev, curr) {
  const prevApps = new Map((prev?.apps ?? []).map((a) => [a.appId, a]));
  const currApps = new Map((curr?.apps ?? []).map((a) => [a.appId, a]));

  const newApps = [...currApps.values()].filter((a) => !prevApps.has(a.appId));
  const grewApps = [...currApps.values()].filter((a) => {
    const before = prevApps.get(a.appId);
    return before && a.findingCount > before.findingCount;
  });

  // First-ever scan (no prior) with leftovers is itself worth one notification.
  const firstScanWithJunk = !prev && (curr?.apps?.length ?? 0) > 0;

  const changed = newApps.length > 0 || grewApps.length > 0 || firstScanWithJunk;
  const parts = [];
  if (newApps.length) parts.push(`${newApps.length} new app(s) left code behind`);
  if (grewApps.length) parts.push(`${grewApps.length} existing leftover(s) grew`);
  if (firstScanWithJunk && !parts.length) parts.push(`${curr.apps.length} app(s) with leftover code`);

  return {
    changed,
    firstScan: !prev,
    newApps,
    grewApps,
    summary: changed ? parts.join("; ") + "." : "No new ghost code since last scan.",
  };
}

export async function latestSnapshot(shop) {
  const row = await prisma.scanSnapshot.findFirst({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  try {
    return { ...JSON.parse(row.summaryJson), at: row.createdAt };
  } catch {
    return null;
  }
}

export async function saveSnapshot(shop, summary) {
  await prisma.scanSnapshot.create({
    data: {
      shop,
      findings: summary.findings,
      deadBytes: summary.deadBytes,
      summaryJson: JSON.stringify(summary),
    },
  });
}

/**
 * Run one monitoring cycle for a shop: scan → summarize → diff vs previous → persist.
 * Returns { diff, summary } so the caller can decide whether to alert. Does NOT send
 * email itself (separation keeps it testable and lets the cron batch sends).
 */
export async function runMonitorForShop(admin, shop) {
  const prev = await latestSnapshot(shop);
  const { scan } = await deepScan(admin, shop);
  const summary = summarizeScan(scan);
  const diff = diffScans(prev, summary);
  await saveSnapshot(shop, summary);
  return { diff, summary };
}

export async function getMonitorConfig(shop) {
  return prisma.monitorConfig.findUnique({ where: { shop } });
}

export async function setMonitorConfig(shop, { alertEmail, enabled }) {
  return prisma.monitorConfig.upsert({
    where: { shop },
    create: { shop, alertEmail, enabled: enabled ?? true },
    update: { ...(alertEmail !== undefined ? { alertEmail } : {}), ...(enabled !== undefined ? { enabled } : {}) },
  });
}
