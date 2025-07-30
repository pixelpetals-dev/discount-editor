import { json, type ActionFunctionArgs } from "@remix-run/node";
import { addCorsHeaders, handleCorsPreflight } from "../utils/cors";
import { prisma } from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  try {
    const data = await request.json();
    console.log('📦 Received comprehensive draft order data:', JSON.stringify(data, null, 2));
    
    const { shop, customerId, cartItems } = data;

    if (!shop || !customerId || !cartItems) {
      return addCorsHeaders(json({
        success: false,
        error: "Missing required fields: shop, customerId, cartItems"
      }, { status: 400 }));
    }

    // 1. Get access token for the shop
    const session = await prisma.session.findFirst({ 
      where: { shop },
      orderBy: { expires: 'desc' }
    });
    
    if (!session) {
      return addCorsHeaders(json({
        success: false,
        error: "No session found for this shop. Please ensure the app is properly installed."
      }, { status: 401 }));
    }

    const accessToken = session.accessToken;
    console.log('Processing comprehensive order for:', { shop, customerId });

    // 2. Process cart items
    let processedCartItems = [];
    if (Array.isArray(cartItems)) {
      processedCartItems = cartItems;
    } else if (cartItems && typeof cartItems === 'object') {
      console.log('Processing Shopify cart object format');
      if (cartItems.items && Array.isArray(cartItems.items)) {
        processedCartItems = cartItems.items.map((item: any) => ({
          productId: `gid://shopify/Product/${item.product_id}`,
          price: (item.price || 0) / 100,
          quantity: item.quantity || 1,
          variantId: item.variant_id,
          title: item.title,
          originalPrice: (item.original_price || 0) / 100,
          finalPrice: (item.final_price || 0) / 100
        }));
        console.log(`Processed ${processedCartItems.length} items from cart`);
      } else {
        return addCorsHeaders(json({
          success: false,
          error: "Invalid cart format. Expected 'items' array in cart object."
        }, { status: 400 }));
      }
    }

    // 3. Fetch customer details and their tags
    const customerData = await fetchCustomerData(shop, accessToken, customerId);
    if (!customerData) {
      return addCorsHeaders(json({
        success: false,
        error: "Customer not found"
      }, { status: 404 }));
    }

    console.log('Customer tags:', customerData.tags);

    // 4. Fetch all segments from Shopify
    const segments = await fetchSegments(shop, accessToken);
    if (!segments) {
      return addCorsHeaders(json({
        success: false,
        error: "Failed to fetch segments"
      }, { status: 500 }));
    }

    // 5. Find matching segment for customer tags
    const matchedSegment = segments.find((segment: { id: string; name: string }) => 
      customerData.tags.includes(segment.name)
    );

    let discountPlan = null;
    let applicableDiscounts = [];
    let totalOriginalPrice = 0;
    let totalDiscountAmount = 0;

    if (matchedSegment) {
      console.log('Found matching segment:', matchedSegment.name);

      // 6. Get discount plan for this segment
      discountPlan = await prisma.discountPlan.findFirst({
        where: {
          targetType: "segment",
          targetKey: matchedSegment.id
        },
        include: { rules: true }
      });

      if (discountPlan && discountPlan.rules.length > 0) {
        console.log('Found discount plan:', discountPlan.name, 'with', discountPlan.rules.length, 'rules');

        // 7. Process cart items against discount rules
        for (const cartItem of processedCartItems) {
          const { productId, price, quantity = 1, title, variantId } = cartItem;
          const itemTotalPrice = price * quantity;
          totalOriginalPrice += itemTotalPrice;

          console.log(`\n--- Checking product: ${title} (${productId}) ---`);
          console.log(`Price: $${price}, Quantity: ${quantity}, Total: $${itemTotalPrice}`);

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
              variantId,
              collectionId: bestDiscount.categoryId,
              percentOff: bestPercentOff,
              originalPrice: itemTotalPrice,
              discountedPrice,
              discountAmount,
              quantity
            });
          }
        }
      }
    }

    // 8. Create draft order with discounts applied using direct GraphQL
    console.log('Creating draft order with direct GraphQL...');
    
    // Prepare line items for GraphQL with discounts
    const lineItems = processedCartItems.map((item: any) => {
      const discount = applicableDiscounts.find(d => d.variantId === item.variantId);
      
      if (discount && discount.percentOff > 0) {
        return {
          variantId: item.variantId,
          quantity: item.quantity,
          appliedDiscount: {
            value: discount.percentOff.toString(),
            valueType: "PERCENTAGE",
            title: "Segment Discount"
          }
        };
      } else {
        return {
          variantId: item.variantId,
          quantity: item.quantity
        };
      }
    });

    console.log('Creating draft order with line items:', JSON.stringify(lineItems, null, 2));

    // Create draft order with proper GraphQL mutation format
    const graphqlQuery = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
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
    `;
    
    const variables = {
      input: {
        customerId: customerId,
        lineItems: lineItems,
        useCustomerDefaultAddress: true,
        note: "Draft order created via segment discount app"
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
    
    const result = await response.json();
    console.log('GraphQL Response:', JSON.stringify(result, null, 2));
    
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
      return addCorsHeaders(json({
        success: true,
        isDraft: true,
        message: "Draft order created successfully with discounts applied",
        draftOrderUrl: draftOrder.invoiceUrl,
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
        discountSummary: {
          discountApplicable: applicableDiscounts.length > 0,
          segment: matchedSegment?.name || null,
          planName: discountPlan?.name || null,
          totalOriginalPrice,
          totalDiscountAmount,
          totalDiscountedPrice: totalOriginalPrice - totalDiscountAmount,
          savingsPercentage: totalOriginalPrice > 0 ? (totalDiscountAmount / totalOriginalPrice) * 100 : 0,
          applicableDiscounts,
          summary: {
            itemsWithDiscount: applicableDiscounts.length,
            totalItems: processedCartItems.length,
            highestDiscountRate: applicableDiscounts.length > 0 ? Math.max(...applicableDiscounts.map(d => d.percentOff)) : 0
          }
        },
        processedData: {
          customerId,
          cartItemsCount: processedCartItems.length,
          discountRulesApplied: discountPlan?.rules.length || 0
        },
        timestamp: new Date().toISOString()
      }));
    } else {
      console.error('❌ No draft order returned from Shopify API');
      console.error('Full response:', result);
      return addCorsHeaders(json({
        success: false,
        error: "No draft order returned from Shopify API",
        details: result
      }, { status: 500 }));
    }
    
  } catch (error) {
    console.error('❌ Error processing comprehensive order:', error);
    return addCorsHeaders(json({
      success: false,
      error: "Failed to process order",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 }));
  }
}

// Helper function to fetch customer data
async function fetchCustomerData(shop: string, accessToken: string, customerId: string) {
  try {
    const customerNumericId = customerId.replace('gid://shopify/Customer/', '');
    
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
          customerId: `gid://shopify/Customer/${customerNumericId}`
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

