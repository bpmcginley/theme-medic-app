// themeScan.server.js
//
// Server-side deep theme scan. Pulls the live (MAIN) theme's text files via the Admin
// GraphQL API (read_themes — no protected-scope exemption needed), then runs the
// signature engine to find app footprints and ghost code.

import { scanTheme } from "./scanner.js";

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

/**
 * Full deep scan for the authenticated shop.
 * @returns {{theme: {id,name}, scan: object, installedKnown: boolean}}
 */
export async function deepScan(admin) {
  const theme = await getMainTheme(admin);
  if (!theme) throw new Error("No published theme found.");

  const [assets, installed] = await Promise.all([
    getThemeFiles(admin, theme.id),
    getInstalledAppHandles(admin),
  ]);

  const scan = scanTheme(assets, installed ? { installedAppHandles: installed } : {});
  return { theme: { id: theme.id, name: theme.name }, scan, installedKnown: installed != null };
}
