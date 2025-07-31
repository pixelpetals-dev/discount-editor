import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader() {
  try {
    const { admin } = await authenticate.admin(new Request("http://localhost"));
    
    console.log("Testing Shopify API calls...");
    
    // Test collections query
    let collectionsResult = null;
    try {
      console.log("Testing collections query...");
      const collectionsResponse = await admin.graphql(`#graphql
        query {
          collections(first: 5) {
            edges {
              node {
                id
                title
                productsCount {
                  count
                }
                description
              }
            }
          }
        }
      `);
      const collectionsData = await collectionsResponse.json();
      console.log("Collections response:", collectionsData);
      collectionsResult = collectionsData;
    } catch (error) {
      console.error("Collections query error:", error);
      collectionsResult = { error: error instanceof Error ? error.message : "Unknown error" };
    }
    
    // Test segments query
    let segmentsResult = null;
    try {
      console.log("Testing segments query...");
      const segmentsResponse = await admin.graphql(`#graphql
        query getSegments($first: Int!) {
          segments(first: $first) {
            edges {
              node {
                id
                name
                query
              }
            }
            pageInfo { hasNextPage }
          }
        }
      `, { variables: { first: 5 } });
      const segmentsData = await segmentsResponse.json();
      console.log("Segments response:", segmentsData);
      segmentsResult = segmentsData;
    } catch (error) {
      console.error("Segments query error:", error);
      segmentsResult = { error: error instanceof Error ? error.message : "Unknown error" };
    }
    
    return json({
      success: true,
      collections: collectionsResult,
      segments: segmentsResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("API test error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 