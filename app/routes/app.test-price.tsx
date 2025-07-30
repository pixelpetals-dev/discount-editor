import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, BlockStack, Text, Layout } from "@shopify/polaris";
import { prisma } from '../db.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productIds = (url.searchParams.get("productIds") || "8118100688996").split(",").filter(Boolean);
  const segment = url.searchParams.get("segment") || "vip";

  try {
    // Find the active discount plan for this segment
    const plan = await prisma.discountPlan.findFirst({
      where: { targetType: "segment", targetKey: segment },
      include: { rules: true },
    });

    if (!plan) {
      return json({ 
        error: `No discount plan found for segment: ${segment}`,
        productIds,
        segment
      });
    }

    // Mock product data with price 150
    const mockProducts = productIds.map(productId => ({
      id: `gid://shopify/Product/${productId}`,
      title: `Product ${productId}`,
      variants: {
        edges: [{
          node: {
            price: "150.00"
          }
        }]
      },
      collections: {
        edges: [
          { node: { id: "gid://shopify/Collection/305584734308" } }
        ]
      }
    }));

    const prices = productIds.map((productId) => {
      const product = mockProducts.find((p: any) => p.id === `gid://shopify/Product/${productId}`);
      if (!product) {
        return { productId, price: null, percentOff: 0, error: "Product not found" };
      }

      const basePrice = parseFloat(product.variants.edges[0]?.node.price || "0");
      let percentOff = 0;

      if (plan && product.collections.edges.length > 0) {
        const productCollectionIds = product.collections.edges.map((edge: any) => 
          edge.node.id.replace('gid://shopify/Collection/', '')
        );
        
        const matchingRule = plan.rules.find((rule) => {
          const ruleCollectionId = rule.categoryId.replace('gid://shopify/Collection/', '');
          return productCollectionIds.includes(ruleCollectionId);
        });
        
        if (matchingRule) {
          percentOff = matchingRule.percentOff;
        }
      }

      const price = basePrice * (1 - percentOff / 100);
      return { 
        productId, 
        price: price.toFixed(2), 
        originalPrice: basePrice.toFixed(2),
        percentOff,
        discount: (basePrice - price).toFixed(2)
      };
    });

    return json({
      prices,
      plan: {
        name: plan.name,
        targetType: plan.targetType,
        targetKey: plan.targetKey,
        rules: plan.rules.map(rule => ({
          categoryId: rule.categoryId,
          percentOff: rule.percentOff
        }))
      },
      productIds,
      segment
    });
  } catch (error) {
    console.error('Test price error:', error);
    return json(
      { error: "Failed to process price lookup", details: (error as Error).message },
      { status: 500 }
    );
  }
};

export default function TestPricePage() {
  const data = useLoaderData<typeof loader>();

  if ('error' in data) {
    return (
      <Page title="Price Test">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Error</Text>
                <Text as="p" variant="bodyMd">{data.error}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Price Test Results">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Discount Plan</Text>
              <Text as="p" variant="bodyMd">
                <strong>Name:</strong> {data.plan.name}<br/>
                <strong>Target:</strong> {data.plan.targetType} - {data.plan.targetKey}<br/>
                <strong>Rules:</strong> {data.plan.rules.length}
              </Text>
              
              <Text as="h3" variant="headingMd">Product Prices</Text>
              {data.prices.map((price: any) => (
                <Card key={price.productId}>
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingSm">Product {price.productId}</Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Original Price:</strong> ${price.originalPrice}<br/>
                      <strong>Discount:</strong> {price.percentOff}%<br/>
                      <strong>Discount Amount:</strong> ${price.discount}<br/>
                      <strong>Final Price:</strong> ${price.price}
                    </Text>
                  </BlockStack>
                </Card>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 