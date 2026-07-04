// Public health endpoint for the host's health checks (Render). No auth, no DB.
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_args: LoaderFunctionArgs) => {
  // Not Response.json(...) — remix-serve only enables native fetch when the
  // v3_singleFetch future flag is on (it's off here), so the polyfilled
  // Response lacks the static .json() method. new Response(...) always works.
  return new Response(JSON.stringify({ ok: true, service: "theme-medic-app" }), {
    headers: { "content-type": "application/json" },
  });
};
