import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { prisma } from "../db.server";
import { addCorsHeaders, handleCorsPreflight } from "../utils/cors";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    let customerData: string;
    const contentType = request.headers.get("content-type") || "";

    // Handle both form data and JSON requests
    if (contentType.includes("application/json")) {
      const body = await request.json();
      customerData = body.customerData;
    } else {
      const formData = await request.formData();
      customerData = formData.get("customerData") as string;
    }
    
    if (!customerData) {
      const response = json({ 
        error: "customerData is required" 
      }, { status: 400 });
      return addCorsHeaders(response, request);
    }

    // Parse customer object
    let customer;
    try {
      customer = JSON.parse(customerData);
    } catch (error) {
      const response = json({ 
        error: "Invalid JSON in customerData" 
      }, { status: 400 });
      return addCorsHeaders(response, request);
    }

    // Validate customer object
    if (!customer.id || !customer.tags) {
      const response = json({ 
        error: "Customer object must contain id and tags" 
      }, { status: 400 });
      return addCorsHeaders(response, request);
    }

    // Convert customer ID to GID format if needed
    const customerGid = customer.id.toString().startsWith("gid://") 
      ? customer.id.toString() 
      : `gid://shopify/Customer/${customer.id}`;

    // 1. Normalize customer ID (strip prefix if needed)
    const customerNumericId = customerGid.replace("gid://shopify/Customer/", "");

    // 2. Fetch segments this customer belongs to via Prisma
    const customerWithSegments = await prisma.customer.findUnique({
      where: { id: customerNumericId },
      include: {
        customerSegments: {
          include: {
            segment: true
          }
        }
      }
    });

    if (!customerWithSegments) {
      const response = json({ 
        success: true,
        offer: { discountApplicable: false },
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          tags: customer.tags
        }
      });
      return addCorsHeaders(response, request);
    }

    const segmentIds = customerWithSegments.customerSegments.map(
      (cs: any) => cs.segment.id
    );
    if (segmentIds.length === 0) {
      const response = json({ 
        success: true,
        offer: { discountApplicable: false },
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          tags: customer.tags
        }
      });
      return addCorsHeaders(response, request);
    }

    // 3. Fetch discount plans for those segments
    const discountPlans = await prisma.discountPlan.findMany({
      where: {
        targetType: "segment",
        targetKey: { in: segmentIds }
      },
      include: {
        rules: true
      }
    });

    if (!discountPlans || discountPlans.length === 0) {
      const response = json({ 
        success: true,
        offer: { discountApplicable: false },
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          tags: customer.tags
        }
      });
      return addCorsHeaders(response, request);
    }

    // 4. Choose best plan by highest single rule percentOff
    let bestPlan: any = null;
    let bestPlanMaxPercent = 0;

    for (const plan of discountPlans) {
      const planMax = plan.rules.reduce(
        (max: number, r: any) => Math.max(max, r.percentOff),
        0
      );
      if (planMax > bestPlanMaxPercent) {
        bestPlanMaxPercent = planMax;
        bestPlan = plan;
      }
    }

    if (!bestPlan || !bestPlan.rules || bestPlan.rules.length === 0) {
      const response = json({ 
        success: true,
        offer: { discountApplicable: false },
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          tags: customer.tags
        }
      });
      return addCorsHeaders(response, request);
    }

    // 5. Build collection list (dedupe by categoryId, keep highest percentOff per collection)
    const ruleMap: Record<string, number> = {};
    bestPlan.rules.forEach((rule: any) => {
      const existing = ruleMap[rule.categoryId];
      if (existing == null || rule.percentOff > existing) {
        ruleMap[rule.categoryId] = rule.percentOff;
      }
    });

    const collectionIds = Object.keys(ruleMap);

    // Return simplified response with numeric collection IDs
    const collections = collectionIds.map((collectionId) => {
      // Handle both numeric IDs and GID formats
      let numericId = collectionId;
      if (collectionId.startsWith("gid://shopify/Collection/")) {
        numericId = collectionId.replace("gid://shopify/Collection/", "");
      }
      
      return {
        id: numericId, // Return just the numeric ID
        name: `Collection ${numericId}`,
        percentOff: ruleMap[collectionId]
      };
    });

    const offer = {
      discountApplicable: true,
      segmentName: bestPlan.targetKey,
      planName: bestPlan.name,
      collections,
      highestDiscountRate: bestPlanMaxPercent
    };

    const response = json({ 
      success: true,
      offer,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        tags: customer.tags
      }
    });
    return addCorsHeaders(response, request);

  } catch (error) {
    console.error("Error in simple test segment offer endpoint:", error);
    const response = json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
    return addCorsHeaders(response, request);
  }
};

