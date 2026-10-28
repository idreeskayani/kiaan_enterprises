-- AlterTable
ALTER TABLE "ClearanceJob" ADD COLUMN     "duties" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "modeOfTransport" TEXT,
ADD COLUMN     "virNumber" TEXT;
