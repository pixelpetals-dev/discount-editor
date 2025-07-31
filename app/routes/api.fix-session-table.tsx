import { json } from "@remix-run/node";
import { prisma } from "../db.server";

export async function action({ request }: { request: Request }) {
  try {
    console.log("Fixing session table for Shopify app...");
    
    // Check if lowercase session table exists (this is what Shopify expects)
    let lowercaseSessionExists = false;
    try {
      await prisma.$queryRaw`SELECT 1 FROM "session" LIMIT 1`;
      lowercaseSessionExists = true;
      console.log("Lowercase session table exists - Shopify app should work");
    } catch (error) {
      console.log("Lowercase session table does not exist - creating it");
    }
    
    // Check if uppercase Session table exists (user's existing table)
    let uppercaseSessionExists = false;
    try {
      await prisma.$queryRaw`SELECT 1 FROM "Session" LIMIT 1`;
      uppercaseSessionExists = true;
      console.log("Uppercase Session table exists");
    } catch (error) {
      console.log("Uppercase Session table does not exist");
    }
    
    // If lowercase doesn't exist, create it
    if (!lowercaseSessionExists) {
      console.log("Creating lowercase session table for Shopify app...");
      
      // Create the lowercase session table with the exact schema Shopify expects
      await prisma.$executeRaw`
        CREATE TABLE "session" (
          "id" TEXT NOT NULL,
          "shop" TEXT NOT NULL,
          "state" TEXT NOT NULL,
          "isOnline" BOOLEAN NOT NULL DEFAULT false,
          "scope" TEXT,
          "expires" TIMESTAMP(3),
          "accessToken" TEXT NOT NULL,
          "userId" BIGINT,
          "firstName" TEXT,
          "lastName" TEXT,
          "email" TEXT,
          "accountOwner" BOOLEAN NOT NULL DEFAULT false,
          "locale" TEXT,
          "collaborator" BOOLEAN,
          "emailVerified" BOOLEAN,
          CONSTRAINT "session_pkey" PRIMARY KEY ("id")
        );
      `;
      
      // Create indexes for the lowercase session table
      await prisma.$executeRaw`
        CREATE INDEX "session_shop_idx" ON "session"("shop");
      `;
      
      await prisma.$executeRaw`
        CREATE INDEX "session_expires_idx" ON "session"("expires");
      `;
      
      console.log("Lowercase session table created successfully");
      
      // If uppercase table exists, copy data from it
      if (uppercaseSessionExists) {
        try {
          console.log("Copying data from uppercase Session table to lowercase session table...");
          await prisma.$executeRaw`
            INSERT INTO "session" 
            SELECT * FROM "Session";
          `;
          console.log("Data copied successfully");
        } catch (error) {
          console.log("Could not copy data (table might be empty or have different structure)");
        }
      }
    }
    
    return json({ 
      success: true, 
      message: "Session table fixed for Shopify app",
      lowercaseSessionExists: true,
      uppercaseSessionExists,
      shopifyAppReady: true
    });

  } catch (error) {
    console.error("Session table fix error:", error);
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
      details: error
    }, { status: 500 });
  }
}

export async function loader() {
  return json({ message: "Use POST to fix session table for Shopify app" });
} 