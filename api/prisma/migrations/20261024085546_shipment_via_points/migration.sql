-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "viaPoints" TEXT[] DEFAULT ARRAY[]::TEXT[];
