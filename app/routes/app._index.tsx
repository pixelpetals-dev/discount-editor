import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, useSubmit, Link } from "@remix-run/react";
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
  Modal,
  ChoiceList,
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

  // Create options for segments and collections
  const segmentOptions = segments.map((segment: any) => ({
    label: segment.name,
    value: segment.name, // Use segment name instead of ID for targetKey
  }));

  const collectionOptions = collections.map((collection: any) => ({
    label: collection.title,
    value: collection.id,
  }));

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
  const [targetType, setTargetType] = useState("segment"); // Default to segment
  const [targetKey, setTargetKey] = useState("");
  const [rules, setRules] = useState<any[]>([]);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [collectionPercentages, setCollectionPercentages] = useState<{[key: string]: number}>({});
  const [validationError, setValidationError] = useState("");

  // Helper function to get segment name from target key
  const getSegmentName = (targetKey: string) => {
    // Since we now use segment names as targetKey, just return the targetKey
    // or find the segment by name if needed
    const segment = segments.find((s: any) => s.name === targetKey);
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
    setTargetKey("");
    setRules([]);
    setSelectedCollections([]);
    setCollectionSearch("");
    setCollectionPercentages({});
    setValidationError("");
  };

  const handleRemoveRule = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    // Clear previous validation errors
    setValidationError("");

    // Check if we have the required fields
    if (!name.trim()) {
      setValidationError("Plan name is required.");
      return;
    }

    if (!targetKey) {
      setValidationError("Please select a target segment.");
      return;
    }

    if (rules.length === 0) {
      setValidationError("Please select at least one collection with discount percentage.");
      return;
    }

    // Validate that all rules have valid percentages
    const invalidRules = rules.filter(rule => !rule.percentOff || rule.percentOff <= 0);
    if (invalidRules.length > 0) {
      setValidationError("All collections must have a valid discount percentage (1-100%).");
      return;
    }

    submit(
      {
        action: "create",
        name,
        targetType,
        targetKey,
        rules: JSON.stringify(rules),
      },
      { method: "POST" }
    );
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
  };

  // Filter collections based on search
  const filteredCollections = collections.filter((collection: any) =>
    collection.title.toLowerCase().includes(collectionSearch.toLowerCase())
  );

  return (
    <>
      <Page title="Discount Plans">
        <Layout>
          <Layout.Section>
            {showSuccess && (
              <Banner tone="success" onDismiss={() => setShowSuccess(false)}>
                {success}
              </Banner>
            )}
            
            {error && (
              <Banner tone="critical" onDismiss={() => {}}>
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

                {showForm && validationError && (
                  <Banner tone="critical">
                    {validationError}
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
                      
                      <Button
                        onClick={() => setShowCollectionModal(true)}
                        disabled={isCreatingPlan}
                      >
                        {rules.length > 0 
                          ? `${rules.length} collection(s) selected`
                          : "Select Collections"
                        }
                      </Button>
                      
                      {rules.length > 0 && (
                        <BlockStack gap="200">
                          <Text as="h4" variant="headingSm">Selected Collections:</Text>
                          {rules.map((rule, idx) => {
                            const collection = collections.find((c: any) => c.id === rule.categoryId);
                            return (
                              <InlineStack key={idx} align="space-between">
                                <Text as="p" variant="bodyMd">
                                  {collection?.title || rule.categoryId}: {rule.percentOff}% off
                      </Text>
                                <Button 
                                  variant="plain" 
                                  tone="critical" 
                                  onClick={() => handleRemoveRule(idx)} 
                                  disabled={isCreatingPlan}
                                >
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
                          disabled={isCreatingPlan || !name || !targetKey || rules.length === 0}
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
                      {/* <Button onClick={handleAddClick} variant="primary">
                        Create Your First Plan
                      </Button> */}
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
      
      {/* Collection Selection Modal */}
      <Modal
        open={showCollectionModal}
        onClose={() => setShowCollectionModal(false)}
        title="Select Collections"
        primaryAction={{
          content: "Add Selected",
          onAction: () => {
            // Validate that all selected collections have percentages
            const missingPercentages = selectedCollections.filter(id => 
              !collectionPercentages[id] || collectionPercentages[id] <= 0
            );
            
            if (missingPercentages.length > 0) {
              alert("Please set a valid percentage (1-100) for all selected collections.");
              return;
            }

            // Add selected collections as rules with their percentages
            selectedCollections.forEach(collectionId => {
              const collection = collections.find((c: any) => c.id === collectionId);
              if (collection) {
                setRules(prev => [...prev, {
                  categoryId: collection.id,
                  percentOff: collectionPercentages[collectionId],
                }]);
              }
            });
            setShowCollectionModal(false);
            setSelectedCollections([]);
            setCollectionSearch("");
            setCollectionPercentages({});
          },
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowCollectionModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Search collections"
              value={collectionSearch}
              onChange={setCollectionSearch}
              placeholder="Search by collection name..."
              autoComplete="off"
            />
            
            <ChoiceList
              title="Collections"
              choices={collections
                .filter((collection: any) => 
                  collection.title.toLowerCase().includes(collectionSearch.toLowerCase())
                )
                .map((collection: any) => ({
                  label: collection.title,
                  value: collection.id,
                }))}
              selected={selectedCollections}
              onChange={setSelectedCollections}
              allowMultiple
            />
            
            {selectedCollections.length > 0 && (
              <BlockStack gap="400">
                <Text as="h4" variant="headingSm">
                  Set Discount Percentages:
                </Text>
                {selectedCollections.map(collectionId => {
                  const collection = collections.find((c: any) => c.id === collectionId);
                  return (
                    <InlineStack key={collectionId} align="space-between" gap="400">
                      <Text as="p" variant="bodyMd">
                        {collection?.title}
                      </Text>
                      <TextField
                        label=""
                        type="number"
                        value={collectionPercentages[collectionId] ? String(collectionPercentages[collectionId]) : ""}
                        onChange={(value) => setCollectionPercentages(prev => ({
                          ...prev,
                          [collectionId]: parseFloat(value) || 0
                        }))}
                        placeholder="0-100"
                        min="0"
                        max="100"
                        suffix="%"
                        autoComplete="off"
                      />
                    </InlineStack>
                  );
                })}
              </BlockStack>
            )}
      </BlockStack>
        </Modal.Section>
      </Modal>
      
      {/* Footer */}
      
        <Link 
          to="https://pixelpetals.com" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            textDecoration: 'none',
            color: '#6d7175',
            fontWeight: '500'
          }}
        >
          Developed by Pixel Petals
        </Link>
     
    </>
  );
}
