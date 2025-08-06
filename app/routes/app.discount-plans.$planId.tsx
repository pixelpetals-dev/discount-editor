import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useParams, useActionData, useNavigation, useSubmit, Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import { Page, Card, Button, BlockStack, Text, Layout, TextField, InlineStack, Select, Banner, Modal, ChoiceList, Spinner } from "@shopify/polaris";
import { prisma } from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  console.log('=== EDIT PAGE LOADER CALLED ===');
  console.log('Params:', params);
  console.log('Plan ID:', params.planId);
  
  await authenticate.admin(request);
  
  const plan = await prisma.discountPlan.findUnique({
    where: { id: params.planId },
    include: { rules: true },
  });
  
  if (!plan) {
    throw new Response("Not found", { status: 404 });
  }

  // Fetch segments and collections for dropdowns
  const { admin } = await authenticate.admin(request);
  let segments: Array<{id: string, name: string, query: string}> = [];
  let collections = [];
  
  try {
    // Fetch collections
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
    if ((collectionsData as any).errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify((collectionsData as any).errors)}`);
    }
    collections = collectionsData.data.collections.edges.map((edge: any) => ({
      id: edge.node.id,
      title: edge.node.title,
      productsCount: edge.node.productsCount.count,
      description: edge.node.description,
    }));

    // Fetch segments
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
    if ((segmentsData as any).errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify((segmentsData as any).errors)}`);
    }
    segments = segmentsData.data.segments.edges.map((edge: any) => edge.node);
  } catch (error) {
    console.error('Error fetching collections or segments:', error);
    collections = [];
    segments = [];
  }

  return json({ plan, segments, collections });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updatePlan") {
    const name = formData.get("name") as string;
    const targetKey = formData.get("targetKey") as string;
    const rulesData = formData.get("rules") as string;

    if (!name || !targetKey) {
      return json({ error: "Plan name and segment are required" });
    }

    // Check for duplicate segments (excluding current plan)
    const existing = await prisma.discountPlan.findFirst({
      where: { 
        targetType: "segment", 
        targetKey,
        id: { not: params.planId }
      },
    });
    if (existing) {
      return json({ error: "A discount plan for this segment already exists." });
    }

    // Parse rules data
    let rules = [];
    try {
      rules = JSON.parse(rulesData || "[]");
    } catch (error) {
      console.error('Error parsing rules:', error);
      return json({ error: "Invalid rules data" });
    }

    // Update plan and rules in a transaction
    await prisma.$transaction(async (tx) => {
      // Update the plan
      await tx.discountPlan.update({
        where: { id: params.planId },
        data: { 
          name, 
          targetType: "segment", // Always segment
          targetKey 
        },
      });

      // Delete existing rules
      await tx.rule.deleteMany({
        where: { discountPlanId: params.planId as string },
      });

      // Create new rules
      for (const rule of rules) {
        await tx.rule.create({
          data: {
            id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            categoryId: rule.categoryId,
            percentOff: rule.percentOff,
            discountPlanId: params.planId as string,
          },
        });
      }
    });

    return redirect("/app");
  }

  if (intent === "deletePlan") {
    await prisma.discountPlan.delete({ where: { id: params.planId } });
    return redirect("/app");
  }

  return json({ error: "Invalid action" });
};

