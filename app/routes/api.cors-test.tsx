import { json, type ActionFunctionArgs } from "@remix-run/node";
import { addCorsHeaders, handleCorsPreflight } from "../utils/cors";

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) return corsResponse;

  try {
    const data = await request.json();
    
    return addCorsHeaders(json({
      success: true,
      message: "CORS test successful",
      receivedData: data,
      timestamp: new Date().toISOString(),
      headers: Object.fromEntries(request.headers.entries())
    }));
  } catch (error) {
    return addCorsHeaders(json({
      success: false,
      error: "Failed to parse request data",
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
    message: "CORS test endpoint is working",
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    testInstructions: {
      method: "POST",
      body: {
        test: "data",
        message: "Hello from frontend"
      }
    }
  }));
} 