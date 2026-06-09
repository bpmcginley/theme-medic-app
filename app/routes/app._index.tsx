import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  Badge,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { deepScan } from "../medic/themeScan.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const result = await deepScan(admin, session.shop);
    return { ok: true as const, ...result };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Scan failed" };
  }
};

const kb = (bytes: number) => (bytes / 1024).toFixed(1) + " KB";

const STATUS_BADGE: Record<
  string,
  { tone: "critical" | "success" | "attention" | "warning"; label: string }
> = {
  ghost: { tone: "critical", label: "Ghost code — app uninstalled" },
  active: { tone: "success", label: "Active app" },
  stale: { tone: "warning", label: "Likely dead — no sign of life" },
  unknown: { tone: "attention", label: "Detected" },
};

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const scanning = fetcher.state !== "idle";
  const data = fetcher.data;

  return (
    <Page>
      <TitleBar title="Theme Medic" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Deep theme scan
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Scans your live theme for code left behind by apps — including
                  &ldquo;ghost code&rdquo; from apps you&rsquo;ve already uninstalled that still
                  loads on every page and slows down {shop}.
                </Text>
                <InlineStack>
                  <Button
                    variant="primary"
                    loading={scanning}
                    onClick={() => fetcher.submit({}, { method: "POST" })}
                  >
                    {scanning ? "Scanning theme…" : "Scan my live theme"}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {data && !data.ok && (
            <Layout.Section>
              <Banner tone="critical" title="Scan failed">
                <p>{data.error}</p>
              </Banner>
            </Layout.Section>
          )}

          {data && data.ok && (
            <>
              <Layout.Section>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Results — theme &ldquo;{data.theme.name}&rdquo;
                    </Text>
                    <InlineStack gap="600">
                      <Box>
                        <Text as="p" variant="headingLg">
                          {data.scan.totals.apps}
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          apps with leftover code
                        </Text>
                      </Box>
                      <Box>
                        <Text as="p" variant="headingLg">
                          {data.scan.totals.findings}
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          findings
                        </Text>
                      </Box>
                      <Box>
                        <Text as="p" variant="headingLg">
                          {kb(data.scan.totals.bytes)}
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          dead file weight
                        </Text>
                      </Box>
                      <Box>
                        <Text as="p" variant="headingLg">
                          ~{(data.scan.totals.estMs / 1000).toFixed(2)}s
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          est. load-time cost
                        </Text>
                      </Box>
                    </InlineStack>
                    {data.classification === "signals" && (
                      <Text as="p" tone="subdued" variant="bodySm">
                        Classification via live-storefront + app-embed signals:
                        &ldquo;Active&rdquo; apps are verifiably loading; &ldquo;Likely
                        dead&rdquo; code shows no sign of life.
                      </Text>
                    )}
                    {data.classification === "none" && (
                      <Text as="p" tone="subdued" variant="bodySm">
                        Install state unavailable — detections are shown without
                        ghost/active classification.
                      </Text>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section>
                {data.scan.apps.length === 0 ? (
                  <Card>
                    <EmptyState
                      heading="No app footprints found"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>Your theme looks clean. Nice.</p>
                    </EmptyState>
                  </Card>
                ) : (
                  <BlockStack gap="300">
                    {data.scan.apps.map((app: any) => {
                      const badge = STATUS_BADGE[app.status] ?? STATUS_BADGE.unknown;
                      return (
                        <Card key={app.appId}>
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="h3" variant="headingSm">
                                {app.app}
                              </Text>
                              <Badge tone={badge.tone}>{badge.label}</Badge>
                            </InlineStack>
                            <Text as="p" tone="subdued" variant="bodySm">
                              {kb(app.bytes)} dead weight · ~{app.estRequests} request(s) ·
                              ~{app.estMs}ms · {app.findings.length} finding(s)
                            </Text>
                            <BlockStack gap="100">
                              {app.findings.slice(0, 6).map((f: any, i: number) => (
                                <Text as="p" variant="bodySm" key={i}>
                                  • {f.detail}{" "}
                                  <Text as="span" tone="subdued" variant="bodySm">
                                    ({f.asset}
                                    {f.locations?.length
                                      ? ` — line ${f.locations[0].line}`
                                      : ""}
                                    )
                                  </Text>
                                </Text>
                              ))}
                              {app.findings.length > 6 && (
                                <Text as="p" tone="subdued" variant="bodySm">
                                  +{app.findings.length - 6} more finding(s)
                                </Text>
                              )}
                            </BlockStack>
                          </BlockStack>
                        </Card>
                      );
                    })}
                  </BlockStack>
                )}
              </Layout.Section>
            </>
          )}
        </Layout>
      </BlockStack>
    </Page>
  );
}
