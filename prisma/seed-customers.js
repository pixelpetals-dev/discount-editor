import 'dotenv/config';
import '@shopify/shopify-api/adapters/node';
import { PrismaClient } from '@prisma/client';
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

const shop = process.env.SHOPIFY_SHOP;
const accessToken = process.env.SHOPIFY_ADMIN_TOKEN;

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  apiVersion: ApiVersion.April24,
  isEmbeddedApp: true,
  scopes: ["read_customers", "write_draft_orders", "write_products"],
  hostName: process.env.SHOPIFY_APP_URL.replace(/^https?:\/\//, ''),
});

const session = new Session({
  id: `${shop}_seed`,
  shop,
  state: 'seed',
  isOnline: false,
  accessToken,
  scope: process.env.SCOPES,
});

const client = new shopify.clients.Graphql({ session });

async function main() {
  // Check granted scopes
  const resp = await fetch(`https://${shop}/admin/oauth/access_scopes.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken }
  });
  const data = await resp.json();
  console.log('Granted scopes:', data);

  // Try a simple REST API call to confirm token access
  const respRest = await fetch(`https://${shop}/admin/api/2023-10/customers.json?fields=id,email,tags`, {
    headers: { 'X-Shopify-Access-Token': accessToken }
  });
  const dataRest = await respRest.json();
  console.log('REST customers:', dataRest);

  for (const customer of dataRest.customers) {
    await prisma.customer.upsert({
      where: { id: String(customer.id) },
      update: { email: customer.email },
      create: { id: String(customer.id), email: customer.email },
    });

    for (const tag of customer.tags) {
      // Upsert segment
      await prisma.segment.upsert({
        where: { id: tag },
        update: {},
        create: { id: tag },
      });
      // Upsert customerSegment
      await prisma.customerSegment.upsert({
        where: { customerId_segmentId: { customerId: String(customer.id), segmentId: tag } },
        update: {},
        create: { customerId: String(customer.id), segmentId: tag },
      });
    }
  }

  console.log('Seeded customers:', dataRest.customers.length);
  console.log('Seeded segments:', Array.from(new Set(dataRest.customers.flatMap(c => c.tags))));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });