/*
  Warnings:

  - A unique constraint covering the columns `[sourceInvoiceId]` on the table `ClearanceJob` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `customerName` to the `ClearanceJob` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ClearanceJob" DROP CONSTRAINT "ClearanceJob_shipmentId_fkey";

-- AlterTable
ALTER TABLE "ClearanceJob" ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "customerName" TEXT NOT NULL,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "customerTax" TEXT,
ADD COLUMN     "details" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "importedLines" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "includeFreight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceInvoiceId" TEXT,
ALTER COLUMN "shipmentId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ClearanceJob_sourceInvoiceId_key" ON "ClearanceJob"("sourceInvoiceId");

-- AddForeignKey
ALTER TABLE "ClearanceJob" ADD CONSTRAINT "ClearanceJob_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceJob" ADD CONSTRAINT "ClearanceJob_sourceInvoiceId_fkey" FOREIGN KEY ("sourceInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
