-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "clearanceJobId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_clearanceJobId_idx" ON "Payment"("clearanceJobId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clearanceJobId_fkey" FOREIGN KEY ("clearanceJobId") REFERENCES "ClearanceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ClearanceReport" (
    "id" TEXT NOT NULL,
    "reportNo" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "status" "DuesReportStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "totalDue" DECIMAL(14,2) NOT NULL,
    "invoiceCount" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClearanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClearanceReport_reportNo_key" ON "ClearanceReport"("reportNo");

-- CreateIndex
CREATE INDEX "ClearanceReport_customerName_idx" ON "ClearanceReport"("customerName");
