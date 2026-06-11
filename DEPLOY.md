# Theme Medic — production deploy runbook

Goal: get the embedded app running live on Render so Shopify reviewers (and real
merchants) can reach it. ~$7/mo (Render Starter). Do these in order.

---

## 0. Before you start
- The app already exists in your Partner Dashboard (client_id
  `45fc24d307ec26aaf6c32c1e230d5688`).
- Distribution is already set to **Public** (done earlier — required for billing).
- You'll need your app's **API secret** (Partner Dashboard → your app → **API
  credentials** → "API secret key").

---

## 1. Create the Render service
1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect the **`bpmcginley/theme-medic-app`** repo. Render reads `render.yaml`.
3. It will create one **web service** (Starter, with a 1GB disk). Click **Apply**.
4. When prompted for the `sync: false` env vars, set:
   - `SHOPIFY_API_KEY` = `45fc24d307ec26aaf6c32c1e230d5688`
   - `SHOPIFY_API_SECRET` = *(your API secret key)*
   - `RESEND_API_KEY` = *(optional — leave blank for now; alerts just won't send)*
   - `ALERT_FROM_EMAIL` = *(optional, e.g. `Theme Medic <alerts@thememedic.app>`)*
   - `CRON_SECRET` is auto-generated — leave it.
   - `DATABASE_URL`, `SCOPES`, `SHOPIFY_APP_URL`, `NODE_ENV` come from `render.yaml`.

## 2. Confirm the app URL
- After it deploys, note the service URL (should be
  `https://theme-medic-app.onrender.com`).
- **If the URL is different** (name was taken → Render added a suffix), update the
  `SHOPIFY_APP_URL` env var in Render to the real URL and redeploy.
- Check health: visiting `https://<your-app-url>/healthz` returns `{"ok":true}`.

## 3. Point the Shopify app at production, then deploy the config
Shopify's `shopify app dev` repoints the app's URLs at your laptop; for production you
point them at Render. Edit **`shopify.app.toml`**:

1. Set the URLs to your Render URL:
   ```toml
   application_url = "https://theme-medic-app.onrender.com"

   [auth]
   redirect_urls = [ "https://theme-medic-app.onrender.com/auth/callback" ]
   ```
2. **Restore the webhook subscriptions** (they were removed for localhost dev — they
   work fine on a real https URL):
   ```toml
   [webhooks]
   api_version = "2026-07"

     [[webhooks.subscriptions]]
     uri = "/webhooks/app/uninstalled"
     topics = [ "app/uninstalled" ]

     [[webhooks.subscriptions]]
     uri = "/webhooks/app/scopes_update"
     topics = [ "app/scopes_update" ]
   ```
3. Push the config to Shopify:
   ```
   npx shopify app deploy
   ```

> ⚠️ **Dev vs. prod URL conflict:** running `npx shopify app dev` again will repoint
> the app's URLs back to your laptop, breaking the live app. While the app is live for
> real users, don't run `shopify app dev` against it — develop against a separate
> dev app/store, or accept that dev temporarily takes the app offline for testing.

## 4. Wire up the daily cron (free, via GitHub Actions)
The workflow `.github/workflows/daily-scan.yml` is already in the repo.
1. Copy the generated `CRON_SECRET` value from Render (app → Environment).
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `CRON_SECRET` = *(that value)*
   - `APP_URL` = your Render URL *(only needed if it isn't the default)*
3. Test it: Actions tab → "Daily store scan" → **Run workflow**. A green run = the
   sweep is wired. (It returns `202` and runs in the background.)

## 5. Verify end to end
- Install the app on your dev store from the Partner Dashboard (it now points at Render).
- Open it → **Scan my live theme** works.
- Upgrade flow still shows test charges (billing is still in test mode).

## 6. Submit to the App Store
- Fill the listing from `LISTING.md`, paste reviewer notes from `REVIEW_NOTES.md`
  (fill in the demo-store + password + support email blanks).
- Upload the icon (export `public/icon.svg` to 1200×1200 PNG) and your screenshots.

## 7. When you're ready to charge real money
- In Render, set env var `BILLING_LIVE=1` and redeploy. Until then every charge is a
  Shopify test charge (no real money). Do this only after the listing is approved.

---

### Cost summary
- Render Starter web service: **~$7/mo** (always-on + disk).
- Daily cron: **$0** (GitHub Actions).
- Everything else (PSI, Neon for the free tool, GitHub): **$0**.
