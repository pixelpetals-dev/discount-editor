import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { prisma } from "../db.server";
import { addCorsHeaders, handleCorsPreflight } from "../utils/cors";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    let customerData: string;
    let storeUrl = '';
    const contentType = request.headers.get("content-type") || "";

    // Handle both form data and JSON requests
    if (contentType.includes("application/json")) {
      const body = await request.json();
      customerData = body.customerData;
      storeUrl = body.storeUrl || '';
    } else {
      const formData = await request.formData();
      customerData = formData.get("customerData") as string;
      storeUrl = formData.get("storeUrl") as string || '';
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

    // 1. Find segments that match the customer's tags
    const customerTags = customer.tags.map((tag: string) => tag.toLowerCase());
    
    console.log('🔍 API Debug - Customer tags:', customerTags);
    
    // We need to get segments from Shopify to match customer tags with segment names
    // For now, we'll use a fallback approach since we can't access Shopify API from external requests
    // The segment names should match the customer tags (case-insensitive)
    
    // Try to find discount plans where targetKey might be the segment name or ID
    // First, try exact tag matching
    let discountPlans = await prisma.discountPlan.findMany({
      where: {
        targetType: "segment",
        targetKey: { in: customerTags }
      },
      include: {
        rules: true
      }
    });

    console.log('🔍 API Debug - Exact match found:', discountPlans.length, 'plans');

    // If no exact matches, try with common segment ID patterns
    if (discountPlans.length === 0) {
      // Try with GID format (segment IDs from Shopify)
      const segmentGids = customerTags.map((tag: string) => {
        // Convert tag to potential segment ID format
        // This is a fallback - ideally we'd have the actual segment mapping
        return `gid://shopify/Segment/${tag}`;
      });
      
      console.log('🔍 API Debug - Trying GID format:', segmentGids);
      
      discountPlans = await prisma.discountPlan.findMany({
        where: {
          targetType: "segment",
          targetKey: { in: segmentGids }
        },
        include: {
          rules: true
        }
      });
      
      console.log('🔍 API Debug - GID format found:', discountPlans.length, 'plans');
    }

    // If still no matches, try with uppercase tags
    if (discountPlans.length === 0) {
      const upperCaseTags = customerTags.map((tag: string) => tag.toUpperCase());
      console.log('🔍 API Debug - Trying uppercase:', upperCaseTags);
      
      discountPlans = await prisma.discountPlan.findMany({
        where: {
          targetType: "segment",
          targetKey: { in: upperCaseTags }
        },
        include: {
          rules: true
        }
      });
      
      console.log('🔍 API Debug - Uppercase found:', discountPlans.length, 'plans');
    }

    // If still no matches, try with capitalized tags (first letter uppercase)
    if (discountPlans.length === 0) {
      const capitalizedTags = customerTags.map((tag: string) => 
        tag.charAt(0).toUpperCase() + tag.slice(1)
      );
      console.log('🔍 API Debug - Trying capitalized:', capitalizedTags);
      
      discountPlans = await prisma.discountPlan.findMany({
        where: {
          targetType: "segment",
          targetKey: { in: capitalizedTags }
        },
        include: {
          rules: true
        }
      });
      
      console.log('🔍 API Debug - Capitalized found:', discountPlans.length, 'plans');
    }

    // If still no matches, try extracting numeric IDs from GID format in targetKey
    if (discountPlans.length === 0) {
      console.log('🔍 API Debug - Trying GID contains match...');
      
      // Get all segment discount plans and check if any contain the customer tag in their GID
      const allSegmentPlans = await prisma.discountPlan.findMany({
        where: {
          targetType: "segment"
        },
        include: {
          rules: true
        }
      });
      
      console.log('🔍 API Debug - All segment plans:', allSegmentPlans.map(p => ({ name: p.name, targetKey: p.targetKey })));
      
      // Filter plans where the GID contains the customer tag (case-insensitive)
      discountPlans = allSegmentPlans.filter((plan: any) => {
        const targetKey = plan.targetKey.toLowerCase();
        const hasMatch = customerTags.some((tag: string) => targetKey.includes(tag));
        console.log(`🔍 API Debug - Checking plan "${plan.name}": targetKey="${targetKey}", customerTags=${customerTags}, hasMatch=${hasMatch}`);
        return hasMatch;
      });
      
      console.log('🔍 API Debug - GID contains match found:', discountPlans.length, 'plans');
    }

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

    // 2. Choose best plan by highest single rule percentOff
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

    // 3. Build collection list (dedupe by categoryId, keep highest percentOff per collection)
    const ruleMap: Record<string, number> = {};
    bestPlan.rules.forEach((rule: any) => {
      const existing = ruleMap[rule.categoryId];
      if (existing == null || rule.percentOff > existing) {
        ruleMap[rule.categoryId] = rule.percentOff;
      }
    });

    const collectionIds = Object.keys(ruleMap);

    // Fetch collection details from Shopify (only if we have admin access)
    let collections = [];
    try {
      // Try to get admin access, but don't fail if we can't
      let admin = null;
      try {
        const authResult = await authenticate.admin(request);
        admin = authResult.admin;
      } catch (authError) {
        console.log('🔍 API Debug - No admin access, using fallback collection names');
      }
      
      // Only fetch collection details if we have admin access OR store URL
      if ((admin && admin.graphql) || storeUrl) {
        // Build GraphQL query to fetch collection details
        const collectionIdsForQuery = collectionIds.map(id => {
          // Handle both numeric IDs and GID formats
          let numericId = id;
          if (id.startsWith("gid://shopify/Collection/")) {
            numericId = id.replace("gid://shopify/Collection/", "");
          }
          return `gid://shopify/Collection/${numericId}`;
        });

        const query = `
          query getCollections($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on Collection {
                id
                title
                handle
              }
            }
          }
        `;

        let response;
        if (admin && admin.graphql) {
          // Use admin access if available
          response = await admin.graphql(query, {
            variables: {
              ids: collectionIdsForQuery
            }
          });
        } else if (storeUrl) {
          // Use store URL to fetch collection details
          console.log('🔍 API Debug - Using store URL to fetch collections:', storeUrl);
          
          try {
            // Try to fetch collection details using the store's public API
            const collectionPromises = collectionIds.map(async (collectionId) => {
              let numericId = collectionId;
              if (collectionId.startsWith("gid://shopify/Collection/")) {
                numericId = collectionId.replace("gid://shopify/Collection/", "");
              }
              
              console.log(`🔍 API Debug - Processing collection ID: ${collectionId}, numeric ID: ${numericId}`);
              
              // Try to fetch collection details from the store's public API
              try {
                console.log(`🔍 API Debug - Fetching from: ${storeUrl}/collections.json`);
                const collectionResponse = await fetch(`${storeUrl}/collections.json`);
                const collectionsData = await collectionResponse.json();
                
                console.log(`🔍 API Debug - Found ${collectionsData.collections?.length || 0} collections in store`);
                
                // Find the collection by ID
                const collection = collectionsData.collections?.find((c: any) => {
                  const match = c.id.toString() === numericId || c.id.toString() === collectionId;
                  console.log(`🔍 API Debug - Checking collection ${c.id} (${c.title}) against ${numericId}: ${match}`);
                  return match;
                });
                
                if (collection) {
                  console.log(`🔍 API Debug - Found collection: ${collection.title} (${collection.handle})`);
                  return {
                    id: numericId,
                    title: collection.title,
                    name: collection.title,
                    handle: collection.handle,
                    percentOff: ruleMap[collectionId]
                  };
                } else {
                  console.log(`🔍 API Debug - Collection ${numericId} not found in store`);
                }
              } catch (fetchError) {
                console.log(`🔍 API Debug - Could not fetch collection ${numericId} from store API:`, fetchError);
              }
              
              // Fallback to basic data
              console.log(`🔍 API Debug - Using fallback for collection ${numericId}`);
              return {
                id: numericId,
                title: `Collection ${numericId}`,
                name: `Collection ${numericId}`,
                handle: '',
                percentOff: ruleMap[collectionId]
              };
            });
            
            const collectionsWithDetails = await Promise.all(collectionPromises);
            console.log('🔍 API Debug - Final collections with details:', collectionsWithDetails);
            
            response = { 
              json: async () => ({ 
                data: { 
                  nodes: collectionsWithDetails.map(c => ({
                    id: `gid://shopify/Collection/${c.id}`,
                    title: c.title,
                    handle: c.handle
                  }))
                } 
              }) 
            };
          } catch (error) {
            console.log('🔍 API Debug - Error fetching collections from store API:', error);
            response = { json: async () => ({ data: { nodes: [] } }) };
          }
        } else {
          // Fallback response
          response = { json: async () => ({ data: { nodes: [] } }) };
        }

        const responseJson = await response.json();
        console.log('🔍 API Debug - Shopify collections response:', responseJson);

        // Create a map of collection ID to details
        const collectionMap: Record<string, any> = {};
        responseJson.data.nodes.forEach((node: any) => {
          if (node && node.id) {
            const numericId = node.id.replace("gid://shopify/Collection/", "");
            collectionMap[numericId] = node;
            collectionMap[node.id] = node; // Also map the full GID
          }
        });

        // Build collections array with real data
        collections = collectionIds.map((collectionId) => {
          // Handle both numeric IDs and GID formats
          let numericId = collectionId;
          if (collectionId.startsWith("gid://shopify/Collection/")) {
            numericId = collectionId.replace("gid://shopify/Collection/", "");
          }
          
          const collectionData = collectionMap[numericId] || collectionMap[collectionId];
          
          return {
            id: numericId,
            title: collectionData?.title || `Collection ${numericId}`,
            name: collectionData?.title || `Collection ${numericId}`,
            handle: collectionData?.handle || '',
            percentOff: ruleMap[collectionId]
          };
        });
      } else {
        // Fallback to basic collection data when no admin access
        collections = collectionIds.map((collectionId) => {
          let numericId = collectionId;
          if (collectionId.startsWith("gid://shopify/Collection/")) {
            numericId = collectionId.replace("gid://shopify/Collection/", "");
          }
          
          return {
            id: numericId,
            title: `Collection ${numericId}`,
            name: `Collection ${numericId}`,
            handle: '',
            percentOff: ruleMap[collectionId]
          };
        });
             }

     } catch (error) {
       console.error('🔍 API Debug - Error fetching collection details:', error);
       
       // Fallback to basic collection data
       collections = collectionIds.map((collectionId) => {
         let numericId = collectionId;
         if (collectionId.startsWith("gid://shopify/Collection/")) {
           numericId = collectionId.replace("gid://shopify/Collection/", "");
         }
         
         return {
           id: numericId,
           title: `Collection ${numericId}`,
           name: `Collection ${numericId}`,
           handle: '',
           percentOff: ruleMap[collectionId]
         };
       });
     }

    // Find the matching customer tag for the segment name
    const matchingTag = customerTags.find((tag: string) => 
      bestPlan.targetKey.toLowerCase().includes(tag) || 
      tag.includes(bestPlan.targetKey.toLowerCase())
    );

    const offer = {
      discountApplicable: true,
      segmentName: matchingTag || bestPlan.targetKey, // Use matching tag or targetKey
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
    console.error("Error in segment offer endpoint:", error);
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

    // 1. Find segments that match the customer's tags
    const customerTags = customer.tags.map((tag: string) => tag.toLowerCase());
    
    console.log('🔍 API Debug - Customer tags:', customerTags);
    
    // We need to get segments from Shopify to match customer tags with segment names
    // For now, we'll use a fallback approach since we can't access Shopify API from external requests
    // The segment names should match the customer tags (case-insensitive)
    
    // Try to find discount plans where targetKey might be the segment name or ID
    // First, try exact tag matching
    let discountPlans = await prisma.discountPlan.findMany({
      where: {
        targetType: "segment",
        targetKey: { in: customerTags }
      },
      include: {
        rules: true
      }
    });

    console.log('🔍 API Debug - Exact match found:', discountPlans.length, 'plans');

    // If no exact matches, try with common segment ID patterns
    if (discountPlans.length === 0) {
      // Try with GID format (segment IDs from Shopify)
      const segmentGids = customerTags.map((tag: string) => {
        // Convert tag to potential segment ID format
        // This is a fallback - ideally we'd have the actual segment mapping
        return `gid://shopify/Segment/${tag}`;
      });
      
      console.log('🔍 API Debug - Trying GID format:', segmentGids);
      
      discountPlans = await prisma.discountPlan.findMany({
        where: {
          targetType: "segment",
          targetKey: { in: segmentGids }
        },
        include: {
          rules: true
        }
      });
      
      console.log('🔍 API Debug - GID format found:', discountPlans.length, 'plans');
    }

    // If still no matches, try with uppercase tags
    if (discountPlans.length === 0) {
      const upperCaseTags = customerTags.map((tag: string) => tag.toUpperCase());
      console.log('🔍 API Debug - Trying uppercase:', upperCaseTags);
      
      discountPlans = await prisma.discountPlan.findMany({
        where: {
          targetType: "segment",
          targetKey: { in: upperCaseTags }
        },
        include: {
          rules: true
        }
      });
      
      console.log('🔍 API Debug - Uppercase found:', discountPlans.length, 'plans');
    }

    // If still no matches, try with capitalized tags (first letter uppercase)
    if (discountPlans.length === 0) {
      const capitalizedTags = customerTags.map((tag: string) => 
        tag.charAt(0).toUpperCase() + tag.slice(1)
      );
      console.log('🔍 API Debug - Trying capitalized:', capitalizedTags);
      
      discountPlans = await prisma.discountPlan.findMany({
        where: {
          targetType: "segment",
          targetKey: { in: capitalizedTags }
        },
        include: {
          rules: true
        }
      });
      
      console.log('🔍 API Debug - Capitalized found:', discountPlans.length, 'plans');
    }

    // If still no matches, try extracting numeric IDs from GID format in targetKey
    if (discountPlans.length === 0) {
      console.log('🔍 API Debug - Trying GID contains match...');
      
      // Get all segment discount plans and check if any contain the customer tag in their GID
      const allSegmentPlans = await prisma.discountPlan.findMany({
        where: {
          targetType: "segment"
        },
        include: {
          rules: true
        }
      });
      
      console.log('🔍 API Debug - All segment plans:', allSegmentPlans.map(p => ({ name: p.name, targetKey: p.targetKey })));
      
      // Filter plans where the GID contains the customer tag (case-insensitive)
      discountPlans = allSegmentPlans.filter((plan: any) => {
        const targetKey = plan.targetKey.toLowerCase();
        const hasMatch = customerTags.some((tag: string) => targetKey.includes(tag));
        console.log(`🔍 API Debug - Checking plan "${plan.name}": targetKey="${targetKey}", customerTags=${customerTags}, hasMatch=${hasMatch}`);
        return hasMatch;
      });
      
      console.log('🔍 API Debug - GID contains match found:', discountPlans.length, 'plans');
    }

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

    // 2. Choose best plan by highest single rule percentOff
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

    // 3. Build collection list (dedupe by categoryId, keep highest percentOff per collection)
    const ruleMap: Record<string, number> = {};
    bestPlan.rules.forEach((rule: any) => {
      const existing = ruleMap[rule.categoryId];
      if (existing == null || rule.percentOff > existing) {
        ruleMap[rule.categoryId] = rule.percentOff;
      }
    });

    const collectionIds = Object.keys(ruleMap);

    // Fetch collection details from Shopify
    let collections = [];
    try {
      const { admin } = await authenticate.admin(request);
      
      // Build GraphQL query to fetch collection details
      const collectionIdsForQuery = collectionIds.map(id => {
        // Handle both numeric IDs and GID formats
        let numericId = id;
        if (id.startsWith("gid://shopify/Collection/")) {
          numericId = id.replace("gid://shopify/Collection/", "");
        }
        return `gid://shopify/Collection/${numericId}`;
      });

      const query = `
        query getCollections($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Collection {
              id
              title
              handle
              productsCount
            }
          }
        }
      `;

      const response = await admin.graphql(query, {
        variables: {
          ids: collectionIdsForQuery
        }
      });

      const responseJson = await response.json();
      console.log('🔍 API Debug - Shopify collections response:', responseJson);

      // Create a map of collection ID to details
      const collectionMap: Record<string, any> = {};
      responseJson.data.nodes.forEach((node: any) => {
        if (node && node.id) {
          const numericId = node.id.replace("gid://shopify/Collection/", "");
          collectionMap[numericId] = node;
          collectionMap[node.id] = node; // Also map the full GID
        }
      });

      // Build collections array with real data
      collections = collectionIds.map((collectionId) => {
        // Handle both numeric IDs and GID formats
        let numericId = collectionId;
        if (collectionId.startsWith("gid://shopify/Collection/")) {
          numericId = collectionId.replace("gid://shopify/Collection/", "");
        }
        
        const collectionData = collectionMap[numericId] || collectionMap[collectionId];
        
        return {
          id: numericId,
          title: collectionData?.title || `Collection ${numericId}`,
          name: collectionData?.title || `Collection ${numericId}`,
          handle: collectionData?.handle || '',
          percentOff: ruleMap[collectionId]
        };
      });

    } catch (error) {
      console.error('🔍 API Debug - Error fetching collection details:', error);
      
      // Fallback to basic collection data
      collections = collectionIds.map((collectionId) => {
        let numericId = collectionId;
        if (collectionId.startsWith("gid://shopify/Collection/")) {
          numericId = collectionId.replace("gid://shopify/Collection/", "");
        }
        
        return {
          id: numericId,
          title: `Collection ${numericId}`,
          name: `Collection ${numericId}`,
          handle: '',
          percentOff: ruleMap[collectionId]
        };
      });
    }

    // Find the matching customer tag for the segment name
    const matchingTag = customerTags.find((tag: string) => 
      bestPlan.targetKey.toLowerCase().includes(tag) || 
      tag.includes(bestPlan.targetKey.toLowerCase())
    );

    const offer = {
      discountApplicable: true,
      segmentName: matchingTag || bestPlan.targetKey, // Use matching tag or targetKey
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
    console.error("Error in segment offer endpoint:", error);
    const response = json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
    return addCorsHeaders(response, request);
  }
}; 