-- Remove the UNINVOICED payment state. A job with no invoice now has payment = NULL.
ALTER TABLE "ClearanceJob" ALTER COLUMN "payment" DROP DEFAULT;
ALTER TABLE "ClearanceJob" ALTER COLUMN "payment" DROP NOT NULL;

ALTER TYPE "ClearancePayment" RENAME TO "ClearancePayment_old";
CREATE TYPE "ClearancePayment" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'DRAFT');

ALTER TABLE "ClearanceJob"
  ALTER COLUMN "payment" TYPE "ClearancePayment"
  USING (CASE WHEN "payment"::text = 'UNINVOICED' THEN NULL ELSE "payment"::text::"ClearancePayment" END);

DROP TYPE "ClearancePayment_old";