import { json } from "@remix-run/node";
import { prisma } from "../db.server";

export async function action({ request }: { request: Request }) {
  try {
    console.log("Starting database setup...");
    console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);
    console.log("POSTGRES_URL exists:", !!process.env.POSTGRES_URL);
    
    // Check if Session table exists (this is critical for Shopify auth)
    let sessionTableExists = false;
    try {
      await prisma.$queryRaw`SELECT 1 FROM "Session" LIMIT 1`;
      sessionTableExists = true;
      console.log("Session table exists");
    } catch (error) {
      console.log("Session table does not exist - will create it");
    }
    
    // Check if other tables exist
    let otherTablesExist = false;
    try {
      await prisma.$queryRaw`SELECT 1 FROM "DiscountPlan" LIMIT 1`;
      otherTablesExist = true;
      console.log("Other tables exist");
    } catch (error) {
      console.log("Other tables do not exist - will create them");
    }
    
    // If Session table doesn't exist, create it (this is critical)
    if (!sessionTableExists) {
      console.log("Creating Session table...");
      await prisma.$executeRaw`
        CREATE TABLE "Session" (
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
          CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
        );
      `;
      
      // Create Session indexes
      await prisma.$executeRaw`
        CREATE INDEX "Session_expires_idx" ON "Session"("expires");
      `;
      
      await prisma.$executeRaw`
        CREATE INDEX "Session_shop_idx" ON "Session"("shop");
      `;
      
      console.log("Session table created successfully");
    }
    
    // If other tables don't exist, create them
    if (!otherTablesExist) {
      console.log("Creating other tables...");
      
      // Create all tables based on the Prisma schema
      await prisma.$executeRaw`
        CREATE TABLE "DiscountPlan" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "targetType" TEXT NOT NULL,
          "targetKey" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "DiscountPlan_pkey" PRIMARY KEY ("id")
        );
      `;

      await prisma.$executeRaw`
        CREATE TABLE "Rule" (
          "id" TEXT NOT NULL,
          "categoryId" TEXT NOT NULL,
          "percentOff" DOUBLE PRECISION NOT NULL,
          "discountPlanId" TEXT NOT NULL,
          CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
        );
      `;

      await prisma.$executeRaw`
        CREATE TABLE "Customer" (
          "id" TEXT NOT NULL,
          "email" TEXT,
          CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
        );
      `;

      await prisma.$executeRaw`
        CREATE TABLE "Segment" (
          "id" TEXT NOT NULL,
          CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
        );
      `;

      await prisma.$executeRaw`
        CREATE TABLE "CustomerSegment" (
          "customerId" TEXT NOT NULL,
          "segmentId" TEXT NOT NULL,
          CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("customerId", "segmentId")
        );
      `;

      // Add foreign key constraints
      await prisma.$executeRaw`
        ALTER TABLE "Rule" ADD CONSTRAINT "Rule_discountPlanId_fkey" 
        FOREIGN KEY ("discountPlanId") REFERENCES "DiscountPlan"("id") ON DELETE CASCADE;
      `;

      await prisma.$executeRaw`
        ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_customerId_fkey" 
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id");
      `;

      await prisma.$executeRaw`
        ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_segmentId_fkey" 
        FOREIGN KEY ("segmentId") REFERENCES "Segment"("id");
      `;

      // Create indexes
      await prisma.$executeRaw`
        CREATE INDEX "DiscountPlan_targetType_targetKey_idx" ON "DiscountPlan"("targetType", "targetKey");
      `;

      await prisma.$executeRaw`
        CREATE INDEX "Rule_categoryId_idx" ON "Rule"("categoryId");
      `;

      await prisma.$executeRaw`
        CREATE INDEX "Rule_discountPlanId_idx" ON "Rule"("discountPlanId");
      `;

      console.log("Other tables created successfully");
    }
    
    return json({ 
      success: true, 
      message: "Database setup completed successfully",
      sessionTableCreated: !sessionTableExists,
      otherTablesCreated: !otherTablesExist
    });

  } catch (error) {
    console.error("Database setup error:", error);
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
      details: error
    }, { status: 500 });
  }
}

export async function loader() {
  return json({ message: "Use POST to setup database" });
} 