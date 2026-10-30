-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "shipmentId" DROP NOT NULL,
ADD COLUMN "customerId" TEXT,
ADD COLUMN "details" JSONB;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;