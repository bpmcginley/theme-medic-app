import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Delete all of this shop's app data on uninstall (per our privacy policy). Safe to
  // run even if rows are already gone.
  await Promise.allSettled([
    db.scanEvent.deleteMany({ where: { shop } }),
    db.scanSnapshot.deleteMany({ where: { shop } }),
    db.monitorConfig.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
