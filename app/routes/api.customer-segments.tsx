import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const { admin } = await authenticate.admin(request);
    
    // Get all customers to extract unique tags
    const response = await admin.graphql(`#graphql
      query {
        customers(first: 250) {
          edges {
            node {
              id
              tags
              email
              firstName
              lastName
            }
          }
        }
      }
    `);
    
    const data = await response.json();
    const allTags = new Set<string>();
    const customers = data.data.customers.edges.map((edge: any) => ({
      id: edge.node.id.replace('gid://shopify/Customer/', ''),
      email: edge.node.email,
      firstName: edge.node.firstName,
      lastName: edge.node.lastName,
      tags: edge.node.tags || []
    }));
    
    // Extract unique tags
    customers.forEach((customer: any) => {
      if (customer.tags && Array.isArray(customer.tags)) {
        customer.tags.forEach((tag: string) => {
          if (tag && tag.trim()) {
            allTags.add(tag.trim());
          }
        });
      }
    });
    
    // Convert tags to segments format
    const segments = Array.from(allTags).map(tag => ({
      id: tag,
      name: tag.charAt(0).toUpperCase() + tag.slice(1), // Capitalize first letter
      customerCount: customers.filter((c: any) => c.tags && c.tags.includes(tag)).length
    }));

    return json(
      { 
        segments,
        customers,
        totalCustomers: customers.length,
        totalSegments: segments.length
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error('Error fetching customer segments:', error);
    return json(
      { 
        error: "Failed to fetch customer segments", 
        details: (error as Error).message,
        segments: [],
        customers: [],
        totalCustomers: 0,
        totalSegments: 0
      },
      { status: 500 }
    );
  }
}; 