export async function loader({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  return addCorsHeaders(json({
    success: true,
    message: "Comprehensive draft order endpoint is working",
    timestamp: new Date().toISOString(),
    testInstructions: {
      method: "POST",
      body: {
        shop: "qvk2k1-kq.myshopify.com",
        customerId: "gid://shopify/Customer/123456789",
        cartItems: {
          "note": "",
          "attributes": {},
          "original_total_price": 10200,
          "total_price": 10200,
          "total_discount": 0,
          "total_weight": 1019,
          "item_count": 2,
          "items": [
            {
              "id": 42416559358030,
              "properties": {},
              "quantity": 1,
              "variant_id": "gid://shopify/ProductVariant/42416559358030",
              "key": "42416559358030:f1e6f25e8e08a562dba18597ad0bc55e",
              "title": "METALDUR 3*4*50 2FLUTE BALLNOSE BLACK 55HRC ALTiAN COATED",
              "price": 10000,
              "original_price": 10000,
              "discounted_price": 10000,
              "line_price": 10000,
              "original_line_price": 10000,
              "total_discount": 0,
              "discounts": [],
              "sku": "MD 3*4*50 2FB BLACK 55HRC",
              "grams": 19,
              "vendor": "METALDUR",
              "taxable": true,
              "product_id": 7607985799246,
              "product_has_only_default_variant": true,
              "gift_card": false,
              "final_price": 10000,
              "final_line_price": 10000,
              "url": "/products/metaldur-3-4-50-2flute-ballnose-black-55hrc-altian-coated?variant=42416559358030",
              "featured_image": {
                "aspect_ratio": 1.03,
                "alt": "METALDUR 3*4*50 2FLUTE BALLNOSE BLACK 55HRC ALTiAN COATED",
                "height": 642,
                "url": "//carbiforce.shop/cdn/shop/files/WhatsAppImage2025-06-18at5.01.48PM.jpg?v=1750246339",
                "width": 661
              },
              "image": "//carbiforce.shop/cdn/shop/files/WhatsAppImage2025-06-18at5.01.48PM.jpg?v=1750246339",
              "handle": "metaldur-3-4-50-2flute-ballnose-black-55hrc-altian-coated",
              "requires_shipping": true,
              "product_type": "",
              "product_title": "METALDUR 3*4*50 2FLUTE BALLNOSE BLACK 55HRC ALTiAN COATED",
              "product_description": "The MD 55HRC Endmills are precision-engineered solid carbide tools designed for high-performance milling in materials up to 55HRC hardness. Featuring an advanced ALTiAN (Aluminum Titanium Nitride) coating, these endmills offer superior heat resistance, reduced wear, and extended tool life—ideal for high-speed and dry machining environments.",
              "variant_title": null,
              "variant_options": [
                "Default Title"
              ],
              "options_with_values": [
                {
                  "name": "Title",
                  "value": "Default Title"
                }
              ],
              "line_level_discount_allocations": [],
              "line_level_total_discount": 0
            },
            {
              "id": 42611588923470,
              "properties": {},
              "quantity": 1,
              "variant_id": "gid://shopify/ProductVariant/42611588923470",
              "key": "42611588923470:85d7ef0322b29b9075b238f1cd8665d5",
              "title": "demo44",
              "price": 200,
              "original_price": 200,
              "discounted_price": 200,
              "line_price": 200,
              "original_line_price": 200,
              "total_discount": 0,
              "discounts": [],
              "sku": "demo44",
              "grams": 1000,
              "vendor": "Demo",
              "taxable": true,
              "product_id": 7638315597902,
              "product_has_only_default_variant": true,
              "gift_card": false,
              "final_price": 200,
              "final_line_price": 200,
              "url": "/products/demo44-1?variant=42611588923470",
              "featured_image": {
                "aspect_ratio": 3.219,
                "alt": "demo44",
                "height": 320,
                "url": "//carbiforce.shop/cdn/shop/files/banner_1.jpg?v=1752478585",
                "width": 1030
              },
              "image": "//carbiforce.shop/cdn/shop/files/banner_1.jpg?v=1752478585",
              "handle": "demo44-1",
              "requires_shipping": true,
              "product_type": "inventory",
              "product_title": "demo44",
              "product_description": "",
              "variant_title": null,
              "variant_options": [
                "Default Title"
              ],
              "options_with_values": [
                {
                  "name": "Title",
                  "value": "Default Title"
                }
              ],
              "line_level_discount_allocations": [],
              "line_level_total_discount": 0
            }
          ],
          "requires_shipping": true,
          "currency": "INR",
          "items_subtotal_price": 10200,
          "cart_level_discount_applications": [],
          "checkout_charge_amount": 10200
        }
      }
    }
  }));
} 