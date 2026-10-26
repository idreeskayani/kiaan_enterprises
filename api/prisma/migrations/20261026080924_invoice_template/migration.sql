-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "foreignAmount" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "exRate" DECIMAL(12,4),
ADD COLUMN     "extraCharges" JSONB,
ADD COLUMN     "flight" TEXT,
ADD COLUMN     "freightLabel" TEXT,
ADD COLUMN     "hawbNo" TEXT;
