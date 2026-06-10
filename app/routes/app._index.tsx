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
import { authenticate, PRO_PLAN, isTestBilling } from "../shopify.server";
import { deepScan } from "../medic/themeScan.server";
import {
  FREE_SCAN_LIMIT,
  hasProPlan,
  recordScan,
  scansUsedThisMonth,
} from "../medic/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const [isPro, scansUsed] = await Promise.all([
    hasProPlan(billing, PRO_PLAN, isTestBilling),
    scansUsedThisMonth(session.shop),
  ]);
  return {
    shop: session.shop,
    isPro,
    scansUsed,
    scansLimit: FREE_SCAN_LIMIT,
    testBilling: isTestBilling,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") ?? "scan";

  if (intent === "upgrade") {
    // Redirects to Shopify's subscription confirmation page; on approval the
    // merchant lands back in the app. Test mode until BILLING_LIVE=1.
    return billing.request({
      plan: PRO_PLAN,
      isTest: isTestBilling,
      returnUrl: `https://${session.shop}/admin/apps`,
    });
  }

  // intent === "scan" — enforce the free-tier monthly quota.
  const isPro = await hasProPlan(billing, PRO_PLAN, isTestBilling);
  if (!isPro) {
    const used = await scansUsedThisMonth(session.shop);
    if (used >= FREE_SCAN_LIMIT) {
      return {
        ok: false as const,
        error: `Free plan includes ${FREE_SCAN_LIMIT} deep scans per month — you've used all ${used}. Upgrade to Pro for unlimited scans.`,
        quotaExceeded: true as const,
      };
    }
  }

  try {
    const result = await deepScan(admin, session.shop);
    await recordScan(session.shop);
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
  const { shop, isPro, scansUsed, scansLimit, testBilling } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const upgradeFetcher = useFetcher();
  const scanning = fetcher.state !== "idle";
  const upgrading = upgradeFetcher.state !== "idle";
  const data = fetcher.data;
  const quotaLeft = Math.max(0, scansLimit - scansUsed);
  const quotaExhausted = !isPro && quotaLeft === 0;

  return (
    <Page>
      <TitleBar title="Theme Medic" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Deep theme scan
                  </Text>
                  <Badge tone={isPro ? "success" : "info"}>
                    {isPro ? "Pro" : `Free — ${quotaLeft} of ${scansLimit} scans left this month`}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Scans your live theme for code left behind by apps — including
                  &ldquo;ghost code&rdquo; from apps you&rsquo;ve already uninstalled that still
                  loads on every page and slows down {shop}.
                </Text>
                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    loading={scanning}
                    disabled={quotaExhausted}
                    onClick={() =>
                      fetcher.submit({ intent: "scan" }, { method: "POST" })
                    }
                  >
                    {scanning ? "Scanning theme…" : "Scan my live theme"}
                  </Button>
                  {!isPro && (
                    <Button
                      loading={upgrading}
                      onClick={() =>
                        upgradeFetcher.submit({ intent: "upgrade" }, { method: "POST" })
                      }
                    >
                      Upgrade to Pro — $19/mo, 7-day free trial
                    </Button>
                  )}
                </InlineStack>
                {!isPro && (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Pro: unlimited deep scans, plus daily automatic monitoring with
                    alerts when an app update slows your store down (rolling out).
                    {testBilling ? " (Billing is in test mode — no real charge.)" : ""}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {data && !data.ok && (
            <Layout.Section>
              <Banner
                tone={"quotaExceeded" in data && data.quotaExceeded ? "warning" : "critical"}
                title={
                  "quotaExceeded" in data && data.quotaExceeded
                    ? "Monthly scan limit reached"
                    : "Scan failed"
                }
              >
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
                        Couldn&rsquo;t verify which apps are still alive — your
                        storefront appears password-protected, so we can&rsquo;t observe
                        what actually loads. On a public storefront, detections are
                        classified Active vs. Likely&nbsp;dead automatically.
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
