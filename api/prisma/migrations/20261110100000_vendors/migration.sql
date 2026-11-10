-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- Vendors already typed on past costs become saved vendors
INSERT INTO "Vendor" ("id", "name")
SELECT gen_random_uuid()::text, v.name
FROM (SELECT DISTINCT TRIM("vendor") AS name FROM "InvoiceCost" WHERE "vendor" IS NOT NULL AND TRIM("vendor") <> '') v;
