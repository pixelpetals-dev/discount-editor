import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useSubmit, useActionData, Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import { Page, Card, Button, BlockStack, Text, Layout, InlineStack, TextField, Select, Banner, Spinner } from "@shopify/polaris";
import { prisma } from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  try {
    const { admin } = await authenticate.admin(request);
    console.log("Authentication successful");
    const plans = await prisma.discountPlan.findMany({
      include: { rules: true },
      orderBy: { createdAt: "desc" },
    });

    // Use collections as segments since customer data requires approval
    // Fetch real segments from Shopify
    let segments: Array<{id: string, name: string, query: string}> = [];
    let collections = [];
    try {
      console.log("Starting to fetch collections and segments...");
      
      // Fetch collections
      console.log("Fetching collections...");
      const collectionsResponse = await admin.graphql(`#graphql
        query {
          collections(first: 100) {
            edges {
              node {
                id
                title
                productsCount {
                  count
                }
                description
              }
            }
          }
        }
      `);
      const collectionsData = await collectionsResponse.json();
      console.log("Collections response:", collectionsData);
      
      if ((collectionsData as any).errors) {
        console.error("Collections GraphQL errors:", (collectionsData as any).errors);
        throw new Error(`Collections GraphQL errors: ${JSON.stringify((collectionsData as any).errors)}`);
      }
      
      collections = collectionsData.data.collections.edges.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        productsCount: edge.node.productsCount.count,
        description: edge.node.description,
      }));
      console.log("Collections processed:", collections.length);
      
      // Fetch segments
      console.log("Fetching segments...");
      const segmentsResponse = await admin.graphql(`#graphql
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
        }
      `, { variables: { first: 50 } });
      const segmentsData = await segmentsResponse.json();
      console.log("Segments response:", segmentsData);
      
      if ((segmentsData as any).errors) {
        console.error("Segments GraphQL errors:", (segmentsData as any).errors);
        throw new Error(`Segments GraphQL errors: ${JSON.stringify((segmentsData as any).errors)}`);
      }
      
      segments = segmentsData.data.segments.edges.map((edge: any) => edge.node);
      console.log("Segments processed:", segments.length);
      
    } catch (error) {
      console.error('Error fetching collections or segments:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      collections = [];
      segments = [];
    }
    return json({ plans, segments, collections });
  } catch (error) {
    console.error('Detailed error in loader:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return json({ 
      plans: [], 
      segments: [], 
      collections: [],
      error: `Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "create") {
    const name = formData.get("name") as string;
    const targetType = formData.get("targetType") as string;
    const targetKey = formData.get("targetKey") as string;
    const rules = JSON.parse(formData.get("rules") as string);

    if (!name || !targetKey || !targetType || rules.length === 0) {
      return json({ error: "All fields are required and you must add at least one rule." });
    }

    // Prevent duplicate segment discount plans
    if (targetType === "segment") {
      const existing = await prisma.discountPlan.findFirst({
        where: { targetType: "segment", targetKey },
      });
      if (existing) {
        return json({ error: "A discount plan for this segment already exists." });
      }
    }

    // Create the discount plan first
    const plan = await prisma.discountPlan.create({
      data: {
        id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        targetType,
        targetKey,
        updatedAt: new Date(),
      },
    });

    // Then create the rules
    const createdRules = await Promise.all(
      rules.map((rule: any) =>
        prisma.rule.create({
          data: {
            id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            categoryId: rule.categoryId,
            percentOff: rule.percentOff,
            discountPlanId: plan.id,
          },
        })
      )
    );

    // Fetch the plan with rules
    const planWithRules = await prisma.discountPlan.findUnique({
      where: { id: plan.id },
      include: { rules: true },
    });

    return json({ success: "Plan created successfully", plan: planWithRules });
  }

  if (action === "delete") {
    const planId = formData.get("planId") as string;
    await prisma.discountPlan.delete({
      where: { id: planId },
    });
    return json({ success: "Plan deleted successfully" });
  }

  return json({ error: "Invalid action" });
};

export default function Index() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const { plans, segments, collections } = loaderData || { plans: [], segments: [], collections: [] };
  const error = actionData?.error || (loaderData as any)?.error;
  
  // Add immediate console logging
  console.log('=== DISCOUNT PLANS PAGE LOADED ===');
  console.log('Loader data:', loaderData);
  console.log('Segments:', segments);
  console.log('Collections:', collections);
  console.log('Plans:', plans);
  console.log('Error:', error);
  
  // Add useEffect to monitor segments
  useEffect(() => {
    console.log('=== SEGMENTS CHANGED ===');
    console.log('Current segments:', segments);
    console.log('Segment count:', segments.length);
    console.log('Are these fallback segments?', segments.some((s: any) => ['vip', 'gold', 'silver', 'bronze'].includes(s.id)));
  }, [segments]);
  
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [targetType, setTargetType] = useState("segment");
  const [targetKey, setTargetKey] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [percentOff, setPercentOff] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [rules, setRules] = useState<any[]>([]);
  const [newRuleCategoryId, setNewRuleCategoryId] = useState("");
  const [newRulePercentOff, setNewRulePercentOff] = useState("");
  const submit = useSubmit();

  const handleAddClick = () => setShowForm(true);
  const handleCancel = () => {
    setShowForm(false);
    setName("");
    setTargetType("segment");
    setTargetKey("");
    setCategoryId("");
    setPercentOff("");
    setCollectionSearch("");
    setRules([]);
    setNewRuleCategoryId("");
    setNewRulePercentOff("");
  };

  const handleAddRule = () => {
    if (!newRuleCategoryId || !newRulePercentOff) return;
    setRules([
      ...rules,
      {
        categoryId: newRuleCategoryId,
        percentOff: parseFloat(newRulePercentOff), // Convert to number
      },
    ]);
    setNewRuleCategoryId("");
    setNewRulePercentOff("");
  };

  const handleRemoveRule = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    // Check if we have the main form fields filled
    const hasMainRule = categoryId && percentOff;
    const hasAdditionalRules = rules.length > 0;
    
    if (!name || !targetKey || !targetType || (!hasMainRule && !hasAdditionalRules)) {
      return;
    }

    // Combine main rule with additional rules
    let allRules = [...rules];
    
    // Add the main form rule if it exists
    if (hasMainRule) {
      allRules.unshift({
        categoryId: categoryId,
        percentOff: parseFloat(percentOff),
      });
    }

    submit(
      {
        action: "create",
        name,
        targetType,
        targetKey,
        rules: JSON.stringify(allRules),
      },
      { method: "POST" }
    );
    handleCancel();
  };

  const handleDelete = (planId: string) => {
    if (confirm("Are you sure you want to delete this plan?")) {
      submit({ action: "delete", planId }, { method: "POST" });
    }
  };

  // Enhanced collection search with debouncing
  const handleCollectionSearch = (value: string) => {
    setCollectionSearch(value);
    setIsSearching(true);
    // Simulate search delay for better UX
    setTimeout(() => setIsSearching(false), 300);
  };

  // Filter collections by search with improved logic
  const filteredCollections = collections.filter((c: any) => {
    const searchTerm = collectionSearch.toLowerCase().trim();
    if (!searchTerm) return true;
    
    return (
      c.title.toLowerCase().includes(searchTerm) ||
      (c.description && c.description.toLowerCase().includes(searchTerm)) ||
      c.id.toLowerCase().includes(searchTerm)
    );
  });

  // Segment options for dropdown with better formatting
  const segmentOptions = segments.map((s: any) => ({ 
    label: s.name, 
    value: s.id 
  }));

  // Collection options for dropdown with search results
  const collectionOptions = filteredCollections.map((c: any) => ({
    label: `${c.title} (${c.productsCount} products)`,
    value: c.id,
  }));

  // Find selected collection for summary card
  const selectedCollection = collections.find((c: any) => c.id === categoryId);

  return (
    <Page title="Discount Plans">
      <Layout>
        <Layout.Section>
          {error && (
            <Banner tone="critical" title="Error">
              {error}
            </Banner>
          )}
          
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Discount Plans
                </Text>
                <Button onClick={handleAddClick} variant="primary">
                  Add Plan
                </Button>
              </InlineStack>

              {showForm && error && (
                <Banner tone="warning">
                  {error}
                </Banner>
              )}

              {showForm && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h3" variant="headingMd">
                      Create New Plan
                    </Text>
                    
                    <TextField
                      label="Plan Name"
                      value={name}
                      onChange={setName}
                      placeholder="e.g., VIP Discount"
                      autoComplete="off"
                    />
                    
                    <Select
                      label="Target Type"
                      options={[
                        { label: "Segment", value: "segment" },
                        { label: "Customer", value: "customer" },
                      ]}
                      value={targetType}
                      onChange={setTargetType}
                    />
                    
                    {targetType === "segment" ? (
                      <>
                        <Select
                          label="Segment"
                          options={segmentOptions}
                          value={targetKey}
                          onChange={setTargetKey}
                          placeholder={segments.length > 0 ? "Select a segment" : "No segments found"}
                          disabled={segments.length === 0}
                        />
                        {segments.length === 0 && (
                          <Banner tone="info">
                            No customer segments found. Make sure you have customers with tags in your store.
                          </Banner>
                        )}
                        {segments.length > 0 && segments.some((s: any) => ['vip', 'gold', 'silver', 'bronze'].includes(s.id)) && (
                          <Banner tone="warning">
                            Using fallback segments. Check console for GraphQL errors.
                          </Banner>
                        )}
                        {segments.length > 0 && !segments.some((s: any) => ['vip', 'gold', 'silver', 'bronze'].includes(s.id)) && (
                          <Banner tone="success">
                            Found {segments.length} customer segments from your store.
                          </Banner>
                        )}
                      </>
                    ) : (
                      <TextField
                        label="Customer ID"
                        value={targetKey}
                        onChange={setTargetKey}
                        placeholder="Enter customer ID"
                        autoComplete="off"
                      />
                    )}
                    
                    <TextField
                      label="Collection Search"
                      value={collectionSearch}
                      onChange={handleCollectionSearch}
                      placeholder="Search collections by name, description, or ID..."
                      autoComplete="off"
                      suffix={isSearching ? <Spinner size="small" /> : undefined}
                    />
                    
                    <Select
                      label="Collection"
                      options={collectionOptions}
                      value={categoryId}
                      onChange={setCategoryId}
                      placeholder={collectionSearch ? `Select from ${filteredCollections.length} results` : "Select a collection"}
                      disabled={isSearching}
                    />
                    
                    {collectionSearch && filteredCollections.length === 0 && !isSearching && (
                      <Banner tone="info">
                        No collections found matching "{collectionSearch}". Try a different search term.
                      </Banner>
                    )}
                    
                    <TextField
                      label="Discount Percentage"
                      type="number"
                      value={percentOff}
                      onChange={setPercentOff}
                      placeholder="0-100"
                      min="0"
                      max="100"
                      suffix="%"
                      autoComplete="off"
                    />
                    
                    {selectedCollection && (
                      <Card>
                        <BlockStack gap="200">
                          <Text as="h4" variant="headingSm">
                            Selected Collection
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {selectedCollection.title} ({selectedCollection.productsCount} products)
                          </Text>
                          {selectedCollection.description && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              {selectedCollection.description}
                            </Text>
                          )}
                        </BlockStack>
                      </Card>
                    )}
                    
                    <Text as="h4" variant="headingSm">Add Rules</Text>
                    <Select
                      label="Collection"
                      options={collectionOptions}
                      value={newRuleCategoryId}
                      onChange={setNewRuleCategoryId}
                      placeholder="Select a collection"
                    />
                    <TextField
                      label="Percent Off"
                      type="number"
                      value={newRulePercentOff}
                      onChange={setNewRulePercentOff}
                      placeholder="0-100"
                      min="0"
                      max="100"
                      suffix="%"
                      autoComplete="off"
                    />
                    <Button onClick={handleAddRule} variant="primary" disabled={!newRuleCategoryId || !newRulePercentOff}>
                      Add Rule
                    </Button>
                    {rules.length > 0 && (
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingSm">Rules to Add:</Text>
                        {rules.map((rule, idx) => {
                          const collection = collections.find((c: any) => c.id === rule.categoryId);
                          return (
                            <InlineStack key={idx} align="space-between">
                              <Text as="p" variant="bodyMd">
                                {collection?.title || rule.categoryId}: {rule.percentOff}% off
                              </Text>
                              <Button variant="plain" tone="critical" onClick={() => handleRemoveRule(idx)}>
                                Remove
                              </Button>
                            </InlineStack>
                          );
                        })}
                      </BlockStack>
                    )}
                    
                    <InlineStack gap="300">
                      <Button onClick={handleSubmit} variant="primary">
                        Create Plan
                      </Button>
                      <Button onClick={handleCancel} variant="plain">
                        Cancel
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              )}

              {plans.length === 0 ? (
                <Card>
                  <BlockStack gap="400" align="center">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      No discount plans created yet
                    </Text>
                    <Button onClick={handleAddClick} variant="primary">
                      Create Your First Plan
                    </Button>
                  </BlockStack>
                </Card>
              ) : (
                <BlockStack gap="400">
                  {plans.map((plan: any) => (
                    <Card key={plan.id}>
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <BlockStack gap="200">
                            <Text as="h3" variant="headingMd">
                              {plan.name}
                            </Text>
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Target: {plan.targetType} - {plan.targetKey}
                            </Text>
                          </BlockStack>
                          <InlineStack gap="200" align="center">
                         
                              
                                  <Button 
                                  url={`/app/discount-plans/${plan.id}`}
                                  variant="primary" size="slim">
                                    Edit
                                  </Button>
                           
                            
                         
                            <Button
                              onClick={() => handleDelete(plan.id)}
                              variant="primary"
                              tone="critical"
                              size="slim"
                            >
                              Delete
                            </Button>
                          </InlineStack>
                        </InlineStack>
                        
                        {plan.rules.length > 0 && (
                          <BlockStack gap="200">
                            <Text as="h4" variant="headingSm">
                              Rules:
                            </Text>
                            {plan.rules.map((rule: any) => {
                              const collection = collections.find((c: any) => c.id === rule.categoryId);
                              return (
                                <Text key={rule.id} as="p" variant="bodyMd">
                                  {collection?.title || rule.categoryId}: {rule.percentOff}% off
                                </Text>
                              );
                            })}
                          </BlockStack>
                        )}
                      </BlockStack>
                    </Card>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
