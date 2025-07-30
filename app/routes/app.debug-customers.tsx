import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, BlockStack, Text, Layout, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin } = await authenticate.admin(request);
    
    // Try to fetch segments using the new approach
    const segmentsResponse = await admin.graphql(`#graphql
      query getSegments($first: Int!) {
        segments(first: $first) {
          edges {
            node {
              id
              name
              query
            }
          }
          pageInfo { hasNextPage }
        }
      }
    `, {
      variables: { first: 50 }
    });
    
    const segmentsData = await segmentsResponse.json();
    
    return json({ 
      success: true,
      data: segmentsData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

export default function DebugCustomersPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="Debug Customers">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Customer Access Test</Text>
              
              {data.success ? (
                <Banner tone="success">
                  ✅ Customer access successful!
                </Banner>
              ) : (
                <Banner tone="critical">
                  ❌ Customer access failed: {(data as any).error}
                </Banner>
              )}
              
              <Text as="p" variant="bodyMd">
                <strong>Timestamp:</strong> {data.timestamp}
              </Text>
              
              <Text as="h3" variant="headingSm">Raw Response:</Text>
              <div style={{ backgroundColor: '#f6f6f7', padding: '12px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify((data as any).data || (data as any).error, null, 2)}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 