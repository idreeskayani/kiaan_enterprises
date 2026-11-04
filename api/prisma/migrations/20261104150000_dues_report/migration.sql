-- CreateEnum
CREATE TYPE "DuesReportStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateTable
CREATE TABLE "DuesReport" (
    "id" TEXT NOT NULL,
    "reportNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "DuesReportStatus" NOT NULL DEFAULT 'DRAFT',
    "totalDue" DECIMAL(14,2) NOT NULL,
    "invoiceCount" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuesReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DuesReport_reportNo_key" ON "DuesReport"("reportNo");

-- CreateIndex
CREATE INDEX "DuesReport_customerId_idx" ON "DuesReport"("customerId");

-- AddForeignKey
ALTER TABLE "DuesReport" ADD CONSTRAINT "DuesReport_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
