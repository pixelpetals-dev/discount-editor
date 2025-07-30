import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from '../db.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const segment = url.searchParams.get("segment");

  if (!segment) {
    return json({ error: "segment parameter is required" }, { status: 400 });
  }

  try {
    // Find the active discount plan for this segment
    const plan = await prisma.discountPlan.findFirst({
      where: { targetType: "segment", targetKey: segment },
      include: { rules: true },
    });

    if (!plan) {
      return json({ 
        error: `No discount plan found for segment: ${segment}`,
        availableSegments: ["vip", "gold", "silver", "bronze"]
      });
    }

    return json({
      plan: {
        id: plan.id,
        name: plan.name,
        targetType: plan.targetType,
        targetKey: plan.targetKey,
        rules: plan.rules.map(rule => ({
          id: rule.id,
          categoryId: rule.categoryId,
          percentOff: rule.percentOff,
          // Extract just the ID part for easier reading
          collectionId: rule.categoryId.replace('gid://shopify/Collection/', '')
        }))
      }
    });
  } catch (error) {
    console.error('Debug rule error:', error);
    return json(
      { error: "Failed to fetch discount plan", details: (error as Error).message },
      { status: 500 }
    );
  }
}; 