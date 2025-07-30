import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { addCorsHeaders, handleCorsPreflight } from "../utils/cors";

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  try {
    const { admin } = await authenticate.admin(request);
    const { queryType, filters = {}, limit = 50 } = await request.json();

    if (!queryType) {
      return addCorsHeaders(json({ 
        error: "queryType is required. Available types: products, customers, orders, collections, variants, inventory" 
      }, { status: 400 }));
    }

    let query = "";
    let variables = {};

    switch (queryType) {
      case "products":
        query = `
          query getProducts($first: Int!, $after: String, $query: String) {
            products(first: $first, after: $after, query: $query) {
              edges {
                node {
                  id
                  title
                  handle
                  description
                  status
                  vendor
                  productType
                  tags
                  createdAt
                  updatedAt
                  publishedAt
                  totalInventory
                  variants(first: 10) {
                    edges {
                      node {
                        id
                        title
                        sku
                        barcode
                        price
                        compareAtPrice
                        inventoryQuantity
                        weight
                        weightUnit
                        availableForSale
                        requiresShipping
                        taxable
                      }
                    }
                  }
                  images(first: 10) {
                    edges {
                      node {
                        id
                        url
                        altText
                        width
                        height
                      }
                    }
                  }
                  collections(first: 10) {
                    edges {
                      node {
                        id
                        title
                        handle
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
            }
          }
        `;
        variables = {
          first: limit,
          after: filters.after || null,
          query: filters.query || null
        };
        break;

      case "customers":
        query = `
          query getCustomers($first: Int!, $after: String, $query: String) {
            customers(first: $first, after: $after, query: $query) {
              edges {
                node {
                  id
                  firstName
                  lastName
                  email
                  phone
                  acceptsMarketing
                  createdAt
                  updatedAt
                  ordersCount
                  totalSpent
                  defaultAddress {
                    id
                    address1
                    address2
                    city
                    province
                    country
                    zip
                    phone
                  }
                  addresses {
                    id
                    address1
                    address2
                    city
                    province
                    country
                    zip
                    phone
                  }
                  tags
                  note
                  verifiedEmail
                  state
                }
              }
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
            }
          }
        `;
        variables = {
          first: limit,
          after: filters.after || null,
          query: filters.query || null
        };
        break;

      case "orders":
        query = `
          query getOrders($first: Int!, $after: String, $query: String) {
            orders(first: $first, after: $after, query: $query) {
              edges {
                node {
                  id
                  name
                  email
                  phone
                  createdAt
                  updatedAt
                  processedAt
                  cancelledAt
                  cancelReason
                  financialStatus
                  fulfillmentStatus
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
                  customer {
                    id
                    firstName
                    lastName
                    email
                  }
                  lineItems(first: 50) {
                    edges {
                      node {
                        id
                        title
                        quantity
                        variant {
                          id
                          title
                          sku
                          price
                        }
                        originalTotalSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                        discountedTotalSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                  tags
                  note
                }
              }
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
            }
          }
        `;
        variables = {
          first: limit,
          after: filters.after || null,
          query: filters.query || null
        };
        break;

      case "collections":
        query = `
          query getCollections($first: Int!, $after: String) {
            collections(first: $first, after: $after) {
              edges {
                node {
                  id
                  title
                  handle
                  description
                  updatedAt
                  productsCount
                  image {
                    id
                    url
                    altText
                  }
                  products(first: 10) {
                    edges {
                      node {
                        id
                        title
                        handle
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
            }
          }
        `;
        variables = {
          first: limit,
          after: filters.after || null
        };
        break;

      case "variants":
        query = `
          query getProductVariants($first: Int!, $after: String, $query: String) {
            productVariants(first: $first, after: $after, query: $query) {
              edges {
                node {
                  id
                  title
                  sku
                  barcode
                  price
                  compareAtPrice
                  inventoryQuantity
                  weight
                  weightUnit
                  availableForSale
                  requiresShipping
                  taxable
                  product {
                    id
                    title
                    handle
                  }
                  image {
                    id
                    url
                    altText
                  }
                }
              }
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
            }
          }
        `;
        variables = {
          first: limit,
          after: filters.after || null,
          query: filters.query || null
        };
        break;

      case "inventory":
        query = `
          query getInventoryItems($first: Int!, $after: String, $query: String) {
            inventoryItems(first: $first, after: $after, query: $query) {
              edges {
                node {
                  id
                  sku
                  tracked
                  createdAt
                  updatedAt
                  countryCodeOfOrigin
                  provinceCodeOfOrigin
                  harmonizedSystemCode
                  countryHarmonizedSystemCodes {
                    edges {
                      node {
                        countryCode
                        harmonizedSystemCode
                      }
                    }
                  }
                  inventoryLevels(first: 10) {
                    edges {
                      node {
                        id
                        available
                        location {
                          id
                          name
                        }
                      }
                    }
                  }
                  variant {
                    id
                    title
                    price
                    product {
                      id
                      title
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
            }
          }
        `;
        variables = {
          first: limit,
          after: filters.after || null,
          query: filters.query || null
        };
        break;

      default:
        return addCorsHeaders(json({ 
          error: `Invalid queryType: ${queryType}. Available types: products, customers, orders, collections, variants, inventory` 
        }, { status: 400 }));
    }

    const response = await admin.graphql(query, { variables });
    const data = await response.json() as any;

    if (data.errors) {
      return addCorsHeaders(json({ 
        error: "GraphQL query failed", 
        details: data.errors 
      }, { status: 500 }));
    }

    // Extract the data based on query type
    const resultKey = Object.keys(data.data)[0];
    const result = data.data[resultKey];

    return addCorsHeaders(json({
      success: true,
      queryType,
      data: result.edges.map((edge: any) => edge.node),
      pageInfo: result.pageInfo,
      totalCount: result.edges.length
    }));

  } catch (error) {
    console.error("Error fetching Shopify data:", error);
    return addCorsHeaders(json({ 
      error: "Failed to fetch data from Shopify",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 }));
  }
}

// Handle GET requests for documentation
export async function loader({ request }: ActionFunctionArgs) {
  return addCorsHeaders(json({ 
    message: "This endpoint accepts POST requests to fetch Shopify data",
    availableQueryTypes: [
      "products",
      "customers", 
      "orders",
      "collections",
      "variants",
      "inventory"
    ],
    examples: {
      products: {
        method: "POST",
        body: {
          queryType: "products",
          limit: 20,
          filters: {
            query: "title:*shirt*",
            after: null
          }
        }
      },
      customers: {
        method: "POST", 
        body: {
          queryType: "customers",
          limit: 10,
          filters: {
            query: "email:*@gmail.com",
            after: null
          }
        }
      },
      orders: {
        method: "POST",
        body: {
          queryType: "orders", 
          limit: 25,
          filters: {
            query: "created_at:>=2024-01-01",
            after: null
          }
        }
      }
    }
  }));
} 