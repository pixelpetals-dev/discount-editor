import { PrismaClient } from "@prisma/client";

export type StorefrontOffer = {
  discountApplicable: boolean;
  segmentName?: string;
  planName?: string;
  collections?: {
    id: string;
    name: string;
    percentOff: number;
  }[];
  highestDiscountRate?: number;
};

export async function getSegmentOfferForCustomer(
  shop: string,
  accessToken: string,
  customerGid: string, // e.g. "gid://shopify/Customer/123..."
  prisma: PrismaClient
): Promise<StorefrontOffer> {
  try {
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
      return { discountApplicable: false };
    }

    const segmentIds = customerWithSegments.customerSegments.map(
      (cs: any) => cs.segment.id
    );
    if (segmentIds.length === 0) {
      return { discountApplicable: false };
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
      return { discountApplicable: false };
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
      return { discountApplicable: false };
    }

    // 5. Build collection list (dedupe by categoryId, keep highest percentOff per collection)
    const ruleMap: Record<string, number> = {};
    bestPlan.rules.forEach((rule: any) => {
      const existing = ruleMap[rule.categoryId];
      if (existing == null || rule.percentOff > existing) {
        ruleMap[rule.categoryId] = rule.percentOff;
      }
    });

    const collectionGids = Object.keys(ruleMap);

    // 6. Fetch collection metadata in one GraphQL request (aliasing each)
    const collectionQueryFields = collectionGids
      .map((gid, idx) => {
        return `
          col${idx}: collection(id: "${gid}") {
            id
            title
            handle
          }
        `;
      })
      .join("\n");

    const collectionsQuery = `#graphql
      query getCollections {
        ${collectionQueryFields}
      }
    `;

    const collResp = await fetch(`https://${shop}/admin/api/2024-04/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({ query: collectionsQuery })
    });

    const collJson = await collResp.json();
    if (collJson.errors) {
      console.warn("Failed to fetch collection metadata", collJson.errors);
      // Return simplified response with just the collection IDs and discount rates
      const fallbackCollections = collectionGids.map((gid) => ({
        id: gid,
        name: `Collection ${gid.split('/').pop()}`, // Extract ID from GID
        percentOff: ruleMap[gid]
      }));
      return {
        discountApplicable: true,
        segmentName: bestPlan.targetKey,
        planName: bestPlan.name,
        collections: fallbackCollections,
        highestDiscountRate: bestPlanMaxPercent
      };
    }

    // 7. Assemble final collections array with simplified structure
    const collections = collectionGids
      .map((gid, idx) => {
        const alias = `col${idx}`;
        const data = collJson.data?.[alias];
        return {
          id: gid,
          name: data?.title || `Collection ${gid.split('/').pop()}`,
          percentOff: ruleMap[gid]
        };
      })
      .filter((c: any) => c);

    return {
      discountApplicable: true,
      segmentName: bestPlan.targetKey,
      planName: bestPlan.name,
      collections,
      highestDiscountRate: bestPlanMaxPercent
    };
  } catch (error) {
    console.error("Error in getSegmentOfferForCustomer:", error);
    // Return a safe fallback response
    return { discountApplicable: false };
  }
} 