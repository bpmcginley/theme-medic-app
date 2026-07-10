import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory GDPR webhook, sent ~48h after uninstall. Erase every row scoped to
// this shop, mirroring webhooks.app.uninstalled.tsx (safe to run even if that
// cleanup already happened).
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await Promise.allSettled([
    db.session.deleteMany({ where: { shop } }),
    db.scanEvent.deleteMany({ where: { shop } }),
    db.scanSnapshot.deleteMany({ where: { shop } }),
    db.monitorConfig.deleteMany({ where: { shop } }),
    db.shoffiNotification.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