// Also support GET requests for testing
export const loader = async ({ request }: ActionFunctionArgs) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    const url = new URL(request.url);
    const customerData = url.searchParams.get("customerData");
    
    if (!customerData) {
      const response = json({ 
        error: "customerData query parameter is required" 
      }, { status: 400 });
      return addCorsHeaders(response, request);
    }

    // Parse customer object
    let customer;
    try {
      customer = JSON.parse(customerData);
    } catch (error) {
      const response = json({ 
        error: "Invalid JSON in customerData" 
      }, { status: 400 });
      return addCorsHeaders(response, request);
    }

    // Validate customer object
    if (!customer.id || !customer.tags) {
      const response = json({ 
        error: "Customer object must contain id and tags" 
      }, { status: 400 });
      return addCorsHeaders(response, request);
    }

    // Convert customer ID to GID format if needed
    const customerGid = customer.id.toString().startsWith("gid://") 
      ? customer.id.toString() 
      : `gid://shopify/Customer/${customer.id}`;

    // 1. Normalize customer ID (strip prefix if needed)
    const customerNumericId = customerGid.replace("gid://shopify/Customer/", "");

    // 2. Fetch segments this customer belongs to via Prisma
    const customerWithSegments = await prisma.customer.findUnique({
      where: { id: customerNumericId },
      include: {
        customerSegments: {
          include: {
            segment: true
          }
        }
      }
    });

    if (!customerWithSegments) {
      const response = json({ 
        success: true,
        offer: { discountApplicable: false },
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          tags: customer.tags
        }
      });
      return addCorsHeaders(response, request);
    }

    const segmentIds = customerWithSegments.customerSegments.map(
      (cs: any) => cs.segment.id
    );
    if (segmentIds.length === 0) {
      const response = json({ 
        success: true,
        offer: { discountApplicable: false },
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          tags: customer.tags
        }
      });
      return addCorsHeaders(response, request);
    }

    // 3. Fetch discount plans for those segments
    const discountPlans = await prisma.discountPlan.findMany({
      where: {
        targetType: "segment",
        targetKey: { in: segmentIds }
      },
      include: {
        rules: true
      }
    });

    if (!discountPlans || discountPlans.length === 0) {
      const response = json({ 
        success: true,
        offer: { discountApplicable: false },
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          tags: customer.tags
        }
      });
      return addCorsHeaders(response, request);
    }

    // 4. Choose best plan by highest single rule percentOff
    let bestPlan: any = null;
    let bestPlanMaxPercent = 0;

    for (const plan of discountPlans) {
      const planMax = plan.rules.reduce(
        (max: number, r: any) => Math.max(max, r.percentOff),
        0
      );
      if (planMax > bestPlanMaxPercent) {
        bestPlanMaxPercent = planMax;
        bestPlan = plan;
      }
    }

    if (!bestPlan || !bestPlan.rules || bestPlan.rules.length === 0) {
      const response = json({ 
        success: true,
        offer: { discountApplicable: false },
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          tags: customer.tags
        }
      });
      return addCorsHeaders(response, request);
    }

    // 5. Build collection list (dedupe by categoryId, keep highest percentOff per collection)
    const ruleMap: Record<string, number> = {};
    bestPlan.rules.forEach((rule: any) => {
      const existing = ruleMap[rule.categoryId];
      if (existing == null || rule.percentOff > existing) {
        ruleMap[rule.categoryId] = rule.percentOff;
      }
    });

    const collectionIds = Object.keys(ruleMap);

    // Return simplified response with numeric collection IDs
    const collections = collectionIds.map((collectionId) => {
      // Handle both numeric IDs and GID formats
      let numericId = collectionId;
      if (collectionId.startsWith("gid://shopify/Collection/")) {
        numericId = collectionId.replace("gid://shopify/Collection/", "");
      }
      
      return {
        id: numericId, // Return just the numeric ID
        name: `Collection ${numericId}`,
        percentOff: ruleMap[collectionId]
      };
    });

    const offer = {
      discountApplicable: true,
      segmentName: bestPlan.targetKey,
      planName: bestPlan.name,
      collections,
      highestDiscountRate: bestPlanMaxPercent
    };

    const response = json({ 
      success: true,
      offer,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        tags: customer.tags
      }
    });
    return addCorsHeaders(response, request);

  } catch (error) {
    console.error("Error in simple test segment offer endpoint:", error);
    const response = json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
    return addCorsHeaders(response, request);
  }
}; 