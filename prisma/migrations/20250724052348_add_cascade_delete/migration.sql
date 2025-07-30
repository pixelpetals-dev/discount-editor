-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "percentOff" REAL NOT NULL,
    "discountPlanId" TEXT NOT NULL,
    CONSTRAINT "Rule_discountPlanId_fkey" FOREIGN KEY ("discountPlanId") REFERENCES "DiscountPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Rule" ("categoryId", "discountPlanId", "id", "percentOff") SELECT "categoryId", "discountPlanId", "id", "percentOff" FROM "Rule";
DROP TABLE "Rule";
ALTER TABLE "new_Rule" RENAME TO "Rule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
