-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "dutyPct" DECIMAL(5,2),
ADD COLUMN     "freightOverride" DECIMAL(14,2),
ADD COLUMN     "fuelPct" DECIMAL(5,2),
ADD COLUMN     "handling" DECIMAL(10,2),
ADD COLUMN     "minCharge" DECIMAL(10,2),
ADD COLUMN     "ratePerUnit" DECIMAL(10,2),
ADD COLUMN     "salesTaxPct" DECIMAL(5,2),
ADD COLUMN     "volDivisor" INTEGER,
ADD COLUMN     "whtPct" DECIMAL(5,2);
