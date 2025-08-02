import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db.server";
import { addCorsHeaders, handleCorsPreflight } from "../utils/cors";

// Handle the preflight OPTIONS request
export async function loader({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) {
    return corsResponse;
  }
  return new Response("Use POST method for this endpoint", {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, ngrok-skip-browser-warning, X-Requested-With",
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Credentials": "true",
    }
  });
}

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) {
    return corsResponse;
  }

  try {
    const body = await request.json();
    console.log('Received request body:', JSON.stringify(body, null, 2));
    
    const { shop, customerId, cartItems } = body;

    if (!shop || !customerId || !cartItems) {
      console.log('Validation failed:', { 
        hasShop: !!shop, 
        hasCustomerId: !!customerId,
        hasCartItems: !!cartItems,
        receivedKeys: Object.keys(body)
      });
      
      const response = json(
        { 
          error: "Missing required fields: shop, customerId, or cartItems",
          received: {
            hasShop: !!shop,
            hasCustomerId: !!customerId,
            hasCartItems: !!cartItems,
            receivedKeys: Object.keys(body)
          }
        },
        { status: 400 }
      );
      return addCorsHeaders(response);
    }

    // Handle different cart formats
    let processedCartItems = [];
    try {
      if (Array.isArray(cartItems)) {
        processedCartItems = cartItems;
      } else if (cartItems && typeof cartItems === 'object') {
        // If cartItems is an object (like Shopify cart), extract items array
        console.log('Processing Shopify cart object format');
        if (cartItems.items && Array.isArray(cartItems.items)) {
          processedCartItems = cartItems.items.map((item: any) => ({
            productId: formatProductId(item.product_id),
            price: (item.price || 0) / 100, // Convert from cents to dollars
            quantity: item.quantity || 1,
            variantId: formatVariantId(item.variant_id), // Fix variant ID format
            title: item.title,
            originalPrice: (item.original_price || 0) / 100,
            finalPrice: (item.final_price || 0) / 100
          }));
          console.log(`Processed ${processedCartItems.length} items from cart`);
        } else {
          console.log('No items array found in cart object');
          const response = json(
            { error: "Invalid cart format. Expected 'items' array in cart object." },
            { status: 400 }
          );
          return addCorsHeaders(response);
        }
      } else {
        console.log('Invalid cartItems format:', typeof cartItems);
        const response = json(
          { error: "Invalid cartItems format. Expected array or object with items array." },
          { status: 400 }
        );
        return addCorsHeaders(response);
      }
    } catch (error) {
      console.error('Error processing cart items:', error);
      const response = json(
        { error: "Failed to process cart items", details: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
      return addCorsHeaders(response);
    }

    console.log('Processed cart items:', processedCartItems);
    console.log('Sample productId format:', processedCartItems[0]?.productId);
    console.log('Sample variantId format:', processedCartItems[0]?.variantId);

    // Validate that we have items to process
    if (!processedCartItems || processedCartItems.length === 0) {
      console.log('No items found in cart');
      const response = json(
        { error: "No items found in cart. Please add products to your cart." },
        { status: 400 }
      );
      return addCorsHeaders(response);
    }

    // 1. Get access token for the shop
    const session = await prisma.session.findFirst({ 
      where: { shop },
      orderBy: { expires: 'desc' }
    });
    
    if (!session) {
      const response = json(
        { error: "No session found for this shop. Please ensure the app is properly installed." },
        { status: 401 }
      );
      return addCorsHeaders(response);
    }

    const accessToken = session.accessToken;
    console.log('Processing discount check for:', { shop, customerId, cartItemsCount: processedCartItems.length });

    // 2. Fetch customer details and their tags
    const customerData = await fetchCustomerData(shop, accessToken, customerId);
    if (!customerData) {
      const response = json(
        { error: "Customer not found" },
        { status: 404 }
      );
      return addCorsHeaders(response);
    }

    console.log('Customer tags:', customerData.tags);

    // 3. Fetch all segments from Shopify
    const segments = await fetchSegments(shop, accessToken);
    if (!segments) {
      const response = json(
        { error: "Failed to fetch segments" },
        { status: 500 }
      );
      return addCorsHeaders(response);
    }

    console.log('Available segments:', segments.map((s: { id: string; name: string }) => ({ name: s.name, id: s.id })));

    // 4. Find matching segment for customer tags
    const matchedSegment = segments.find((segment: { id: string; name: string }) => customerData.tags.includes(segment.name));
    if (!matchedSegment) {
      console.log('No matching segment found. Customer tags:', customerData.tags, 'Available segments:', segments.map((s: { id: string; name: string }) => s.name));
      const response = json({
        discountApplicable: false,
        message: "Customer does not belong to any segment with discount plans",
        debug: {
          customerTags: customerData.tags,
          availableSegments: segments.map((s: { id: string; name: string }) => s.name)
        }
      });
      return addCorsHeaders(response);
    }

    console.log('Found matching segment:', matchedSegment.name);

    // 5. Get discount plan for this segment
    console.log('Looking for discount plan with targetKey:', matchedSegment.id);
    console.log('Also trying with segment name:', matchedSegment.name);
    
    // Try to find discount plan by segment ID first, then by segment name
    let discountPlan = await prisma.discountPlan.findFirst({
      where: {
        targetType: "segment",
        targetKey: matchedSegment.id
      },
      include: { rules: true }
    });
    
    // If not found by ID, try by segment name
    if (!discountPlan) {
      console.log('Not found by segment ID, trying by segment name:', matchedSegment.name);
      discountPlan = await prisma.discountPlan.findFirst({
        where: {
          targetType: "segment",
          targetKey: matchedSegment.name
        },
        include: { rules: true }
      });
    }

    if (!discountPlan || discountPlan.rules.length === 0) {
      console.log('No discount plan found for segment:', matchedSegment.name, 'targetKey:', matchedSegment.id);
      
      // Let's also check what discount plans exist in the database
      const allDiscountPlans = await prisma.discountPlan.findMany({
        where: { targetType: "segment" },
        select: { name: true, targetKey: true, rules: { select: { categoryId: true, percentOff: true } } }
      });
      console.log('All discount plans in DB:', allDiscountPlans);
      
      const response = json({
        discountApplicable: false,
        message: "No discount plan found for this segment",
        debug: {
          segmentName: matchedSegment.name,
          segmentId: matchedSegment.id,
          searchedTargetKeys: [matchedSegment.id, matchedSegment.name],
          allDiscountPlans: allDiscountPlans
        }
      });
      return addCorsHeaders(response);
    }

    console.log('Found discount plan:', discountPlan.name, 'with', discountPlan.rules.length, 'rules');

    // 6. Process cart items against discount rules
    const applicableDiscounts = [];
    let totalOriginalPrice = 0;
    let totalDiscountAmount = 0;

    for (const cartItem of processedCartItems) {
      const { productId, price, quantity = 1, title } = cartItem;
      const itemTotalPrice = price * quantity;
      totalOriginalPrice += itemTotalPrice;

      console.log(`\n--- Checking product: ${title} (${productId}) ---`);
      console.log(`Price: $${price}, Quantity: ${quantity}, Total: $${itemTotalPrice}`);

      // Check if this product belongs to any discounted collection
      let bestDiscount = null;
      let bestPercentOff = 0;

      for (const rule of discountPlan.rules) {
        console.log(`Checking rule: ${rule.categoryId} with ${rule.percentOff}% off`);
        const productBelongsToCollection = await checkProductInCollection(shop, accessToken, productId, rule.categoryId);
        console.log(`Product belongs to collection: ${productBelongsToCollection}`);
        
        if (productBelongsToCollection && rule.percentOff > bestPercentOff) {
          bestPercentOff = rule.percentOff;
          bestDiscount = rule;
          console.log(`✅ Found better discount: ${rule.percentOff}% off`);
        }
      }

      if (bestDiscount) {
        const discountAmount = (itemTotalPrice * bestPercentOff) / 100;
        const discountedPrice = itemTotalPrice - discountAmount;
        totalDiscountAmount += discountAmount;

        applicableDiscounts.push({
          productId,
          collectionId: bestDiscount.categoryId,
          percentOff: bestPercentOff,
          originalPrice: itemTotalPrice,
          discountedPrice,
          discountAmount
        });
      }
    }

    // 7. If discounts are applicable, create draft order automatically
    if (applicableDiscounts.length > 0) {
      console.log('✅ Discounts found! Creating draft order with discounts...');
      
      try {
        const draftOrderResult = await createDraftOrder(shop, accessToken, customerId, processedCartItems, applicableDiscounts);
        
        if (draftOrderResult.success && draftOrderResult.draftOrder) {
          return addCorsHeaders(json({
            success: true,
            isDraft: true,
            message: "Draft order created successfully with discounts applied",
            draftOrderUrl: draftOrderResult.draftOrder.invoiceUrl,
            draftOrder: draftOrderResult.draftOrder,
            discountSummary: {
              discountApplicable: true,
              segment: matchedSegment.name,
              planName: discountPlan.name,
              totalOriginalPrice,
              totalDiscountAmount,
              totalDiscountedPrice: totalOriginalPrice - totalDiscountAmount,
              savingsPercentage: totalOriginalPrice > 0 ? (totalDiscountAmount / totalOriginalPrice) * 100 : 0,
              applicableDiscounts,
              summary: {
                itemsWithDiscount: applicableDiscounts.length,
                totalItems: processedCartItems.length,
                highestDiscountRate: Math.max(...applicableDiscounts.map(d => d.percentOff))
              }
            }
          }));
        } else {
          console.error('❌ Failed to create draft order with discounts:', draftOrderResult.error);
          console.error('Full error details:', draftOrderResult.details);
          return addCorsHeaders(json({
            success: false,
            error: "Discount found but failed to create draft order",
            details: draftOrderResult.error,
            graphqlErrors: draftOrderResult.details
          }, { status: 500 }));
        }
      } catch (draftError) {
        console.error('❌ Error creating draft order:', draftError);
        return addCorsHeaders(json({
          success: false,
          error: "Discount found but failed to create draft order",
          details: draftError instanceof Error ? draftError.message : "Unknown error"
        }, { status: 500 }));
      }
    } else {
      // No discounts applicable
      const response = json({
        discountApplicable: false,
        segment: matchedSegment.name,
        planName: discountPlan.name,
        totalOriginalPrice,
        totalDiscountAmount,
        totalDiscountedPrice: totalOriginalPrice - totalDiscountAmount,
        savingsPercentage: totalOriginalPrice > 0 ? (totalDiscountAmount / totalOriginalPrice) * 100 : 0,
        applicableDiscounts,
        summary: {
          itemsWithDiscount: applicableDiscounts.length,
          totalItems: processedCartItems.length,
          highestDiscountRate: 0
        }
      });
      return addCorsHeaders(response);
    }

  } catch (error) {
    console.error("Error in check-segment-discount:", error);
    const response = json(
      { error: "Internal error while checking segment discount", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
    return addCorsHeaders(response);
  }
}

// Helper function to create draft order
async function createDraftOrder(shop: string, accessToken: string, customerId: string, processedCartItems: any[], applicableDiscounts: any[]) {
  try {
    console.log('Creating draft order with GraphQL...');
    console.log('Shop:', shop);
    console.log('Original Customer ID:', customerId);
    
    // Format customer ID for GraphQL
    const formattedCustomerId = formatCustomerId(customerId);
    console.log('Formatted Customer ID:', formattedCustomerId);
    
    console.log('Processed cart items:', JSON.stringify(processedCartItems, null, 2));
    console.log('Applicable discounts:', JSON.stringify(applicableDiscounts, null, 2));
    
    // Prepare line items for GraphQL with discounts
    const lineItems = processedCartItems.map((item: any) => {
      const discount = applicableDiscounts.find(d => d.productId === item.productId);
      
      const lineItem: any = {
        variantId: item.variantId,
        quantity: item.quantity
      };
      
      // Only add discount if there is one
      if (discount && discount.percentOff > 0) {
        lineItem.appliedDiscount = {
          value: discount.percentOff,
          valueType: "PERCENTAGE",
          title: "Segment Discount",
          description: `${discount.percentOff}% off for segment members`
        };
      }
      
      return lineItem;
    });

    console.log('Creating draft order with line items:', JSON.stringify(lineItems, null, 2));

    // Create draft order with proper GraphQL mutation format
    const graphqlQuery = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            status
            subtotalPriceSet { 
              shopMoney { 
                amount 
                currencyCode 
              } 
            }
            totalPriceSet { 
              shopMoney { 
                amount 
                currencyCode 
              } 
            }
            totalTaxSet { 
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
            createdAt
            updatedAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const variables = {
      input: {
        customerId: formattedCustomerId,
        lineItems: lineItems
      }
    };
    
    console.log('GraphQL Query:', graphqlQuery);
    console.log('GraphQL Variables:', JSON.stringify(variables, null, 2));
    
    const response = await fetch(`https://${shop}/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: graphqlQuery,
        variables: variables
      })
    });

    const responseText = await response.text();
    console.log('Raw GraphQL Response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse GraphQL response:', parseError);
      return {
        success: false,
        error: "Invalid JSON response from Shopify",
        details: responseText
      };
    }
    
    console.log('Parsed GraphQL Response:', JSON.stringify(result, null, 2));
    
    // Check for GraphQL errors
    if (result.errors && result.errors.length > 0) {
      console.error('❌ GraphQL errors:', result.errors);
      return {
        success: false,
        error: "GraphQL errors occurred",
        details: result.errors
      };
    }
    
    // Check for user errors
    if (result.data?.draftOrderCreate?.userErrors?.length > 0) {
      const userErrors = result.data.draftOrderCreate.userErrors;
      console.error('❌ Shopify API user errors:', userErrors);
      
      // Format user errors for better debugging
      const formattedErrors = userErrors.map((err: any) => ({
        field: err.field,
        message: err.message
      }));
      
      return {
        success: false,
        error: "Shopify API validation errors",
        details: formattedErrors
      };
    }

    const draftOrder = result.data?.draftOrderCreate?.draftOrder;
    
    if (draftOrder) {
      console.log('✅ Draft order created successfully:', draftOrder);
      return {
        success: true,
        draftOrder: {
          id: draftOrder.id,
          name: draftOrder.name,
          invoiceUrl: draftOrder.invoiceUrl,
          status: draftOrder.status,
          totalPrice: draftOrder.totalPriceSet?.shopMoney?.amount || "0.00",
          subtotalPrice: draftOrder.subtotalPriceSet?.shopMoney?.amount || "0.00",
          totalTax: draftOrder.totalTaxSet?.shopMoney?.amount || "0.00",
          totalDiscounts: draftOrder.totalDiscountsSet?.shopMoney?.amount || "0.00",
          currency: draftOrder.totalPriceSet?.shopMoney?.currencyCode || "INR",
          createdAt: draftOrder.createdAt,
          updatedAt: draftOrder.updatedAt
        }
      };
    } else {
      console.error('❌ No draft order returned from Shopify API');
      console.error('Full response:', result);
      return {
        success: false,
        error: "No draft order returned from Shopify API",
        details: result
      };
    }
  } catch (error) {
    console.error('❌ Error creating draft order:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      details: error
    };
  }
}

// Helper function to format product ID for GraphQL
function formatProductId(productId: string | number): string {
  if (typeof productId === 'number') {
    return `gid://shopify/Product/${productId}`;
  }
  if (typeof productId === 'string') {
    // If it's already in GraphQL format, return as is
    if (productId.startsWith('gid://shopify/Product/')) {
      return productId;
    }
    // If it's just a number as string, format it
    if (/^\d+$/.test(productId)) {
      return `gid://shopify/Product/${productId}`;
    }
    // If it contains the GraphQL format path, extract and reformat
    if (productId.includes('gid://shopify/Product/')) {
      const match = productId.match(/gid:\/\/shopify\/Product\/(\d+)/);
      if (match) {
        return `gid://shopify/Product/${match[1]}`;
      }
    }
  }
  return `gid://shopify/Product/${productId}`;
}

// Helper function to format variant ID for GraphQL
function formatVariantId(variantId: string | number): string {
  // If variantId is already a string with GraphQL format
  if (typeof variantId === 'string' && variantId.startsWith('gid://shopify/ProductVariant/')) {
    return variantId;
  }
  
  // If it's a number or numeric string, format it
  const numericId = typeof variantId === 'string' ? variantId.replace(/\D/g, '') : variantId.toString();
  return `gid://shopify/ProductVariant/${numericId}`;
}

// Helper function to format customer ID for GraphQL
function formatCustomerId(customerId: string): string {
  // If it's already in GraphQL format, return as is
  if (customerId.startsWith('gid://shopify/Customer/')) {
    return customerId;
  }
  // Extract numeric ID and format
  const numericId = customerId.replace(/\D/g, '');
  return `gid://shopify/Customer/${numericId}`;
}

// Helper function to fetch customer data
async function fetchCustomerData(shop: string, accessToken: string, customerId: string) {
  try {
    const formattedCustomerId = formatCustomerId(customerId);
    
    const response = await fetch(`https://${shop}/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: `#graphql
          query getCustomer($customerId: ID!) {
            customer(id: $customerId) {
              id
              tags
            }
          }`,
        variables: {
          customerId: formattedCustomerId
        }
      })
    });

    const data = await response.json();
    
    if (data.errors) {
      console.error('GraphQL errors fetching customer:', data.errors);
      return null;
    }

    return data.data.customer;
  } catch (error) {
    console.error('Error fetching customer data:', error);
    return null;
  }
}

// Helper function to fetch segments
async function fetchSegments(shop: string, accessToken: string) {
  try {
    const response = await fetch(`https://${shop}/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: `#graphql
          query getSegments($first: Int!) {
            segments(first: $first) {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }`,
        variables: { first: 50 }
      })
    });

    const data = await response.json();
    
    if (data.errors) {
      console.error('GraphQL errors fetching segments:', data.errors);
      return null;
    }

    return data.data.segments.edges.map((edge: { node: { id: string; name: string } }) => edge.node);
  } catch (error) {
    console.error('Error fetching segments:', error);
    return null;
  }
}

// Helper function to check if a product belongs to a collection
async function checkProductInCollection(shop: string, accessToken: string, productId: string, collectionId: string): Promise<boolean> {
  try {
    console.log('Checking if product', productId, 'belongs to collection', collectionId);

    const response = await fetch(`https://${shop}/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: `#graphql
          query checkProductInCollection($productId: ID!) {
            product(id: $productId) {
              collections(first: 250) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }`,
        variables: {
          productId: productId
        }
      })
    });

    const data = await response.json();
    
    if (data.errors) {
      console.error('GraphQL errors checking product collection:', data.errors);
      return false;
    }

    const productCollections = data.data.product.collections.edges.map((edge: { node: { id: string } }) => edge.node.id);
    return productCollections.includes(collectionId);
  } catch (error) {
    console.error('Error checking product in collection:', error);
    return false;
  }
}