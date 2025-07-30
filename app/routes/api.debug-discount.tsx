import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
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
  const corsResponse = handleCorsPreflight(request);
  if (corsResponse) {
    return corsResponse;
  }

  try {
    const body = await request.json();
    const { shop } = body;

    if (!shop) {
      const response = json(
        { error: "Missing shop parameter" },
        { status: 400 }
      );
      return addCorsHeaders(response);
    }

    // 1. Get all discount plans from database
    const discountPlans = await prisma.discountPlan.findMany({
      include: { rules: true }
    });

    // 2. Get segments from Shopify
    let segments: Array<{ id: string; name: string; query: string }> = [];
    try {
      const session = await prisma.session.findFirst({ 
        where: { shop },
        orderBy: { expires: 'desc' }
      });
      
      if (!session) {
        const response = json(
          { 
            error: "No session found for this shop",
            discountPlans: discountPlans,
            segments: []
          },
          { status: 401 }
        );
        return addCorsHeaders(response);
      }

      const accessToken = session.accessToken;
      const graphqlUrl = `https://${shop}/admin/api/2024-04/graphql.json`;
      
      const graphqlResponse = await fetch(graphqlUrl, {
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
                    query
                  }
                }
                pageInfo { hasNextPage }
              }
            }`,
          variables: { first: 50 }
        })
      });
      
      const segmentsData = await graphqlResponse.json();
      if (segmentsData.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(segmentsData.errors)}`);
      }
      
      segments = segmentsData.data.segments.edges.map((edge: { node: { id: string; name: string; query: string } }) => edge.node);
    } catch (error) {
      console.error('Error fetching segments:', error);
    }

    // 3. Return debug information
    const response = json({
      shop,
      discountPlans: discountPlans.map(plan => ({
        id: plan.id,
        name: plan.name,
        targetType: plan.targetType,
        targetKey: plan.targetKey,
        rules: plan.rules.map(rule => ({
          categoryId: rule.categoryId,
          percentOff: rule.percentOff
        }))
      })),
      segments: segments.map(segment => ({
        id: segment.id,
        name: segment.name,
        query: segment.query
      })),
      analysis: {
        totalDiscountPlans: discountPlans.length,
        totalSegments: segments.length,
        segmentNames: segments.map(s => s.name),
        discountPlanTargets: discountPlans.map(p => p.targetKey),
        matchingPlans: discountPlans.filter(plan => 
          segments.some(segment => segment.name === plan.targetKey)
        ).map(plan => plan.name)
      }
    });
    return addCorsHeaders(response);
  } catch (error) {
    console.error("Error in debug-discount:", error);
    const response = json(
      { error: "Internal error while debugging" },
      { status: 500 }
    );
    return addCorsHeaders(response);
  }
} 