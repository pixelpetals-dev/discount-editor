import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useParams, useActionData } from "@remix-run/react";
import { useState } from "react";
import { Page, Card, Button, BlockStack, Text, Layout, TextField, InlineStack, Select, Banner } from "@shopify/polaris";
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
    const targetType = formData.get("targetType") as string;
    const targetKey = formData.get("targetKey") as string;

    if (!name || !targetType || !targetKey) {
      return json({ error: "All fields are required" });
    }

    // Check for duplicate segments (excluding current plan)
    if (targetType === "segment") {
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
    }

    await prisma.discountPlan.update({
      where: { id: params.planId },
      data: { name, targetType, targetKey },
    });

    return json({ success: "Plan updated successfully" });
  }

  if (intent === "addRule") {
    const categoryId = formData.get("categoryId") as string;
    const percentOff = parseFloat(formData.get("percentOff") as string);

    if (!categoryId || isNaN(percentOff)) {
      return json({ error: "Category and percent off are required" });
    }

    await prisma.rule.create({
      data: {
        categoryId,
        percentOff,
        discountPlanId: params.planId as string,
      },
    });

    return json({ success: "Rule added successfully" });
  }

  if (intent === "deleteRule") {
    const ruleId = formData.get("ruleId") as string;
    await prisma.rule.delete({ where: { id: ruleId } });
    return json({ success: "Rule deleted successfully" });
  }

  if (intent === "deletePlan") {
    await prisma.discountPlan.delete({ where: { id: params.planId } });
    return redirect("/app/discount-plans");
  }

  return json({ error: "Invalid action" });
};

export default function DiscountPlanEditPage() {
  console.log('=== EDIT PAGE COMPONENT RENDERED ===');
  const { plan, segments, collections } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const { planId } = useParams();
  
  console.log('Plan:', plan);
  console.log('Plan ID from params:', planId);
  
  const [name, setName] = useState(plan.name);
  const [targetType, setTargetType] = useState(plan.targetType);
  const [targetKey, setTargetKey] = useState(plan.targetKey);
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newPercentOff, setNewPercentOff] = useState("");

  const segmentOptions = segments.map((s: any) => ({ 
    label: s.name, 
    value: s.id 
  }));

  const collectionOptions = collections.map((c: any) => ({
    label: `${c.title} (${c.productsCount} products)`,
    value: c.id,
  }));

  const selectedSegment = segments.find((s: any) => s.id === targetKey);
  const selectedCollection = collections.find((c: any) => c.id === newCategoryId);

  return (
    <Page 
      title={`Edit Discount Plan: ${plan.name}`}
      backAction={{ content: "Discount Plans", url: "/app/discount-plans" }}
    >
      <Layout>
        <Layout.Section>
          {actionData?.error && (
            <Banner tone="critical">
              {actionData.error}
            </Banner>
          )}
          
          {actionData?.success && (
            <Banner tone="success">
              {actionData.success}
            </Banner>
          )}

          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Edit Plan Details</Text>
              
              <Form method="post">
                <input type="hidden" name="intent" value="updatePlan" />
                
                <BlockStack gap="400">
                  <TextField
                    label="Plan Name"
                    value={name}
                    onChange={setName}
                    name="name"
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
                    name="targetType"
                  />
                  
                  {targetType === "segment" && (
                    <Select
                      label="Segment"
                      options={segmentOptions}
                      value={targetKey}
                      onChange={setTargetKey}
                      name="targetKey"
                      placeholder="Select a segment"
                    />
                  )}
                  
                  {targetType === "customer" && (
                    <TextField
                      label="Customer ID"
                      value={targetKey}
                      onChange={setTargetKey}
                      name="targetKey"
                      placeholder="Enter customer ID"
                      autoComplete="off"
                    />
                  )}
                  
                  <Button submit variant="primary">
                    Update Plan
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Rules</Text>
              
              {plan.rules.length === 0 ? (
                <Text as="p" variant="bodyMd" tone="subdued">
                  No rules yet. Add a rule below.
                </Text>
              ) : (
                <BlockStack gap="300">
                  {plan.rules.map((rule: any) => {
                    const collection = collections.find((c: any) => c.id === rule.categoryId);
                    return (
                      <Card key={rule.id}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between">
                            <BlockStack gap="200">
                              <Text as="h4" variant="headingSm">
                                {collection?.title || rule.categoryId}
                              </Text>
                              <Text as="p" variant="bodyMd">
                                {rule.percentOff}% off
                              </Text>
                            </BlockStack>
                            <Form method="post">
                              <input type="hidden" name="intent" value="deleteRule" />
                              <input type="hidden" name="ruleId" value={rule.id} />
                              <Button submit variant="plain" tone="critical">
                                Delete Rule
                              </Button>
                            </Form>
                          </InlineStack>
                        </BlockStack>
                      </Card>
                    );
                  })}
                </BlockStack>
              )}

              <Card>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">Add New Rule</Text>
                  
                  <Form method="post">
                    <input type="hidden" name="intent" value="addRule" />
                    
                    <BlockStack gap="400">
                      <Select
                        label="Collection"
                        options={collectionOptions}
                        value={newCategoryId}
                        onChange={setNewCategoryId}
                        name="categoryId"
                        placeholder="Select a collection"
                      />
                      
                      <TextField
                        label="Percent Off"
                        value={newPercentOff}
                        onChange={setNewPercentOff}
                        name="percentOff"
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
                      
                      <Button submit variant="primary">
                        Add Rule
                      </Button>
                    </BlockStack>
                  </Form>
                </BlockStack>
              </Card>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Danger Zone</Text>
              
              <Form method="post">
                <input type="hidden" name="intent" value="deletePlan" />
                <Button submit variant="plain" tone="critical">
                  Delete Plan
                </Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
 