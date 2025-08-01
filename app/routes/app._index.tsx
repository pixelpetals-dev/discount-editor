import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, useSubmit } from "@remix-run/react";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Select,
  BlockStack,
  InlineStack,
  Banner,
  Spinner,
  Text,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // Fetch collections and segments from Shopify
    const collectionsQuery = `#graphql
      query getCollections {
        collections(first: 100) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `;

    const collectionsResponse = await admin.graphql(collectionsQuery);
    const collectionsData = await collectionsResponse.json();

    const collections = collectionsData.data.collections.edges.map((edge: any) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
    }));

    const segmentsQuery = `#graphql
      query getSegments {
        segments(first: 50) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `;

    const segmentsResponse = await admin.graphql(segmentsQuery);
    const segmentsData = await segmentsResponse.json();

    const segments = segmentsData.data.segments.edges.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
    }));

    // Fetch existing discount plans
    const plans = await prisma.discountPlan.findMany({
      include: {
        rules: true,
      },
    });

    return json({
      collections,
      segments,
      plans,
      error: null,
      success: null,
    });
  } catch (error) {
    console.error("Error in loader:", error);
    return json({
      collections: [],
      segments: [],
      plans: [],
      error: "Failed to load data from Shopify",
      success: null,
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

    try {
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

      return json({ 
        success: `Plan "${name}" created successfully with ${rules.length} rule(s)!`,
        plan: planWithRules 
      });
    } catch (error) {
      console.error("Error creating plan:", error);
      return json({ 
        error: "Failed to create plan. Please try again." 
      });
    }
  }

  if (action === "delete") {
    const planId = formData.get("planId") as string;
    try {
      await prisma.discountPlan.delete({
        where: { id: planId },
      });
      return json({ success: "Plan deleted successfully" });
    } catch (error) {
      console.error("Error deleting plan:", error);
      return json({ 
        error: "Failed to delete plan. Please try again." 
      });
    }
  }

  return json({ error: "Invalid action" });
};

export default function Index() {
  const { plans, segments, collections, error, success } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  // Extract current action and plan ID from navigation
  const currentAction = navigation.formData?.get("action") as string;
  const currentPlanId = navigation.formData?.get("planId") as string;
  
  // Determine loading states
  const isCreatingPlan = currentAction === "create" && navigation.state === "submitting";
  const isDeletingPlan = currentAction === "delete" && navigation.state === "submitting";
  const deletingPlanId = isDeletingPlan ? currentPlanId : null;

  // State for form
  const [showForm, setShowForm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [name, setName] = useState("");
  const [targetType, setTargetType] = useState<"segment" | "collection">("segment");
  const [targetKey, setTargetKey] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [percentOff, setPercentOff] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [rules, setRules] = useState<Array<{ categoryId: string; percentOff: number }>>([]);
  const [newRuleCategoryId, setNewRuleCategoryId] = useState("");
  const [newRulePercentOff, setNewRulePercentOff] = useState("");

  // Helper function to get segment name from target key
  const getSegmentName = (targetKey: string) => {
    const segment = segments.find((s: any) => s.id === targetKey);
    return segment ? segment.name : targetKey;
  };

  // Helper function to get collection name from category ID
  const getCollectionName = (categoryId: string) => {
    const collection = collections.find((c: any) => c.id === categoryId);
    return collection ? collection.title : categoryId;
  };

  // Show success message when action data contains success
  useEffect(() => {
    if (success) {
      setShowSuccess(true);
      // Close form immediately after successful plan creation
      if (currentAction === "create") {
        handleCancel();
      }
      // Auto-hide success message after 3 seconds
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, currentAction]);

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
        targetType: "segment", // Defaulting to segment
        targetKey,
        rules: JSON.stringify(allRules),
      },
      { method: "POST" }
    );
   
    // Don't call handleCancel() here - let the form stay open during loading
  };

  const handleDelete = (planId: string) => {
    if (confirm("Are you sure you want to delete this plan?")) {
      // setDeletingPlanId(planId); // This line was removed from the new_code, so it's removed here.
      submit({ action: "delete", planId }, { method: "POST" });
    }
  };

  // Enhanced collection search with debouncing
  const handleCollectionSearch = (value: string) => {
    setCollectionSearch(value);
    // setIsSearching(true); // This line was removed from the new_code, so it's removed here.
    // Simulate search delay for better UX
    // setTimeout(() => setIsSearching(false), 300); // This line was removed from the new_code, so it's removed here.
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

          {showSuccess && success && (
            <Banner tone="success" title="Success">
              {success}
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
                      disabled={isCreatingPlan}
                    />
                    
                    {/* Target Type - Defaulting to segment
                    <Select
                      label="Target Type"
                      options={[
                        { label: "Segment", value: "segment" },
                        { label: "Customer", value: "customer" },
                      ]}
                      value={targetType}
                      onChange={(value) => setTargetType(value as "segment" | "collection")}
                      disabled={isCreatingPlan}
                    />
                    */}
                    
                    {targetType === "segment" ? (
                      <>
                        <Select
                          label="Segment"
                          options={segmentOptions}
                          value={targetKey}
                          onChange={setTargetKey}
                          placeholder={segments.length > 0 ? "Select a segment" : "No segments found"}
                          disabled={segments.length === 0 || isCreatingPlan}
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
                        disabled={isCreatingPlan}
                      />
                    )}
                    
                    {/* Collection Search - Replaced with dropdown
                    <TextField
                      label="Collection Search"
                      value={collectionSearch}
                      onChange={handleCollectionSearch}
                      placeholder="Search collections by name, description, or ID..."
                      autoComplete="off"
                      // suffix={isSearching ? <Spinner size="small" /> : undefined} // This line was removed from the new_code, so it's removed here.
                      disabled={isCreatingPlan}
                    />
                    */}
                    
                    <Select
                        label="Select Collections"
                        options={collections.map((collection: any) => ({
                          label: collection.title,
                          value: collection.id,
                        }))}
                        value={newRuleCategoryId}
                        onChange={(value) => setNewRuleCategoryId(value)}
                        disabled={isCreatingPlan}
                        placeholder="Choose collections..."
                      />
                    
                    {/* collectionSearch && filteredCollections.length === 0 && !isSearching && (
                      <Banner tone="info">
                        No collections found matching "{collectionSearch}". Try a different search term.
                      </Banner>
                    ) */}
                    
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
                      disabled={isCreatingPlan}
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
                      disabled={isCreatingPlan}
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
                      disabled={isCreatingPlan}
                    />
                    <Button onClick={handleAddRule} variant="primary" disabled={!newRuleCategoryId || !newRulePercentOff || isCreatingPlan}>
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
                              <Button variant="plain" tone="critical" onClick={() => handleRemoveRule(idx)} disabled={isCreatingPlan}>
                                Remove
                              </Button>
                            </InlineStack>
                          );
                        })}
                      </BlockStack>
                    )}
                    
                    <InlineStack gap="300">
                      <Button 
                        onClick={handleSubmit} 
                        variant="primary"
                        loading={isCreatingPlan}
                        disabled={isCreatingPlan}
                      >
                        {isCreatingPlan ? "Creating Plan..." : "Create Plan"}
                      </Button>
                      <Button onClick={handleCancel} variant="plain" disabled={isCreatingPlan}>
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
                  {plans.map((plan: any) => {
                    const isDeletingThisPlan = deletingPlanId === plan.id;
                    return (
                      <Card key={plan.id}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between">
                            <BlockStack gap="200">
                              <Text as="h3" variant="headingMd">
                                {plan.name}
                              </Text>
                              <Text as="p" variant="bodyMd" tone="subdued">
                                Target: {plan.targetType === "segment" 
                                  ? getSegmentName(plan.targetKey)
                                  : getCollectionName(plan.targetKey)
                                }
                              </Text>
                            </BlockStack>
                            <InlineStack gap="200" align="center">
                              <Button 
                                url={`/app/discount-plans/${plan.id}`}
                                variant="primary" 
                                size="slim"
                                disabled={isDeletingThisPlan}
                              >
                                Edit
                              </Button>
                              <Button
                                onClick={() => handleDelete(plan.id)}
                                variant="primary"
                                tone="critical"
                                size="slim"
                                loading={isDeletingThisPlan}
                                disabled={isDeletingThisPlan}
                              >
                                {isDeletingThisPlan ? "Deleting..." : "Delete"}
                              </Button>
                            </InlineStack>
                          </InlineStack>
                          
                          {plan.rules.length > 0 && (
                            <BlockStack gap="200">
                              <Text as="h4" variant="headingSm">
                                Rules:
                              </Text>
                              {plan.rules.map((rule: any) => {
                                return (
                                  <Text key={rule.id} as="p" variant="bodyMd">
                                    {getCollectionName(rule.categoryId)}: {rule.percentOff}% off
                                  </Text>
                                );
                              })}
                            </BlockStack>
                          )}
                        </BlockStack>
                      </Card>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
