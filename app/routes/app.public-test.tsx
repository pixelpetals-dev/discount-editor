import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, BlockStack, Text, Layout, Banner } from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({
    success: true,
    message: "Public route working!",
    timestamp: new Date().toISOString(),
    url: request.url
  });
};

export default function PublicTestPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="Public Test">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Public Route Test</Text>
              
              <Banner tone="success">
                ✅ Public route working!
              </Banner>
              
              <Text as="p" variant="bodyMd">
                <strong>Message:</strong> {data.message}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Timestamp:</strong> {data.timestamp}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>URL:</strong> {data.url}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 