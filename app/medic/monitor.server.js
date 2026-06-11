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

// Higher = worse. A confirmed-dead "ghost" outranks a "likely dead" stale, etc.
const STATUS_RANK = { active: 0, unknown: 1, stale: 2, ghost: 3 };
const BYTES_GROWTH_ABS = 20 * 1024; // +20 KB
const BYTES_GROWTH_PCT = 0.2; // and +20%

const fc = (a) => a?.findingCount ?? 0; // legacy snapshots may lack findingCount
const rank = (a) => STATUS_RANK[a?.status] ?? 1;

// An existing app "worsened" if it has more findings, materially more weight, or its
// classification got worse (e.g. stale -> ghost once we confirm the app is gone).
function worsened(before, after) {
  if (fc(after) > fc(before)) return "more findings";
  if (rank(after) > rank(before)) return "now confirmed dead";
  const dB = (after.bytes ?? 0) - (before.bytes ?? 0);
  if (dB >= BYTES_GROWTH_ABS && dB >= (before.bytes ?? 0) * BYTES_GROWTH_PCT) return "heavier";
  return null;
}

/**
 * Pure diff between two scan summaries. Flags apps that newly appeared and apps whose
 * footprint grew (by findings, weight, or worsened classification). Returns
 * { changed, firstScan, newApps, grewApps, summary }.
 *
 * `prev` is null on a true first scan, or undefined when the previous snapshot existed
 * but was unreadable — in the latter case we must NOT re-fire a first-scan alert every
 * run, so the caller passes an empty summary instead of null.
 */
export function diffScans(prev, curr) {
  const prevApps = new Map((prev?.apps ?? []).map((a) => [a.appId, a]));
  const currApps = new Map((curr?.apps ?? []).map((a) => [a.appId, a]));

  const newApps = [...currApps.values()].filter((a) => !prevApps.has(a.appId));
  const grewApps = [...currApps.values()]
    .map((a) => {
      const before = prevApps.get(a.appId);
      if (!before) return null;
      const reason = worsened(before, a);
      return reason ? { ...a, reason } : null;
    })
    .filter(Boolean);

  // First-ever scan (no prior at all) with leftovers is worth one notification.
  const firstScanWithJunk = prev === null && (curr?.apps?.length ?? 0) > 0;

  const changed = newApps.length > 0 || grewApps.length > 0 || firstScanWithJunk;
  const parts = [];
  if (newApps.length) parts.push(`${newApps.length} new app(s) left code behind`);
  if (grewApps.length) parts.push(`${grewApps.length} existing leftover(s) got worse`);
  if (firstScanWithJunk && !parts.length) parts.push(`${curr.apps.length} app(s) with leftover code`);

  return {
    changed,
    firstScan: prev === null,
    newApps,
    grewApps,
    summary: changed ? parts.join("; ") + "." : "No new ghost code since last scan.",
  };
}

const SNAPSHOTS_KEPT = 10; // rolling history per shop — enough for diffs + a short trail

/**
 * Returns the previous snapshot summary, or:
 *   - null  → no snapshot has ever been stored (true first scan; alert on junk)
 *   - {apps:[]} → a snapshot row exists but couldn't be parsed (don't treat as first
 *     scan — that would re-alert every run; treat as "nothing known prior").
 * The `at` field carries the row timestamp for the same-day retry guard.
 */
export async function latestSnapshot(shop) {
  const row = await prisma.scanSnapshot.findFirst({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  try {
    return { ...JSON.parse(row.summaryJson), at: row.createdAt };
  } catch {
    return { apps: [], findings: 0, deadBytes: 0, at: row.createdAt, unreadable: true };
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
  // Prune to the most recent SNAPSHOTS_KEPT rows so the table can't grow unbounded.
  const old = await prisma.scanSnapshot.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    skip: SNAPSHOTS_KEPT,
    select: { id: true },
  });
  if (old.length) {
    await prisma.scanSnapshot.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  }
}

// True if the shop already has a snapshot dated today (UTC) — used to make the daily
// sweep idempotent so a scheduler retry can't double-scan or double-email.
export async function scannedToday(shop) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const n = await prisma.scanSnapshot.count({ where: { shop, createdAt: { gte: start } } });
  return n > 0;
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
