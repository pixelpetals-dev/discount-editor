Given a customerId and shop credentials,

Looks up which segments the customer belongs to,

Finds the applicable discount plan(s) for those segment(s),

Collects the rules (i.e., collection IDs + percentOff),

Resolves the collection titles/handles from Shopify in one batch GraphQL call,

Returns a normalized “offer” object suitable for the marquee or draft-order logic.

Assumptions / Strategy
CustomerSegment links customer ↔ segment.

DiscountPlan.targetType === "segment" and targetKey stores the Segment.id.

If the customer is in multiple segments with discount plans, this picks the single best plan by highest highestPercentOff (you can tweak to combine or prioritize differently).

Collection metadata (title/handle) is fetched from Shopify so the front end doesn’t need extra lookups.

Helper function (TypeScript)
ts
Copy
Edit
// types you can refine / extract
type OfferCollection = {
  id: string; // gid://shopify/Collection/...
  title: string;
  handle: string;
  percentOff: number;
};

type SegmentOffer = {
  discountApplicable: boolean;
  segment?: string;
  planName?: string;
  collections?: OfferCollection[];
  highestDiscountRate?: number;
};

async function getSegmentOfferForCustomer(
  shop: string,
  accessToken: string,
  customerGid: string, // e.g. "gid://shopify/Customer/123..."
  prisma: typeof import("@prisma/client").PrismaClient
): Promise<SegmentOffer> {
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

  // 4. Choose best plan: e.g., highest single rule percentOff (you can refine)
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

  const collectionGids = Object.keys(ruleMap); // e.g., ["gid://shopify/Collection/..."]

  // 6. Fetch collection metadata in one GraphQL request
  // Build a dynamic GraphQL query to fetch multiple collections by aliasing
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
    // Proceed with fallback: return only IDs and percentOff
    const fallbackCollections: OfferCollection[] = collectionGids.map((gid) => ({
      id: gid,
      title: "",
      handle: "",
      percentOff: ruleMap[gid]
    }));
    return {
      discountApplicable: true,
      segment: bestPlan.targetKey,
      planName: bestPlan.name,
      collections: fallbackCollections,
      highestDiscountRate: bestPlanMaxPercent
    };
  }

  // 7. Assemble final collections array
  const collections: OfferCollection[] = collectionGids
    .map((gid, idx) => {
      const alias = `col${idx}`;
      const data = collJson.data?.[alias];
      return {
        id: gid,
        title: data?.title || "",
        handle: data?.handle || "",
        percentOff: ruleMap[gid]
      };
    })
    .filter((c: any) => c); // safety

  return {
    discountApplicable: true,
    segment: bestPlan.targetKey, // optionally resolve to human name if you store one
    planName: bestPlan.name,
    collections,
    highestDiscountRate: bestPlanMaxPercent
  };
}
Example response shape your frontend can consume:
json
Copy
Edit
{
  "discountApplicable": true,
  "segment": "Vip",
  "planName": "VIP Discount Plan",
  "collections": [
    {
      "id": "gid://shopify/Collection/123",
      "title": "Drills",
      "handle": "drills",
      "percentOff": 15
    },
    {
      "id": "gid://shopify/Collection/456",
      "title": "Tools",
      "handle": "tools",
      "percentOff": 10
    }
  ],
  "highestDiscountRate": 15
}
4. Integration points
Marquee frontend: Use the returned collections array to build the message (as in previous snippet).

Draft order logic: Use highestDiscountRate per item (matching by collection membership) to decide which line items receive which discount.

Segment name resolution: If segment in your schema is an ID and you want a display name, you can join the Segment model to fetch a name property (you might need to add a name field to Segment if not present).

5. Suggestions / improvements
Cache the resolved collection metadata (title/handle) in your own app or a short-lived in-memory store to avoid repeated Shopify GraphQL calls.

Normalize Segment to have a human-friendly name if currently only id exists.

If a customer belongs to multiple segments and you want to combine offers instead of picking one, you can aggregate all matching plans and merge their rules (e.g., per-collection highest percentOff).

Consider adding expiry/versioning to discount plans so front end can know when to invalidate its cached marquee offer.