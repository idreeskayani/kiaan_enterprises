-- CreateTable
CREATE TABLE "ClearanceCustomer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClearanceCustomer_pkey" PRIMARY KEY ("id")
);

-- Customers already typed on clearance jobs become saved customers (one per name, ignoring
-- capitals and extra spaces; the details come from the newest job of that name)
INSERT INTO "ClearanceCustomer" ("id", "name", "phone", "address", "taxNumber")
SELECT DISTINCT ON (lower(btrim(regexp_replace("customerName", '\s+', ' ', 'g'))))
  gen_random_uuid()::text,
  btrim(regexp_replace("customerName", '\s+', ' ', 'g')),
  "customerPhone",
  "customerAddress",
  "customerTax"
FROM "ClearanceJob"
WHERE btrim("customerName") <> ''
ORDER BY lower(btrim(regexp_replace("customerName", '\s+', ' ', 'g'))), "createdAt" DESC;