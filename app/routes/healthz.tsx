// Public health endpoint for the host's health checks (Render). No auth, no DB.
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_args: LoaderFunctionArgs) => {
  return Response.json({ ok: true, service: "theme-medic-app" });
};
