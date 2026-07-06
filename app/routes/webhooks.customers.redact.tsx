import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Mandatory GDPR webhook. We only request read_themes and never store
// shopper-level customer data (no Customer/order models in prisma/schema.prisma),
// so there is nothing to redact — acknowledge with 200.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  return new Response();
};
