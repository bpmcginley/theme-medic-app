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
function embedHandlesFromSettings(assets) {
  const settings = assets.find((a) => /(^|\/)settings_data\.json$/i.test(a.key));
  if (!settings?.value) return [];
  // Regex the raw text rather than walking the JSON shape: `current` may be an object
  // or a preset-name string, and blocks can live under presets — the raw scan is
  // shape-proof. Disabled embeds still count as "present", which is the safe direction
  // (an installed-but-toggled-off app is not ghost code).
  const handles = new Set();
  const re = /shopify:\/\/apps\/([a-z0-9_-]+)\//gi;
  let m;
  while ((m = re.exec(settings.value)) !== null) handles.add(m[1].toLowerCase());
  return [...handles];
}

// Activity signal 2: which signature script hosts actually load on the public
// storefront. A theme reference whose host never appears in the rendered page is
// likely dead code.
async function activeIdsFromStorefront(shopDomain) {
  try {
    const res = await fetch(`https://${shopDomain}/`, {
      redirect: "follow",
      headers: { "User-Agent": "ThemeMedic/1.0 (+https://thememedic.app)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Password-protected storefronts (dev stores, pre-launch) render the password
    // template, not the real theme — no app scripts load there, so liveness can't be
    // judged. Treat as "no signal" rather than marking everything stale.
    if (/template-password|\/password["?']/i.test(html)) return null;
    const ids = [];
    for (const sig of signatures) {
      if (sig.scriptHosts?.some((h) => html.includes(h))) ids.push(sig.id);
    }
    return ids;
  } catch {
    return null; // password-protected or unreachable storefront — no signal
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
  } else {
    // Fall back to activity signals: storefront liveness + enabled app embeds.
    // Embed block handles are the app's internal handle (e.g. "judge-me-reviews"),
    // not necessarily its App Store handle — match on normalized substrings.
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const embedHandles = embedHandlesFromSettings(assets).map(norm);
    const embedIds = signatures
      .filter((s) => {
        const candidates = [norm(s.id), norm(s.handle)].filter((c) => c.length >= 4);
        return embedHandles.some((h) =>
          candidates.some((c) => h.includes(c) || c.includes(h)),
        );
      })
      .map((s) => s.id);
    if (storefrontIds || embedIds.length) {
      opts = { activeAppIds: [...new Set([...(storefrontIds ?? []), ...embedIds])] };
      classification = "signals";
    }
  }

  // Dev-terminal diagnostics for classification tuning (no merchant data beyond handles).
  console.log(
    `[medic] classification=${classification} installed=${installed ? installed.length : "n/a"} ` +
      `storefront=${storefrontIds ? storefrontIds.join(",") || "(none)" : "no-signal"} ` +
      `embeds=${embedHandlesFromSettings(assets).join(",") || "(none)"} assets=${assets.length}`,
  );

  const scan = scanTheme(assets, opts);
  return { theme: { id: theme.id, name: theme.name }, scan, classification };
}
