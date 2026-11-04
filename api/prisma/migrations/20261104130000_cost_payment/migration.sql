-- CreateEnum
CREATE TYPE "CostPayment" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- AlterTable
ALTER TABLE "InvoiceCost" ADD COLUMN "payment" "CostPayment" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN "dueAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "InvoiceCost_vendor_idx" ON "InvoiceCost"("vendor");
