import { json } from "@remix-run/node";

export async function loader() {
  const postgresUrl = process.env.POSTGRES_URL;
  const hasPostgresUrl = !!postgresUrl;
  const postgresUrlStartsWith = postgresUrl?.startsWith('postgresql://') || postgresUrl?.startsWith('postgres://');
  
  return json({
    hasPostgresUrl,
    postgresUrlStartsWith,
    postgresUrlLength: postgresUrl?.length || 0,
    postgresUrlPrefix: postgresUrl?.substring(0, 20) || 'null',
    allEnvVars: {
      POSTGRES_URL: hasPostgresUrl ? 'SET' : 'NOT_SET',
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY ? 'SET' : 'NOT_SET',
      SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET ? 'SET' : 'NOT_SET',
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL ? 'SET' : 'NOT_SET',
    }
  });
} 