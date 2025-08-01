# Segment Offer Integration Guide

## Purpose

Given a customer ID and shop credentials, this helper:
1. Looks up which segments the customer belongs to.
2. Finds applicable discount plan(s) for those segment(s).
3. Collects the rules (collection IDs + percentOff).
4. Resolves the collection titles/handles from Shopify in a single batched GraphQL call.
5. Returns a normalized “offer” object suitable for:
   - Displaying a personalized marquee on the storefront.
   - Driving draft order logic (applying appropriate discounts).

## Assumptions / Data Model

- `CustomerSegment` links customer ↔ segment.
- `DiscountPlan.targetType === "segment"` and `targetKey` stores the `Segment.id`.
- Each `DiscountPlan` has associated `Rule`s with:
  - `categoryId` (Shopify collection GID)
  - `percentOff`
- If a customer belongs to multiple segments with discount plans, the current logic picks the **single best plan** by highest `percentOff`. This can be customized to merge or prioritize differently.
- Collection metadata (title/handle) is fetched so the frontend does **not** need extra lookups.

## Types

```ts
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
```

## Helper Function

```ts
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
    .filter((c: any) => c);

  return {
    discountApplicable: true,
    segment: bestPlan.targetKey,
    planName: bestPlan.name,
    collections,
    highestDiscountRate: bestPlanMaxPercent
  };
}
```

## Example Response Shape

```json
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
```

## Integration Points

- **Marquee Frontend:**  
  On initial page load, call your backend endpoint with the logged-in customer's ID and shop. Use the returned `collections` and `planName` to build a message like:
  > “You are our VIP customer and have a personal additional discount for Drills, Tools.”

- **Draft Order Logic:**  
  Use `highestDiscountRate` per matching collection (or per-item logic when multiple collections apply) to apply appropriate discounts when creating the draft order.

- **Segment Name Resolution:**  
  If `segment` is just an ID and you want a human-friendly display name, either store a `name` field in the `Segment` model or map it in code.

## Suggestions / Improvements

1. **Caching:** Cache fetched collection metadata (title/handle) for a short duration to avoid repeated Shopify GraphQL calls.  
2. **Multiple Segments:** If a customer is in multiple segments, you could merge their discount rules instead of picking a single “best” plan—e.g., per-collection highest percentOff across all applicable plans.  
3. **Versioning/Expiry:** Add versioning or expiration to discount plans so the frontend can invalidate stale marquee data.  
4. **Fallbacks:** Gracefully fallback on missing data; if collection metadata fails, still show the offer with collection IDs and percentOff.  
5. **Logging and Telemetry:** Log which segment/plan was used for auditing and debugging.

## Next Steps

- Wire this helper into your existing endpoint (e.g., `/api/check-segment-discount`) and return the offer object.  
- On the storefront, fetch the offer early (e.g., as part of a global initialization script), store it in a global JS variable, and render the marquee if `discountApplicable` is true.  
- Enhance the UI to reflect the collections and discount rates dynamically.

