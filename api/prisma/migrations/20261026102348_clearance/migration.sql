-- CreateEnum
CREATE TYPE "ClearanceStatus" AS ENUM ('PENDING', 'DOCS_RECEIVED', 'GD_FILED', 'ASSESSED', 'DUTY_PAID', 'EXAMINATION', 'RELEASED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClearancePayment" AS ENUM ('UNINVOICED', 'UNPAID', 'PARTIAL', 'PAID');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CLEARING_AGENT';

-- CreateTable
CREATE TABLE "ClearanceJob" (
    "id" TEXT NOT NULL,
    "jobNo" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "hsCodeId" TEXT,
    "assessableValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gdNo" TEXT,
    "status" "ClearanceStatus" NOT NULL DEFAULT 'PENDING',
    "lines" JSONB NOT NULL DEFAULT '[]',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "invoiceNo" TEXT,
    "invoicedAt" TIMESTAMP(3),
    "payment" "ClearancePayment" NOT NULL DEFAULT 'UNINVOICED',
    "dueAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClearanceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClearanceHistory" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "ClearanceStatus" NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClearanceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClearanceJob_jobNo_key" ON "ClearanceJob"("jobNo");

-- CreateIndex
CREATE UNIQUE INDEX "ClearanceJob_shipmentId_key" ON "ClearanceJob"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClearanceJob_invoiceNo_key" ON "ClearanceJob"("invoiceNo");

-- AddForeignKey
ALTER TABLE "ClearanceJob" ADD CONSTRAINT "ClearanceJob_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceJob" ADD CONSTRAINT "ClearanceJob_hsCodeId_fkey" FOREIGN KEY ("hsCodeId") REFERENCES "HsCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceHistory" ADD CONSTRAINT "ClearanceHistory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ClearanceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceHistory" ADD CONSTRAINT "ClearanceHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
