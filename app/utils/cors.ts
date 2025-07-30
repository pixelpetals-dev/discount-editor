export function addCorsHeaders(response: Response): Response {
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  newResponse.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  newResponse.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, ngrok-skip-browser-warning, X-Requested-With",
  );
  newResponse.headers.set("Access-Control-Max-Age", "86400");
  newResponse.headers.set("Access-Control-Allow-Credentials", "true");

  // Remove X-Frame-Options for embedded apps
  newResponse.headers.delete("X-Frame-Options");

  // Add CSP for embedded apps
  newResponse.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com",
  );

  return newResponse;
}

export function handleCorsPreflight(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, ngrok-skip-browser-warning, X-Requested-With",
        "Access-Control-Max-Age": "86400",
        "Access-Control-Allow-Credentials": "true",
        // Remove X-Frame-Options for embedded apps
        "X-Frame-Options": "",
        // Add CSP for embedded apps
        "Content-Security-Policy":
          "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com",
      },
    });
  }
  return null;
}
