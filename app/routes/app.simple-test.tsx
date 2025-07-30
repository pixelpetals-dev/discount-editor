import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, BlockStack, Text, Layout, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);
    
    return json({
      success: true,
      message: "Authentication successful!",
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Simple test failed:', error);
    return json({
      success: false,
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
};

export default function SimpleTestPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="Simple Test">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Simple Authentication Test</Text>
              
              {data.success ? (
                <>
                  <Banner tone="success">
                    ✅ Authentication successful!
                  </Banner>
                  <Text as="p" variant="bodyMd">
                    <strong>Message:</strong> {(data as any).message}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Timestamp:</strong> {data.timestamp}
                  </Text>
                </>
              ) : (
                <>
                  <Banner tone="critical">
                    ❌ Authentication failed
                  </Banner>
                  <Text as="p" variant="bodyMd">
                    <strong>Error:</strong> {(data as any).error}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Timestamp:</strong> {data.timestamp}
                  </Text>
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 