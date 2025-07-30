import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const data = await request.json();
    const { customerId, productIds } = data;

    if (!customerId || !productIds || !Array.isArray(productIds)) {
      return json({ 
        error: "Missing required fields: customerId and productIds array are required" 
      }, { status: 400 });
    }

    // Step 1: Get customer details
    const customerResponse = await admin.graphql(`#graphql
      query getCustomer($customerId: ID!) {
        customer(id: $customerId) {
          id
          email
          tags
        }
      }
    `, {
      variables: { customerId }
    });

    const customerData = await customerResponse.json();
    const customer = customerData.data?.customer;

    if (!customer) {
      return json({ error: "Customer not found" }, { status: 404 });
    }

    // Step 2: Get product details and collections
    const productsResponse = await admin.graphql(`#graphql
      query getProducts($productIds: [ID!]!) {
        nodes(ids: $productIds) {
          ... on Product {
            id
            title
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                }
              }
            }
            collections(first: 10) {
              edges {
                node {
                  id
                  title
                }
              }
            }
          }
        }
      }
    `, {
      variables: { productIds }
    });

    const productsData = await productsResponse.json();
    const products = productsData.data?.nodes?.filter((node: any) => node?.__typename === 'Product') || [];

    // Step 3: Get applicable discount plans (customer-specific and segment-based)
    const discountPlans = await prisma.discountPlan.findMany({
      where: {
        OR: [
          { targetType: "customer", targetKey: customerId },
          { targetType: "segment" } // We'll filter segments based on customer tags
        ]
      },
      include: { rules: true }
    });

    // Filter segment-based plans based on customer tags
    const customerTags = customer.tags || [];
    const applicableSegmentPlans = discountPlans.filter(plan => {
      if (plan.targetType === "customer") return true;
      if (plan.targetType === "segment") {
        // Check if customer has tags that match segment criteria
        // This is a simplified approach - you might want to enhance this logic
        return customerTags.some((tag: string) => 
          plan.targetKey.toLowerCase().includes(tag.toLowerCase())
        );
      }
      return false;
    });

    // Step 4: Calculate applicable discounts for each product
    const productDiscounts = products.map((product: any) => {
      const variant = product.variants.edges[0]?.node;
      if (!variant) return null;

      const productCollections = product.collections.edges.map((edge: any) => edge.node.id);
      
      // Find applicable rules for this product
      const applicableRules = applicableSegmentPlans.flatMap(plan => 
        plan.rules.filter(rule => 
          productCollections.includes(rule.categoryId)
        ).map(rule => ({
          ...rule,
          planName: plan.name,
          planId: plan.id
        }))
      );

      // Get the highest discount rate
      const maxDiscount = applicableRules.length > 0 
        ? Math.max(...applicableRules.map(rule => rule.percentOff))
        : 0;

      const applicableRule = applicableRules.find(rule => rule.percentOff === maxDiscount);

      return {
        productId: product.id,
        productTitle: product.title,
        variantId: variant.id,
        originalPrice: variant.price,
        discountRate: maxDiscount,
        discountAmount: maxDiscount > 0 ? (parseFloat(variant.price) * maxDiscount) / 100 : 0,
        finalPrice: maxDiscount > 0 ? parseFloat(variant.price) * (1 - maxDiscount / 100) : parseFloat(variant.price),
        applicablePlan: applicableRule ? {
          planId: applicableRule.planId,
          planName: applicableRule.planName,
          ruleId: applicableRule.id
        } : null
      };
    }).filter(Boolean);

    // Step 5: Calculate totals
    const totalOriginalPrice = productDiscounts.reduce((sum: number, product: any) => sum + parseFloat(product.originalPrice), 0);
    const totalDiscountAmount = productDiscounts.reduce((sum: number, product: any) => sum + product.discountAmount, 0);
    const totalFinalPrice = productDiscounts.reduce((sum: number, product: any) => sum + product.finalPrice, 0);

    return json({
      success: true,
      customer: {
        id: customer.id,
        email: customer.email,
        tags: customer.tags
      },
      products: productDiscounts,
      summary: {
        totalOriginalPrice: totalOriginalPrice.toFixed(2),
        totalDiscountAmount: totalDiscountAmount.toFixed(2),
        totalFinalPrice: totalFinalPrice.toFixed(2),
        totalDiscountRate: totalOriginalPrice > 0 ? ((totalDiscountAmount / totalOriginalPrice) * 100).toFixed(2) : "0.00"
      },
      applicablePlans: applicableSegmentPlans.map(plan => ({
        id: plan.id,
        name: plan.name,
        targetType: plan.targetType,
        targetKey: plan.targetKey,
        rulesCount: plan.rules.length
      }))
    });

  } catch (error) {
    console.error('Error calculating discount:', error);
    return json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Handle GET requests for testing
export async function loader({ request }: ActionFunctionArgs) {
  return json({ 
    message: "This endpoint accepts POST requests with customerId and productIds",
    example: {
      method: "POST",
      body: {
        customerId: "gid://shopify/Customer/123456789",
        productIds: ["gid://shopify/Product/987654321", "gid://shopify/Product/111222333"]
      }
    }
  });
} 