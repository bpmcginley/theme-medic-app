# Theme Medic — ship & distribution plan (July 2026)

Goal: listing live in the Shopify App Store, then maximum zero-capital reach.
Total cash outlay: ~$7/mo (Render). Target: first Pro subs within 60 days of listing.

Legend: [B] = Bruce-only (accounts/secrets/dashboards) · [C] = Claude can do/draft · [B+C] = co-pilot

---

## Phase 1 — Deploy to prod (~1 evening)

Follow `DEPLOY.md` steps 1–4 exactly. Split of labor:

- [B] 1.1 Create Render Blueprint service from `bpmcginley/theme-medic-app`; set
  `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` env vars. (~$7/mo Starter)
- [B] 1.2 Confirm service URL + `/healthz` returns `{"ok":true}`; fix
  `SHOPIFY_APP_URL` if Render suffixed the name.
- [C] 1.3 Edit `shopify.app.toml`: prod `application_url` + `redirect_urls`,
  restore the two webhook subscriptions (uninstalled, scopes_update).
- [B] 1.4 `npx shopify app deploy` (needs Partner login).
- [B] 1.5 Copy Render `CRON_SECRET` → GitHub Actions secret; run "Daily store scan"
  workflow manually; confirm green.

**Do NOT run `shopify app dev` against this app afterward** (repoints URLs at
laptop, breaks prod — see DEPLOY.md warning).

## Phase 2 — Verify end-to-end on prod (~1 hour, gate before submission)

All on the dev store, against the Render URL:

- [B+C] 2.1 Fresh install from Partner Dashboard → app loads embedded.
- [B+C] 2.2 Run "Scan my live theme" → results + per-app attribution render.
- [B+C] 2.3 Free-tier quota: 3 scans/mo enforced, 4th blocked cleanly.
- [B+C] 2.4 Upgrade flow → Shopify TEST charge approves → Pro unlocked → scans unmetered.
- [B+C] 2.5 Uninstall → reinstall: uninstall webhook fired (our tables cleaned),
  reinstall works. (Remember: app embeds in settings_data.json lie about
  uninstall — verify via DB/logs, not the storefront.)
- [B+C] 2.6 Cron sweep: trigger GH Action, confirm 202 + drift snapshots written.
- [C] 2.7 Screenshot pass for the listing while everything above is on screen
  (scan results, attribution table, drift alert, pricing) — need 3–6 at
  1600×900 per App Store specs.

Any failure here = fix before submitting. Reviewer hits these exact flows.

## Phase 3 — App Store submission (~1 evening + 5–10 business day review)

- [C] 3.1 Final listing copy from `LISTING.md`, tuned for App Store search
  (see 5.1 keywords). Name ≤30 chars, tagline ≤62, keyword-relevant first line.
- [B] 3.2 Fill `REVIEW_NOTES.md` blanks: demo store domain + password (`rtalom`),
  real support email. Export `public/icon.svg` → 1200×1200 PNG.
- [B] 3.3 Partner Dashboard → Distribution → create listing, paste everything,
  upload icon + screenshots, submit.
- [B+C] 3.4 Respond to reviewer feedback within 24h (rejections are usually
  small: a missing GDPR webhook, unclear permission justification — REVIEW_NOTES
  pre-empts most).
- [B] 3.5 ONLY after approval: Render env `BILLING_LIVE=1` + redeploy.
  Then verify one real charge on a test install and refund it.

## Phase 4 — Funnel prep (do DURING the review wait, ~2 evenings)

The free scan tool (theme-medic-scan.onrender.com, already live) is the
top-of-funnel; make it convert:

- [C] 4.1 Add prominent "Install Theme Medic on your store" CTA to scan results
  page (deep-link to App Store listing once live).
- [C] 4.2 SEO basics on the scan tool: title/meta/OG tags for "shopify theme
  speed checker", submit sitemap to Google Search Console [B: GSC account].
- [C] 4.3 **Programmatic SEO** — the moat: generate a static page per app in the
  60-app signature DB ("Does <App> slow down your Shopify store? Measured
  impact: X KB / Y ms") from real attribution data. 60 long-tail pages
  targeting "<app name> slow" searches merchants actually make. Interlink to
  the scan tool.
- [C] 4.4 Draft all launch posts (5.2) ahead of time so launch day is
  copy-paste.
- [C] 4.5 In-app review prompt: after a successful scan (2nd+), gentle "finding
  this useful? A review helps a lot" with deep link. Reviews are the #1 App
  Store ranking input — this compounds forever.

## Phase 5 — Launch (the mass-audience week, all zero-capital)

Fire everything within ~48h of listing approval for correlated momentum:

- 5.1 **App Store search = the primary mass channel.** Merchants search
  "speed", "page speed", "performance", "slow theme", "audit" daily with buy
  intent. Listing name/tagline/description must hit these (from 3.1). This
  channel needs no ongoing work — ranking grows with installs + reviews (4.5).
- 5.2 One-time launch posts [B posts, C drafts]:
  - Product Hunt launch (Tue–Thu best).
  - Show HN: "I built a tool that measures which Shopify apps slow stores down"
    (the attribution angle is the HN-worthy part, not the scanner).
  - r/shopify + r/ecommerce: value-first post with real findings from scans
    (e.g. "we measured the 10 heaviest Shopify apps"), not an ad.
  - IndieHackers launch thread.
- 5.3 Shopify Community forums [B, ongoing 15 min/wk]: answer "why is my store
  slow" threads with a genuinely useful diagnosis + free scan link. High
  intent, evergreen threads rank on Google.
- 5.4 Free directory submissions [C list, B submits]: Shopify app review
  blogs/newsletters that take free submissions.
- 5.5 Content asset [C]: one data post — "What 500 store scans taught us about
  Shopify speed" (publishable once scan volume exists; PH/HN follow-up ammo).

## Phase 6 — Post-launch loop (30 min/wk)

- Watch installs/reviews weekly; respond to every review.
- Later milestones: "Built for Shopify" badge (big ranking boost, has quality
  bar), theme-developer/agency partnerships, price test $19 vs $29.

## Success metrics / kill criteria

- Day 30 post-launch: ≥50 free installs, ≥1 Pro sub → healthy, keep going.
- Day 60: ≥3 Pro subs ($57 MRR) → on track for $100 MRR goal.
- Day 90 with <10 installs and 0 subs after all of Phase 5: stop investing
  build time; leave it listed (costs $7/mo, App Store SEO keeps working) and
  redeploy effort elsewhere.

## Honest framing

Everything through Phase 3 is deterministic — it WILL result in a listed app.
Phases 5–6 are the non-guaranteed part; the App Store + programmatic SEO are
the best available zero-capital mass channels, but the realistic first-quarter
outcome is $0–100 MRR. The bet costs $7/mo against an uncapped, fully passive
upside.
