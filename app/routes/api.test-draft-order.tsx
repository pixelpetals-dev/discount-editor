import { json, type ActionFunctionArgs } from "@remix-run/node";
import { addCorsHeaders, handleCorsPreflight } from "../utils/cors";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  try {
    console.log('🧪 Testing draft order creation...');
    
    // Test authentication
    let admin;
    try {
      const auth = await authenticate.admin(request);
      admin = auth.admin;
      console.log('✅ Authentication successful');
    } catch (authError) {
      console.error('❌ Authentication failed:', authError);
      return addCorsHeaders(json({
        success: false,
        error: "Authentication failed",
        details: authError instanceof Error ? authError.message : "Unknown auth error"
      }, { status: 401 }));
    }

    // Test simple GraphQL query
    try {
      const response = await admin.graphql(`
        query {
          shop {
            name
            myshopifyDomain
          }
        }
      `);
      
      const result = await response.json();
      console.log('✅ Shop query successful:', result);
      
      return addCorsHeaders(json({
        success: true,
        message: "Authentication and GraphQL working",
        shop: result.data?.shop,
        timestamp: new Date().toISOString()
      }));
      
    } catch (graphqlError) {
      console.error('❌ GraphQL query failed:', graphqlError);
      return addCorsHeaders(json({
        success: false,
        error: "GraphQL query failed",
        details: graphqlError instanceof Error ? graphqlError.message : "Unknown GraphQL error"
      }, { status: 500 }));
    }
    
  } catch (error) {
    console.error('❌ General error:', error);
    return addCorsHeaders(json({
      success: false,
      error: "General error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 }));
  }
}

export async function loader({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  return addCorsHeaders(json({
    success: true,
    message: "Draft order test endpoint is working",
    timestamp: new Date().toISOString(),
    testInstructions: {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    }
  }));
} 