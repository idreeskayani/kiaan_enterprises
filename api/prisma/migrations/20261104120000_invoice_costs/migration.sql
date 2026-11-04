-- CreateTable
CREATE TABLE "InvoiceCost" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vendor" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT,
    "foreignAmount" DECIMAL(14,2),
    "exRate" DECIMAL(12,4),
    "note" TEXT,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceCost_invoiceId_idx" ON "InvoiceCost"("invoiceId");

-- AddForeignKey
ALTER TABLE "InvoiceCost" ADD CONSTRAINT "InvoiceCost_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
