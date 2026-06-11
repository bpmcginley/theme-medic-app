# Theme Medic — App review instructions

Paste this into the **"Instructions for the reviewer"** / testing-notes field of the
Partner Dashboard submission. Fill in the bracketed values before submitting.

---

## What Theme Medic does (30-second summary)

Theme Medic is a **read-only** store-health app. It scans a merchant's live theme and
public storefront to find leftover "ghost code" from apps — code that apps inject into
the theme and that stays behind after the app is uninstalled, loading on every page and
slowing the store down. It reports each finding (which app, file, line, size, and
whether the app is still active or the code is dead) and, on the Pro plan, re-scans
daily and emails the merchant when new ghost code appears.

**Theme Medic never edits the theme.** It uses `read_themes` only to read and analyze.

---

## Test store (please use this — it has real findings pre-seeded)

- **Store:** `[your-demo-store].myshopify.com`
- **Storefront password (if prompted):** `[storefront password]`
- The app is already installed on this store, and the theme contains **leftover code
  from an app that was installed and then uninstalled**, so a scan returns real results.

> Why this matters: a brand-new install on a clean, never-touched theme legitimately
> finds nothing. To see Theme Medic work, you need a theme that has had an app installed
> and removed — which the demo store above already has.

---

## Step-by-step to verify the core feature

1. Open the app from the store admin. You'll see the **Deep theme scan** card with a
   plan badge ("Free — 3 of 3 scans left").
2. Click **"Scan my live theme."** After a few seconds you'll see a results summary
   (apps with leftover code, findings, dead file weight, estimated load-time cost) and
   one card per detected app.
3. Note the **status badges**: apps still loading on the storefront show **"Active app"**
   (green) and are excluded from the cleanup total; code from removed apps shows
   **"Ghost code / Likely dead"** — that's the leftover the merchant can clean up.
4. Each finding lists the **file and line** where the code lives.

### To reproduce ghost detection from scratch (optional)
On any test store: install a review app that adds theme code (e.g. Judge.me), confirm
it appears as **Active**, then **uninstall** it and scan again — its leftover code now
shows as **Likely dead**.

---

## Billing (Pro plan)

- Pricing: **Free** (3 scans/month) and **Pro — $19/month, 7-day free trial**.
- To test: click **"Upgrade to Pro."** Shopify's subscription approval page appears
  (as a **test charge** — no real money). Approve it; you return to the app and the
  badge changes to **"Pro"** with unlimited scans.
- Billing uses Shopify's managed Billing API. The app is set to public distribution.

## Daily monitoring (Pro)

- In the **"Daily monitoring & alerts"** card, a Pro merchant enters an alert email and
  enables monitoring. A daily scheduled job re-scans the store and emails the merchant
  only when **new or worsened** ghost code is detected. (This runs server-side on a
  schedule; nothing to click to verify beyond saving the settings.)

## Permissions justification

- **`read_themes`** — required to read theme files for analysis. The app is read-only
  and never writes to the theme.
- The app requests **no customer-data scopes** (no orders, customers, or PII).
- The app loads the store's **public storefront** (like any visitor) to check which app
  scripts actually load — this is how it distinguishes active apps from dead code.

## Support
`[your support email]` · Privacy policy: https://theme-medic-scan.onrender.com/privacy.html
