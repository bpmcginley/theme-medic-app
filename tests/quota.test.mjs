// Quota-claim correctness test, run against the real SQLite schema via the app's
// Prisma client. Verifies the atomic conditional-INSERT claim, the raw-vs-client
// DateTime encoding compatibility (the subtle one), release semantics, and the
// concurrency guarantee the UI cannot provide.
//
// Run:  node tests/quota.test.mjs   (after `npx prisma migrate dev`)

import {
  FREE_SCAN_LIMIT,
  claimFreeScan,
  releaseScanClaim,
  scansUsedThisMonth,
} from "../app/medic/billing.server.js";
import prisma from "../app/db.server.js";

const SHOP = "quota-test.invalid"; // never a real shop
const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };

// Clean slate
await prisma.scanEvent.deleteMany({ where: { shop: SHOP } });

// 1) Sequential claims up to the limit succeed; the next is refused.
for (let i = 1; i <= FREE_SCAN_LIMIT; i++) {
  ok((await claimFreeScan(SHOP)) === true, `claim ${i} should succeed`);
}
ok((await claimFreeScan(SHOP)) === false, "claim past limit should be refused");

// 2) The client-side count sees the raw-inserted rows (DateTime encoding agrees).
ok(
  (await scansUsedThisMonth(SHOP)) === FREE_SCAN_LIMIT,
  `client count should see ${FREE_SCAN_LIMIT} raw-inserted rows`,
);

// 3) Release frees exactly one slot, claimable again.
await releaseScanClaim(SHOP);
ok((await scansUsedThisMonth(SHOP)) === FREE_SCAN_LIMIT - 1, "release should free one slot");
ok((await claimFreeScan(SHOP)) === true, "slot should be claimable after release");

// 4) Concurrency: from a clean slate, 10 simultaneous claims must yield exactly
//    FREE_SCAN_LIMIT successes — this is the TOCTOU guarantee.
await prisma.scanEvent.deleteMany({ where: { shop: SHOP } });
const results = await Promise.all(Array.from({ length: 10 }, () => claimFreeScan(SHOP)));
const wins = results.filter(Boolean).length;
ok(
  wins === FREE_SCAN_LIMIT,
  `exactly ${FREE_SCAN_LIMIT} of 10 concurrent claims should win (got ${wins})`,
);
ok(
  (await scansUsedThisMonth(SHOP)) === FREE_SCAN_LIMIT,
  "row count after concurrent burst must equal the limit",
);

// Cleanup
await prisma.scanEvent.deleteMany({ where: { shop: SHOP } });
await prisma.$disconnect();

if (errors.length) {
  console.log("❌ QUOTA TESTS FAILED:");
  for (const e of errors) console.log("   - " + e);
  process.exit(1);
}
console.log("✅ All quota tests passed (atomic claim, encoding, release, concurrency).");
