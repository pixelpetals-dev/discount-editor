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
        "Access-Control-Allow-Headers": "Content-Type",
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

  try {
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

    // For testing, we'll use mock product data with price 150
    // In production, you'd fetch this from Shopify
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
          // Use the actual collection ID from your discount rule
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
        // Check if any of the product's collections match our discount rules
        const productCollectionIds = product.collections.edges.map((edge: any) => 
          edge.node.id.replace('gid://shopify/Collection/', '')
        );
        
        console.log('Product collection IDs:', productCollectionIds);
        console.log('Plan rules:', plan.rules);
        
        const matchingRule = plan.rules.find((rule) => {
          const ruleCollectionId = rule.categoryId.replace('gid://shopify/Collection/', '');
          console.log('Checking rule:', ruleCollectionId, 'against product collections:', productCollectionIds);
          return productCollectionIds.includes(ruleCollectionId);
        });
        
        if (matchingRule) {
          percentOff = matchingRule.percentOff;
          console.log('Found matching rule:', matchingRule);
        } else {
          console.log('No matching rule found');
          // For testing: if no match found, add the rule's collection to the product
          if (plan.rules.length > 0) {
            const ruleCollectionId = plan.rules[0].categoryId;
            console.log('Adding rule collection to product for testing:', ruleCollectionId);
            product.collections.edges.push({
              node: { id: ruleCollectionId }
            });
            // Re-check with the updated product collections
            const updatedProductCollectionIds = product.collections.edges.map((edge: any) => 
              edge.node.id.replace('gid://shopify/Collection/', '')
            );
            const updatedMatchingRule = plan.rules.find((rule) => {
              const ruleId = rule.categoryId.replace('gid://shopify/Collection/', '');
              return updatedProductCollectionIds.includes(ruleId);
            });
            if (updatedMatchingRule) {
              percentOff = updatedMatchingRule.percentOff;
              console.log('Found matching rule after update:', updatedMatchingRule);
            }
          }
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
        } : null,
        message: "Test data with price 150.00"
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error('Test price lookup error:', error);
    return json(
      { error: "Failed to process price lookup", details: (error as Error).message },
      { status: 500 }
    );
  }
}; 