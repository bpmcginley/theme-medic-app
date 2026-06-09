// themeScan.server.js
//
// Server-side deep theme scan. Pulls the live (MAIN) theme's text files via the Admin
// GraphQL API (read_themes — no protected-scope exemption needed), then runs the
// signature engine to find app footprints and ghost code.

import { scanTheme } from "./scanner.js";
import { signatures } from "./signatures.js";

// Only fetch/scan text files the engine understands; skips images/fonts and keeps the
// GraphQL payloads sane.
const TEXT_FILE = /\.(liquid|js|css|json|scss)$/i;

async function getMainTheme(admin) {
  const res = await admin.graphql(
    `#graphql
      query mainTheme {
        themes(first: 1, roles: [MAIN]) {
          nodes { id name }
        }
      }`,
  );
  const json = await res.json();
  return json.data?.themes?.nodes?.[0] ?? null;
}

async function getThemeFiles(admin, themeId) {
  const assets = [];
  let after = null;
  // Paginate through all files; content inline only for text bodies.
  for (let page = 0; page < 40; page++) {
    const res = await admin.graphql(
      `#graphql
        query themeFiles($id: ID!, $after: String) {
          theme(id: $id) {
            files(first: 50, after: $after) {
              nodes {
                filename
                body {
                  ... on OnlineStoreThemeFileBodyText { content }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
      { variables: { id: themeId, after } },
    );
    const json = await res.json();
    const files = json.data?.theme?.files;
    if (!files) break;
    for (const f of files.nodes) {
      if (!TEXT_FILE.test(f.filename)) continue;
      assets.push({ key: f.filename, value: f.body?.content ?? "" });
    }
    if (!files.pageInfo?.hasNextPage) break;
    after = files.pageInfo.endCursor;
  }
  return assets;
}

// Best-effort list of installed app handles for ghost-vs-active classification.
// appInstallations may not be available to all apps — degrade to "unknown" gracefully.
async function getInstalledAppHandles(admin) {
  try {
    const res = await admin.graphql(
      `#graphql
        query installedApps {
          appInstallations(first: 100) {
            nodes { app { handle } }
          }
        }`,
    );
    const json = await res.json();
    const nodes = json.data?.appInstallations?.nodes;
    if (!Array.isArray(nodes)) return null;
    return nodes.map((n) => n.app?.handle).filter(Boolean);
  } catch {
    return null;
  }
}

// Activity signal 1: app-embed blocks registered in config/settings_data.json.
// Enabled embeds mean the app is installed and switched on. Block types look like
// "shopify://apps/<app-handle>/blocks/<block>/<uuid>".
// Walk the parsed settings recursively for app-embed blocks: objects whose `type`
// matches "shopify://apps/<handle>/...". Shape-proof (current can be an object or a
// preset-name string; blocks can live under presets). Crucially, uninstalling an app
// leaves its block behind with `disabled: true` — only ENABLED embeds count as a sign
// of life; a disabled leftover is exactly the ghost we're hunting.
// Returns null when settings_data.json is missing/unparseable (NO signal), or the
// list of enabled embed handles when it parsed (possibly empty — which IS a signal:
// "we looked, nothing is alive").
function embedHandlesFromSettings(assets) {
  const settings = assets.find((a) => /(^|\/)settings_data\.json$/i.test(a.key));
  if (!settings?.value) return null;
  const enabled = new Set();
  let root;
  try {
    // settings_data.json regularly opens with a /* auto-generated */ comment banner —
    // valid to Shopify's parser, fatal to JSON.parse. Strip leading block comments.
    const cleaned = settings.value.replace(/^\s*(\/\*[\s\S]*?\*\/\s*)+/, "");
    root = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (!node || typeof node !== "object") return;
    const m = /^shopify:\/\/apps\/([a-z0-9_-]+)\//i.exec(node.type ?? "");
    if (m && node.disabled !== true) enabled.add(m[1].toLowerCase());
    for (const v of Object.values(node)) walk(v);
  };
  walk(root);
  return [...enabled];
}

// THE activity signal: which signature script hosts actually load on the public
// storefront. This is the only reliable liveness test — settings_data embed entries
// persist fully "enabled" after an app is uninstalled, so they prove nothing.
// Scans the homepage plus one product page (some apps only load their widget there).

const UA = { "User-Agent": "ThemeMedic/1.0 (+https://thememedic.app)" };

async function fetchStorefrontHtml(url, cookie) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: cookie ? { ...UA, Cookie: cookie } : UA,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return await res.text();
}

// Dev stores are always password-protected. For local testing, set
// MEDIC_STOREFRONT_PASSWORD and we'll unlock the storefront the way a browser does
// (POST the password form, reuse the storefront_digest cookie).
async function storefrontCookie(shopDomain) {
  const pw = process.env.MEDIC_STOREFRONT_PASSWORD;
  if (!pw) return null;
  try {
    const res = await fetch(`https://${shopDomain}/password`, {
      method: "POST",
      redirect: "manual",
      headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: pw, form_type: "storefront_password", utf8: "✓" }),
      signal: AbortSignal.timeout(15000),
    });
    // Shopify's storefront password session cookie has changed names over time
    // (storefront_digest → _shopify_essential) — keep every cookie it sets.
    const cookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie")].filter(Boolean);
    if (!cookies.length) return null;
    return cookies.map((c) => c.split(";")[0]).join("; ");
  } catch {
    return null;
  }
}

