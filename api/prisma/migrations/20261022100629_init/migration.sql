-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "Mode" AS ENUM ('AIR', 'SEA', 'ROAD');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('BOOKED', 'IN_TRANSIT', 'LANDED', 'AWAITING_GATEPASS', 'GATEPASS_ISSUED', 'DELIVERED', 'ON_HOLD', 'CUSTOMS_EXAM', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "refNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "hsCodeId" TEXT,
    "goodsValue" DECIMAL(14,2) NOT NULL,
    "insurance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'BOOKED',
    "blAwbNo" TEXT,
    "eta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "lengthCm" DECIMAL(10,2) NOT NULL,
    "widthCm" DECIMAL(10,2) NOT NULL,
    "heightCm" DECIMAL(10,2) NOT NULL,
    "weightKg" DECIMAL(10,2) NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "ratePerUnit" DECIMAL(10,2) NOT NULL,
    "minCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fuelPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "handling" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HsCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dutyPct" DECIMAL(5,2) NOT NULL,
    "salesTaxPct" DECIMAL(5,2) NOT NULL,
    "whtPct" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "HsCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(14,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_refNo_key" ON "Shipment"("refNo");

-- CreateIndex
CREATE UNIQUE INDEX "RateCard_mode_origin_destination_key" ON "RateCard"("mode", "origin", "destination");

-- CreateIndex
CREATE UNIQUE INDEX "HsCode_code_key" ON "HsCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shipmentId_key" ON "Invoice"("shipmentId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_hsCodeId_fkey" FOREIGN KEY ("hsCodeId") REFERENCES "HsCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
