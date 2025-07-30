-- CreateTable
CREATE TABLE "DiscountPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "percentOff" REAL NOT NULL,
    "discountPlanId" TEXT NOT NULL,
    CONSTRAINT "Rule_discountPlanId_fkey" FOREIGN KEY ("discountPlanId") REFERENCES "DiscountPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "CustomerSegment" (
    "customerId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,

    PRIMARY KEY ("customerId", "segmentId"),
    CONSTRAINT "CustomerSegment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerSegment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
