import { redirect } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { addCorsHeaders, handleCorsPreflight } from "../utils/cors";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  try {
    const data = await request.json();
    console.log('📦 Creating real draft order with data:', JSON.stringify(data, null, 2));
    
    const { customerId, cart, lineItems, discountRate } = data;
    
    // Handle both direct lineItems and cart data
    let finalLineItems = lineItems;
    let finalDiscountRate = discountRate;

    // If we have cart data, use it to build line items
    if (cart && cart.items && Array.isArray(cart.items)) {
      finalLineItems = cart.items.map((item: any) => ({
        variantId: item.variant_id || item.variantId,
        quantity: item.quantity,
        originalPrice: item.price || item.original_price
      }));
      
      if (cart.total_discount && cart.original_total_price) {
        finalDiscountRate = Math.round((cart.total_discount / cart.original_total_price) * 100);
      }
    }

    // If we have direct lineItems, use them
    if (lineItems && Array.isArray(lineItems)) {
      finalLineItems = lineItems.map((item: any) => ({
        variantId: item.variantId || item.variant_id,
        quantity: item.quantity,
        originalPrice: item.originalPrice || item.price
      }));
    }

    // Validate required data
    if (!finalLineItems || finalLineItems.length === 0) {
      return addCorsHeaders(json({
        success: false,
        error: "No line items provided",
        details: "Please provide cart items or line items"
      }, { status: 400 }));
    }

    // Create real draft order with Shopify admin API
    const { admin } = await authenticate.admin(request);
    
    // Prepare line items for GraphQL
    const graphqlLineItems = finalLineItems.map((item: any) => {
      const lineItem = `{
        variantId: "${item.variantId}",
        quantity: ${item.quantity}
      }`;
      
      // Add discount if available
      if (finalDiscountRate && finalDiscountRate > 0) {
        return `{
          variantId: "${item.variantId}",
          quantity: ${item.quantity},
          appliedDiscount: {
            value: "${finalDiscountRate}",
            valueType: PERCENTAGE,
            title: "Auto Discount"
          }
        }`;
      }
      
      return lineItem;
    }).join(',');

    // Create draft order with Shopify GraphQL API
    // If customerId is null, we'll create a draft order without a customer
    const customerIdPart = customerId ? `customerId: "${customerId}",` : '';
    
    const response = await admin.graphql(`
      mutation {
        draftOrderCreate(input: {
          ${customerIdPart}
          lineItems: [${graphqlLineItems}],
          useCustomerDefaultAddress: ${customerId ? 'true' : 'false'}
        }) {
          draftOrder {
            id
            invoiceUrl
            status
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            note
            createdAt
            updatedAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `);

    const result = await response.json();
    
    if (result.data?.draftOrderCreate?.userErrors?.length > 0) {
      console.error('❌ Shopify API errors:', result.data.draftOrderCreate.userErrors);
      return addCorsHeaders(json({
        success: false,
        error: "Failed to create draft order",
        details: result.data.draftOrderCreate.userErrors
      }, { status: 400 }));
    }

    const draftOrder = result.data?.draftOrderCreate?.draftOrder;
    
    if (draftOrder) {
      console.log('✅ Real draft order created:', draftOrder.invoiceUrl);
      return addCorsHeaders(json({
        success: true,
        message: "Real draft order created successfully",
        url: draftOrder.invoiceUrl,
        draftOrder: {
          id: draftOrder.id,
          invoiceUrl: draftOrder.invoiceUrl,
          status: draftOrder.status,
          totalPrice: draftOrder.totalPriceSet?.shopMoney?.amount || "0.00",
          subtotalPrice: draftOrder.subtotalPriceSet?.shopMoney?.amount || "0.00",
          totalTax: draftOrder.totalTaxSet?.shopMoney?.amount || "0.00",
          currency: draftOrder.totalPriceSet?.shopMoney?.currencyCode || "USD",
          note: draftOrder.note,
          createdAt: draftOrder.createdAt,
          updatedAt: draftOrder.updatedAt
        },
        processedData: {
          customerId,
          finalLineItems,
          finalDiscountRate,
          cartProcessed: !!cart,
          lineItemsCount: finalLineItems?.length || 0
        },
        timestamp: new Date().toISOString()
      }));
    } else {
      throw new Error('No draft order returned from Shopify API');
    }
    
  } catch (error) {
    console.error('❌ Error creating draft order:', error);
    return addCorsHeaders(json({
      success: false,
      error: "Failed to create draft order",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 400 }));
  }
}

export async function loader({ request }: ActionFunctionArgs) {
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  return addCorsHeaders(json({
    success: true,
    message: "App draft order endpoint is working",
    timestamp: new Date().toISOString(),
    testInstructions: {
      method: "POST",
      body: {
        customerId: "gid://shopify/Customer/123456789",
        cart: {
          items: [
            {
              variant_id: "gid://shopify/ProductVariant/987654321",
              quantity: 2,
              price: "29.99"
            }
          ],
          original_total_price: 5998,
          total_discount: 0
        }
      }
    }
  }));
} 