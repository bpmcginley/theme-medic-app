# Theme Medic — launch post drafts (SHIP_PLAN.md 4.4)

Ready to copy-paste once the App Store listing is live. Fill in `[LISTING_URL]`
with the real `apps.shopify.com/...` link before posting anywhere. Nothing here
has been posted — draft only. Reddit posts are deferred per standing instruction;
drafted here so they're ready whenever that's revisited.

---

## Product Hunt

**Tagline (60 chars):** Find the dead app code slowing your Shopify store

**Description:**
Every Shopify store collects baggage. You try an app, uninstall it — but the
code it injected into your theme stays behind, loading on every page, forever.
Theme Medic scans your live theme and storefront, matches it against 60+ common
apps, and tells you exactly which leftover code is dead weight vs. still active.
Free scan tool: https://theme-medic-scan.onrender.com — no login needed. The
Shopify app adds daily monitoring so you find out the moment a new app leaves
junk behind.

**First comment (maker):**
Hey PH! I'm Bruce, solo builder. I kept noticing my own test stores getting
slower every month even though I wasn't touching the theme — turned out to be
ghost code from apps I'd long since uninstalled. Theme Medic is read-only (never
edits your theme), free to try, and the free scan at the link above works on
any live Shopify store with no signup. Would love feedback, especially from
anyone who's dealt with "why is my store suddenly slow" mysteries.

---

## Show HN

(Blocked by HN's own site-wide new-account policy for Show HN — not something
account-specific. Revisit once account history/karma builds naturally, same as
IndieHackers reputation-building. Draft kept ready for whenever that clears.)

**Title:** Show HN: Theme Medic – find dead app code slowing down your Shopify store

**Body:**
I built a free tool that scans a Shopify store's live theme + storefront and
tells you which installed apps are adding weight, and — more usefully — which
code is left over from apps you uninstalled months ago (Shopify doesn't remove
an app's injected theme code when you uninstall it). It's read-only, uses real
Google PageSpeed data, and needs no login: https://theme-medic-scan.onrender.com

The harder problem was telling "still active" apart from "dead code" — I fetch
the live storefront the way a real visitor would and check which app scripts
actually execute, rather than just grepping the theme's source files (which
would flag plenty of apps that are still running fine).

Happy to answer questions about the attribution approach or the PageSpeed
Insights integration.

---

## r/shopify

**Title:** I built a free tool that shows which apps are silently slowing down your store

**Body:**
Wanted to share something I built after noticing my own dev stores kept
getting slower even when I wasn't touching the theme. Turns out uninstalling
an app doesn't remove the code it added to your theme — that code just keeps
loading on every page, forever, unless you go clean it up by hand.

Free scan tool (no login): https://theme-medic-scan.onrender.com
- Real Google PageSpeed data (mobile)
- Names the actual app responsible for each chunk of weight (60+ apps in the
  database — Loox, Klaviyo, Judge.me, Yotpo, Bold, Vitals, etc.)
- Tells you if it's still active or dead code from something you uninstalled

Also built a Shopify app version for daily monitoring + email alerts, working
on getting it through App Store review now. Would appreciate any feedback on
the scan tool in the meantime — especially if it catches (or misses) something
on your store.

---

## r/ecommerce

**Title:** Free tool: see exactly which Shopify apps are hurting your page speed

**Body:**
Every extra second of load time can cost real conversions, and on Shopify a
big chunk of that is usually third-party apps — including ones you've already
uninstalled (the code they added to your theme doesn't get removed
automatically).

I built a free scanner that measures your store with real Google PageSpeed
data and attributes the weight to specific apps by name, so you know what's
actually worth cleaning up vs. what's core to your theme:
https://theme-medic-scan.onrender.com

No login, no email required to see your results. Feedback welcome, especially
if you run a store with a long app history — that's where it finds the most.

---

## IndieHackers

**Title:** Launched a free Shopify speed-scan tool as the top of funnel for my app (Theme Medic)

**Body:**
Solo, $0 marketing budget, 18 y/o founder. The wedge: a free public scan tool
(no login) that measures a Shopify store's real speed via Google PageSpeed
Insights and attributes page weight to specific installed apps — including
"ghost code" left behind by apps that were uninstalled but never cleaned up.

Free tool: https://theme-medic-scan.onrender.com
Shopify app (in App Store review): [LISTING_URL]

Funnel: free scan → email capture for a monthly health report → app install
for daily monitoring + alerts. Free tier is 3 deep scans/month, Pro is
$19/mo. Kill criteria I set for myself: if day 90 hits with <10 installs and
$0 MRR, I stop investing further build time here.

Happy to share more on the app-attribution approach (matching PageSpeed's
resource list against a 60-app signature database) if useful to anyone
building something similar.

---

## Free directory submissions (SHIP_PLAN.md 5.4 — draft list, Bruce submits)

- Product Hunt (see above)
- BetaList
- SaaSHub
- AlternativeTo (category: Shopify apps / performance tools)
- Shopify App Store's own "Apps like X" surfacing (organic, post-approval)
- There's An AI For That / similar tool directories (marginal fit, low priority)
- StartupBase
- Indie Hackers "Products" directory
