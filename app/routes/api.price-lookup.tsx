import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from '../db.server';
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const url = new URL(request.url);
  const productIds = (url.searchParams.get("productIds") || "").split(",").filter(Boolean);
  const customerId = url.searchParams.get("customerId");
  const segment = url.searchParams.get("segment");

  if (!productIds.length) {
    return json({ error: "productIds parameter is required" }, { status: 400 });
  }

  // Find the active discount plan for this customer or segment
  let plan = null;
  if (customerId) {
    plan = await prisma.discountPlan.findFirst({
      where: { targetType: "customer", targetKey: customerId },
      include: { rules: true },
    });
  }
  if (!plan && segment) {
    plan = await prisma.discountPlan.findFirst({
      where: { targetType: "segment", targetKey: segment },
      include: { rules: true },
    });
  }

  try {
    // Try to authenticate as admin first (for internal calls)
    let admin;
    try {
      const auth = await authenticate.admin(request);
      admin = auth.admin;
    } catch {
      // If admin auth fails, this might be a public call
      // For now, we'll return a mock response or error
      return json({ 
        error: "Authentication required for product lookup",
        message: "This API requires Shopify admin authentication"
      }, { status: 401 });
    }

    // Fetch products directly from Shopify
    const response = await admin.graphql(`#graphql
      query getProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
            collections(first: 10) {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      }
    `, {
      variables: {
        ids: productIds.map(id => `gid://shopify/Product/${id}`)
      }
    });

    const data = await response.json();
    const products = data.data.nodes.filter((node: any) => node !== null);

    const prices = productIds.map((productId) => {
      const product = products.find((p: any) => p.id === `gid://shopify/Product/${productId}`);
      if (!product) {
        return { productId, price: null, percentOff: 0, error: "Product not found" };
      }

      const basePrice = parseFloat(product.variants.edges[0]?.node.price || "0");
      let percentOff = 0;

      if (plan && product.collections.edges.length > 0) {
        // Check if any of the product's collections match our discount rules
        const productCollectionIds = product.collections.edges.map((edge: any) => 
          edge.node.id.replace('gid://shopify/Collection/', '')
        );
        
        const matchingRule = plan.rules.find((rule) =>
          productCollectionIds.includes(rule.categoryId.replace('gid://shopify/Collection/', ''))
        );
        
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

    return json(
      { 
        prices,
        plan: plan ? {
          name: plan.name,
          targetType: plan.targetType,
          targetKey: plan.targetKey
        } : null
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }
    );
  } catch (error) {
    console.error('Price lookup error:', error);
    return json(
      { error: "Failed to fetch product prices", details: (error as Error).message },
      { status: 500 }
    );
  }
}; 