async function activeIdsFromStorefront(shopDomain) {
  try {
    const cookie = await storefrontCookie(shopDomain);
    const home = await fetchStorefrontHtml(`https://${shopDomain}/`, cookie);
    if (!home) return null;
    // Password page = real theme never rendered = no liveness signal.
    if (/template-password|\/password["?']/i.test(home)) return null;

    let html = home;
    // Add one product page: widgets like reviews often only load there.
    try {
      const pj = await fetch(`https://${shopDomain}/products.json?limit=1`, {
        headers: cookie ? { ...UA, Cookie: cookie } : UA,
        signal: AbortSignal.timeout(10000),
      });
      if (pj.ok) {
        const { products } = await pj.json();
        const handle = products?.[0]?.handle;
        if (handle) {
          const product = await fetchStorefrontHtml(
            `https://${shopDomain}/products/${handle}`,
            cookie,
          );
          if (product) html += product;
        }
      }
    } catch {
      /* product page is best-effort */
    }

    // "Alive" = the app's script/stylesheet/iframe ACTUALLY LOADS — i.e. its host
    // appears in a resource-loading attribute. A bare text mention ("Powered by
    // Judge.me" links, leftover widget markup) is not life; it's often the corpse.
    const resourceUrls = [
      ...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi),
      ...html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi),
      ...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi),
    ].map((m) => m[1].toLowerCase());

    const ids = [];
    for (const sig of signatures) {
      const hit = sig.scriptHosts?.find((h) =>
        resourceUrls.some((u) => u.includes(h.toLowerCase())),
      );
      if (hit) {
        ids.push(sig.id);
        console.log(`[medic] storefront-evidence ${sig.id}: resource loading from ${hit}`);
      }
    }
    return ids;
  } catch {
    return null; // unreachable storefront — no signal
  }
}

/**
 * Full deep scan for the authenticated shop.
 * @returns {{theme: {id,name}, scan: object, classification: "installed"|"signals"|"none"}}
 */
export async function deepScan(admin, shopDomain) {
  const theme = await getMainTheme(admin);
  if (!theme) throw new Error("No published theme found.");

  const [assets, installed, storefrontIds] = await Promise.all([
    getThemeFiles(admin, theme.id),
    getInstalledAppHandles(admin),
    shopDomain ? activeIdsFromStorefront(shopDomain) : Promise.resolve(null),
  ]);

  let opts = {};
  let classification = "none";
  if (installed) {
    opts = { installedAppHandles: installed };
    classification = "installed";
  } else if (storefrontIds !== null) {
    // Storefront liveness is the only trustworthy signal: settings_data embed entries
    // stay fully "enabled" after uninstall, so they cannot distinguish dead from alive.
    opts = { activeAppIds: storefrontIds };
    classification = "signals";
  }

  // Dev-terminal diagnostics for classification tuning (no merchant data beyond handles).
  const settingsRaw = assets.find((a) => /(^|\/)settings_data\.json$/i.test(a.key))?.value ?? "";
  const allEmbeds = [...settingsRaw.matchAll(/shopify:\/\/apps\/([a-z0-9_-]+)\//gi)].map((m) =>
    m[1].toLowerCase(),
  );
  console.log(
    `[medic] classification=${classification} installed=${installed ? installed.length : "n/a"} ` +
      `storefront=${storefrontIds ? storefrontIds.join(",") || "(none)" : "no-signal"} ` +
      `embeds-enabled=${embedHandlesFromSettings(assets)?.join(",") || "(none)"} ` +
      `embeds-all=${[...new Set(allEmbeds)].join(",") || "(none)"} assets=${assets.length}`,
  );

  const scan = scanTheme(assets, opts);
  return { theme: { id: theme.id, name: theme.name }, scan, classification };
}
