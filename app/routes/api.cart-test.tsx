import { json, type ActionFunctionArgs } from "@remix-run/node";
import { addCorsHeaders, handleCorsPreflight } from "../utils/cors";

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  try {
    const data = await request.json();
    
    // Log the received data for debugging
    console.log('📦 Received cart data:', JSON.stringify(data, null, 2));
    
    // Extract cart data
    const { customerId, cart, lineItems, discountRate } = data;
    
    // Handle both direct lineItems and cart data
    let finalLineItems = lineItems;
    let finalDiscountRate = discountRate;

    if (cart && cart.items && Array.isArray(cart.items)) {
      // Extract line items from cart
      finalLineItems = cart.items.map((item: any) => ({
        variantId: item.variant_id || item.variantId,
        quantity: item.quantity,
        originalPrice: item.price || item.original_price
      }));
      
      // Use cart discount if available
      if (cart.total_discount && cart.original_total_price) {
        finalDiscountRate = Math.round((cart.total_discount / cart.original_total_price) * 100);
      }
    }

    return addCorsHeaders(json({
      success: true,
      message: "Cart data processed successfully",
      receivedData: data,
      processedData: {
        customerId,
        finalLineItems,
        finalDiscountRate,
        cartProcessed: !!cart,
        lineItemsCount: finalLineItems?.length || 0
      },
      timestamp: new Date().toISOString()
    }));
    
  } catch (error) {
    console.error('❌ Error processing cart data:', error);
    return addCorsHeaders(json({
      success: false,
      error: "Failed to process cart data",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 400 }));
  }
}

export async function loader({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  return addCorsHeaders(json({
    success: true,
    message: "Cart test endpoint is working",
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