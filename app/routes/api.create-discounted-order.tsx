import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { addCorsHeaders, handleCorsPreflight } from "../utils/cors";

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  try {
    const { admin } = await authenticate.admin(request);
    const data = await request.json();
    const { customerId, productIds, quantities = {} } = data;

    if (!customerId || !productIds || !Array.isArray(productIds)) {
      return addCorsHeaders(json({ 
        error: "Missing required fields: customerId and productIds array are required" 
      }, { status: 400 }));
    }

    // Step 1: Calculate discounts using our discount calculation logic
    const discountCalculationResponse = await fetch(`${new URL(request.url).origin}/api/calculate-discount`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('Authorization') || ''
      },
      body: JSON.stringify({ customerId, productIds })
    });

    const discountData = await discountCalculationResponse.json();

    if (!discountData.success) {
      return addCorsHeaders(json({ 
        error: "Failed to calculate discounts", 
        details: discountData.error 
      }, { status: 400 }));
    }

    // Step 2: Prepare line items for draft order
    const lineItems = discountData.products.map((product: any) => {
      const quantity = quantities[product.productId] || 1;
      const discountRate = product.discountRate;
      
      return {
        variantId: product.variantId,
        quantity: quantity,
        originalPrice: product.originalPrice,
        customAttributes: [
          { key: "discount_applied", value: `${discountRate}%` },
          { key: "original_price", value: product.originalPrice },
          { key: "discount_amount", value: product.discountAmount.toString() },
          { key: "applicable_plan", value: product.applicablePlan?.planName || "None" }
        ],
        appliedDiscount: discountRate > 0 ? {
          value: discountRate.toString(),
          valueType: "PERCENTAGE",
          title: `Auto Discount (${product.applicablePlan?.planName || 'Custom'})`
        } : undefined
      };
    });

    // Step 3: Create draft order with calculated discounts
    const draftOrderResponse = await admin.graphql(`
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            invoiceUrl
            status
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            subtotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalDiscountsSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  discountedUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: {
          lineItems: lineItems,
          customerId: customerId,
          useCustomerDefaultAddress: true,
          tags: ["custom-discount-app", "auto-discount"],
          note: `Auto-generated order with ${discountData.summary.totalDiscountRate}% total discount applied`
        }
      }
    });

    const result = await draftOrderResponse.json();

    if (result.data?.draftOrderCreate?.userErrors?.length > 0) {
      const errors = result.data.draftOrderCreate.userErrors;
      return addCorsHeaders(json({ 
        error: "Failed to create draft order", 
        details: errors 
      }, { status: 400 }));
    }

    const draftOrder = result.data?.draftOrderCreate?.draftOrder;
    
    if (!draftOrder) {
      return addCorsHeaders(json({ 
        error: "Failed to create draft order - no response from Shopify" 
      }, { status: 500 }));
    }

    return addCorsHeaders(json({
      success: true,
      draftOrder: {
        id: draftOrder.id,
        invoiceUrl: draftOrder.invoiceUrl,
        status: draftOrder.status,
        totalPrice: draftOrder.totalPriceSet?.shopMoney?.amount,
        subtotalPrice: draftOrder.subtotalPriceSet?.shopMoney?.amount,
        totalDiscounts: draftOrder.totalDiscountsSet?.shopMoney?.amount,
        currency: draftOrder.totalPriceSet?.shopMoney?.currencyCode
      },
      discountSummary: discountData.summary,
      customer: discountData.customer,
      products: discountData.products,
      applicablePlans: discountData.applicablePlans
    }));

  } catch (error) {
    console.error('Error creating discounted order:', error);
    return addCorsHeaders(json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 }));
  }
}

// Handle GET requests for testing
export async function loader({ request }: ActionFunctionArgs) {
  return json({ 
    message: "This endpoint creates draft orders with automatic discount calculation",
    example: {
      method: "POST",
      body: {
        customerId: "gid://shopify/Customer/123456789",
        productIds: ["gid://shopify/Product/987654321", "gid://shopify/Product/111222333"],
        quantities: {
          "gid://shopify/Product/987654321": 2,
          "gid://shopify/Product/111222333": 1
        }
      }
    }
  });
} 