export default function DiscountPlanEditPage() {
  console.log('=== EDIT PAGE COMPONENT RENDERED ===');
  const { plan, segments, collections } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const { planId } = useParams();
  
  console.log('Plan:', plan);
  console.log('Plan ID from params:', planId);
  
  const [name, setName] = useState(plan.name);
  const [targetKey, setTargetKey] = useState(plan.targetKey);
  const [rules, setRules] = useState(plan.rules.map((rule: any) => ({
    categoryId: rule.categoryId,
    percentOff: rule.percentOff,
  })));
  
  // Modal state
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionPercentages, setCollectionPercentages] = useState<Record<string, number>>({});
  const [collectionsToShow, setCollectionsToShow] = useState(5); // Pagination state

  // Loading states
  const isUpdatingPlan = navigation.state === "submitting" && navigation.formData?.get("intent") === "updatePlan";
  const isDeletingPlan = navigation.state === "submitting" && navigation.formData?.get("intent") === "deletePlan";

  // Helper functions
  const getSegmentName = (segmentId: string) => {
    const segment = segments.find((s: any) => s.id === segmentId);
    return segment ? segment.name : segmentId;
  };

  const getCollectionName = (collectionId: string) => {
    const collection = collections.find((c: any) => c.id === collectionId);
    return collection ? collection.title : collectionId;
  };

  // Initialize modal with existing rules
  useEffect(() => {
    if (showCollectionModal) {
      const existingCollectionIds = rules.map((rule: any) => rule.categoryId);
      setSelectedCollections(existingCollectionIds);
      
      const existingPercentages: Record<string, number> = {};
      rules.forEach((rule: any) => {
        existingPercentages[rule.categoryId] = rule.percentOff;
      });
      setCollectionPercentages(existingPercentages);
      setCollectionsToShow(5); // Reset pagination when modal opens
    }
  }, [showCollectionModal, rules]);

  // Handle form submission using Remix's useSubmit
  const handleSubmit = () => {
    if (!name || !targetKey || rules.length === 0) {
      alert("Please fill in all required fields and add at least one rule.");
      return;
    }

    // Validate percentages
    const invalidRules = rules.filter((rule: any) => !rule.percentOff || rule.percentOff <= 0 || rule.percentOff > 100);
    if (invalidRules.length > 0) {
      alert("Please ensure all rules have valid percentages (1-100).");
      return;
    }

    // Use Remix's useSubmit instead of manual form creation
    const formData = new FormData();
    formData.append("intent", "updatePlan");
    formData.append("name", name);
    formData.append("targetKey", targetKey);
    formData.append("rules", JSON.stringify(rules));
    
    submit(formData, { method: "post" });
  };

  const handleCancel = () => {
    // Reset form to original values
    setName(plan.name);
    setTargetKey(plan.targetKey);
    setRules(plan.rules.map((rule: any) => ({
      categoryId: rule.categoryId,
      percentOff: rule.percentOff,
    })));
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this discount plan? This action cannot be undone.")) {
      const formData = new FormData();
      formData.append("intent", "deletePlan");
      submit(formData, { method: "post" });
    }
  };

  const handleAddClick = () => {
    setShowCollectionModal(true);
  };

  const handleLoadMore = () => {
    setCollectionsToShow(prev => prev + 5);
  };

  const segmentOptions = segments.map((s: any) => ({ 
    label: s.name, 
    value: s.name // Use segment name instead of ID for targetKey
  }));

  // Filter and paginate collections
  const filteredCollections = collections.filter((collection: any) => 
    collection.title.toLowerCase().includes(collectionSearch.toLowerCase())
  );
  const displayedCollections = filteredCollections.slice(0, collectionsToShow);
  const hasMoreCollections = displayedCollections.length < filteredCollections.length;

  return (
    <>
      <Page 
        title={`Edit Discount Plan: ${plan.name}`}
        backAction={{ content: "Discount Plans", url: "/app" }}
      >
        <Layout>
          <Layout.Section>
            {actionData?.error && (
              <Banner tone="critical">
                {actionData.error}
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Edit Plan Details</Text>
                
                <BlockStack gap="400">
                  <TextField
                    label="Plan Name"
                    value={name}
                    onChange={setName}
                    placeholder="e.g., VIP Discount"
                    autoComplete="off"
                  />
                  
                  <Select
                    label="Segment"
                    options={segmentOptions}
                    value={targetKey}
                    onChange={setTargetKey}
                    placeholder="Select a segment"
                  />
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Rules</Text>
                  <Button onClick={handleAddClick} variant="primary" size="slim">
                    Select Collections
                  </Button>
                </InlineStack>
                
                {rules.length === 0 ? (
                  <Text as="p" variant="bodyMd" tone="subdued">
                    No rules yet. Click "Select Collections" to add rules.
                  </Text>
                ) : (
                  <BlockStack gap="300">
                    {rules.map((rule: any, index: number) => {
                      return (
                        <Card key={index}>
                          <BlockStack gap="300">
                            <InlineStack align="space-between">
                              <BlockStack gap="200">
                                <Text as="h4" variant="headingSm">
                                  {getCollectionName(rule.categoryId)}
                                </Text>
                                <Text as="p" variant="bodyMd">
                                  {rule.percentOff}% off
                                </Text>
                              </BlockStack>
                              <InlineStack gap="200">
                                <Button 
                                  onClick={() => {
                                    const newRules = rules.filter((_: any, i: number) => i !== index);
                                    setRules(newRules);
                                  }}
                                  variant="plain" 
                                  tone="critical"
                                  size="slim"
                                >
                                  Remove
                                </Button>
                              </InlineStack>
                            </InlineStack>
                          </BlockStack>
                        </Card>
                      );
                    })}
                  </BlockStack>
                )}
                
                <InlineStack gap="300">
                  <Button 
                    onClick={handleSubmit} 
                    variant="primary"
                    loading={isUpdatingPlan}
                    disabled={isUpdatingPlan || !name || !targetKey || rules.length === 0}
                  >
                    {isUpdatingPlan ? "Updating Plan..." : "Update Plan"}
                  </Button>
                  <Button onClick={handleCancel} variant="plain" disabled={isUpdatingPlan}>
                    Cancel
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Button
                  onClick={handleDelete}
                  variant="plain"
                  tone="critical"
                  loading={isDeletingPlan}
                  disabled={isDeletingPlan}
                >
                  {isDeletingPlan ? "Deleting..." : "Delete Plan"}
                </Button>
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
          content: "Update Selected",
          onAction: () => {
            // Validate that all selected collections have percentages
            const missingPercentages = selectedCollections.filter(id => 
              !collectionPercentages[id] || collectionPercentages[id] <= 0
            );
            
            if (missingPercentages.length > 0) {
              alert("Please set a valid percentage (1-100) for all selected collections.");
              return;
            }

            // Update rules with selected collections and their percentages
            const newRules = selectedCollections.map(collectionId => ({
              categoryId: collectionId,
              percentOff: collectionPercentages[collectionId],
            }));
            
            setRules(newRules);
            setShowCollectionModal(false);
            setSelectedCollections([]);
            setCollectionSearch("");
            setCollectionPercentages({});
            setCollectionsToShow(5); // Reset pagination
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
              choices={displayedCollections.map((collection: any) => ({
                label: collection.title,
                value: collection.id,
              }))}
              selected={selectedCollections}
              onChange={setSelectedCollections}
              allowMultiple
            />
            
            {hasMoreCollections && (
              <Button
                onClick={handleLoadMore}
                variant="plain"
                size="slim"
              >
                Load More Collections
              </Button>
            )}
            
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
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 1000,
        backgroundColor: 'transparent',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#6d7175'
      }}>
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
      </div>
    </>
  );
}
 