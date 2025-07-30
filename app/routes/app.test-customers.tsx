import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, BlockStack, Text, Layout, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);
    const { admin } = await authenticate.admin(request);
    
    console.log('=== TESTING CUSTOMER FETCH ===');
    
    // Simple customer query
    const response = await admin.graphql(`#graphql
      query {
        customers(first: 5) {
          edges {
            node {
              id
              email
              firstName
              lastName
              tags
            }
          }
        }
      }
    `);
    
    const data = await response.json();
    console.log('Customer query response:', JSON.stringify(data, null, 2));
    
    if ((data as any).errors) {
      console.error('GraphQL errors:', (data as any).errors);
      return json({
        success: false,
        error: (data as any).errors,
        customers: []
      });
    }
    
    const customers = data.data?.customers?.edges || [];
    console.log(`Found ${customers.length} customers`);
    
    return json({
      success: true,  
      customers: customers.map((edge: any) => ({
        id: edge.node.id,
        email: edge.node.email,
        firstName: edge.node.firstName,
        lastName: edge.node.lastName,
        tags: edge.node.tags || []
      }))
    });
    
  } catch (error) {
    console.error('Test failed:', error);
    return json({
      success: false,
      error: (error as Error).message,
      customers: []
    });
  }
};

export default function TestCustomersPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="Customer Test">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Customer Fetch Test</Text>
              
              {data.success ? (
                <>
                  <Banner tone="success">
                    ✅ Customer fetch successful!
                  </Banner>
                  
                  <Text as="p" variant="bodyMd">
                    <strong>Customers found:</strong> {data.customers.length}
                  </Text>
                  
                  {data.customers.length > 0 ? (
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">Customer Details:</Text>
                      {data.customers.map((customer: any) => (
                        <Card key={customer.id}>
                          <BlockStack gap="100">
                            <Text as="p" variant="bodyMd">
                              <strong>Email:</strong> {customer.email}
                            </Text>
                            <Text as="p" variant="bodyMd">
                              <strong>Name:</strong> {customer.firstName} {customer.lastName}
                            </Text>
                            <Text as="p" variant="bodyMd">
                              <strong>Tags:</strong> {customer.tags.length > 0 ? customer.tags.join(', ') : 'No tags'}
                            </Text>
                          </BlockStack>
                        </Card>
                      ))}
                    </BlockStack>
                  ) : (
                    <Banner tone="info">
                      No customers found in your store.
                    </Banner>
                  )}
                </>
              ) : (
                <>
                  <Banner tone="critical">
                    ❌ Customer fetch failed
                  </Banner>
                  <Text as="p" variant="bodyMd">
                    <strong>Error:</strong> {(data as any).error}
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