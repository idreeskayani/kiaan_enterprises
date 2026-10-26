-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "exRate" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "details" JSONB;

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_currency_key" ON "ExchangeRate"("currency");
