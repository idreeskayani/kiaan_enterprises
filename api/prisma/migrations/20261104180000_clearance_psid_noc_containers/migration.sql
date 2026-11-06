-- AlterTable
ALTER TABLE "ClearanceJob" ADD COLUMN "paidThroughPsid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "containers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "nocs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "biltyTransport" JSONB;
