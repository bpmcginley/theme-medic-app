// Monitoring diff correctness (pure, no DB/network). Run: npx tsx tests/monitor.test.mjs
import { diffScans, summarizeScan } from "../app/medic/monitor.server.js";
import { buildAlert } from "../app/medic/email.server.js";

const errors = [];
const ok = (c, m) => { if (!c) errors.push(m); };

const sum = (apps) => ({ findings: apps.reduce((n, a) => n + a.findingCount, 0), deadBytes: 0, apps });

// 1) First scan with junk → changed (one-time heads-up).
const first = diffScans(null, sum([{ appId: "loox", name: "Loox", status: "stale", bytes: 1000, findingCount: 2 }]));
ok(first.changed && first.firstScan, "first scan with junk should be changed+firstScan");

// 2) No change between identical scans → not changed.
const apps = [{ appId: "loox", name: "Loox", status: "stale", bytes: 1000, findingCount: 2 }];
ok(diffScans(sum(apps), sum(apps)).changed === false, "identical scans → no drift");

// 3) New app appears → changed, listed in newApps.
const grew = diffScans(
  sum(apps),
  sum([...apps, { appId: "klaviyo", name: "Klaviyo", status: "stale", bytes: 500, findingCount: 1 }]),
);
ok(grew.changed && grew.newApps.some((a) => a.appId === "klaviyo"), "new app should be flagged");
ok(grew.newApps.length === 1 && grew.grewApps.length === 0, "only the new app, none grew");

// 4) Existing app's footprint grows → flagged in grewApps, not newApps.
const bigger = diffScans(
  sum(apps),
  sum([{ appId: "loox", name: "Loox", status: "stale", bytes: 3000, findingCount: 5 }]),
);
ok(bigger.changed && bigger.grewApps.some((a) => a.appId === "loox"), "grown app should be flagged");
ok(bigger.newApps.length === 0, "grown app is not a new app");

// 5) An app that shrank/was cleaned → NOT a regression (no alert).
const cleaned = diffScans(
  sum([{ appId: "loox", name: "Loox", status: "stale", bytes: 3000, findingCount: 5 }]),
  sum([{ appId: "loox", name: "Loox", status: "stale", bytes: 1000, findingCount: 2 }]),
);
ok(cleaned.changed === false, "fewer findings should not alert");

// 6) summarizeScan excludes active apps from actionable list.
const summary = summarizeScan({
  totals: { findings: 1, bytes: 1000 },
  apps: [
    { appId: "loox", app: "Loox", status: "stale", bytes: 1000, findings: [{}] },
    { appId: "privy", app: "Privy", status: "active", bytes: 9, findings: [{}] },
  ],
});
ok(summary.apps.length === 1 && summary.apps[0].appId === "loox", "summary should drop active apps");

// 7) Alert builder produces non-empty subject + html mentioning the app.
const alert = buildAlert("store.myshopify.com", grew);
ok(alert.subject.length > 0 && /klaviyo/i.test(alert.html), "alert should mention the new app");

// 8) stale -> ghost on the SAME app (no finding-count change) must alert ("confirmed dead").
const promoted = diffScans(
  { apps: [{ appId: "loox", name: "Loox", status: "stale", bytes: 1000, findingCount: 2 }] },
  { apps: [{ appId: "loox", name: "Loox", status: "ghost", bytes: 1000, findingCount: 2 }] },
);
ok(promoted.changed && promoted.grewApps.some((a) => a.appId === "loox"), "stale→ghost should alert");

// 9) Bytes-only growth above threshold (+20% and +20KB) alerts; below does not.
const heavier = diffScans(
  { apps: [{ appId: "loox", name: "Loox", status: "stale", bytes: 50_000, findingCount: 2 }] },
  { apps: [{ appId: "loox", name: "Loox", status: "stale", bytes: 90_000, findingCount: 2 }] },
);
ok(heavier.changed, "big byte growth should alert");
const slightly = diffScans(
  { apps: [{ appId: "loox", name: "Loox", status: "stale", bytes: 50_000, findingCount: 2 }] },
  { apps: [{ appId: "loox", name: "Loox", status: "stale", bytes: 52_000, findingCount: 2 }] },
);
ok(slightly.changed === false, "tiny byte growth should NOT alert");

// 10) Legacy prior snapshot missing findingCount must not crash or false-alert.
const legacy = diffScans(
  { apps: [{ appId: "loox", name: "Loox", status: "stale", bytes: 1000 }] }, // no findingCount
  { apps: [{ appId: "loox", name: "Loox", status: "stale", bytes: 1000, findingCount: 0 }] },
);
ok(legacy.changed === false, "legacy missing findingCount should be treated as 0, no alert");

// 11) Unreadable prior ({apps:[]} but NOT null) must not be treated as a first scan.
const unreadablePrior = diffScans(
  { apps: [] },
  { apps: [{ appId: "loox", name: "Loox", status: "stale", bytes: 1000, findingCount: 2 }] },
);
ok(!unreadablePrior.firstScan, "empty-but-present prior is not a first scan");
ok(unreadablePrior.changed && unreadablePrior.newApps.length === 1, "still alerts via newApps");

if (errors.length) {
  console.log("❌ MONITOR TESTS FAILED:");
  for (const e of errors) console.log("   - " + e);
  process.exit(1);
}
console.log("✅ All monitor tests passed (diff, summarize, alert build).");
