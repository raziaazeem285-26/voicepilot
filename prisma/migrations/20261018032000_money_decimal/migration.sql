-- Money fields: Float -> Decimal(65,30) for exact monetary arithmetic
ALTER TABLE "CallLog" ALTER COLUMN "costEstimateUsd" TYPE DECIMAL(65,30) USING "costEstimateUsd"::DECIMAL(65,30);
ALTER TABLE "UsageRecord" ALTER COLUMN "providerCost" TYPE DECIMAL(65,30) USING "providerCost"::DECIMAL(65,30);
ALTER TABLE "BillingPlan" ALTER COLUMN "priceMonthlyUsd" TYPE DECIMAL(65,30) USING "priceMonthlyUsd"::DECIMAL(65,30);
ALTER TABLE "BillingPlan" ALTER COLUMN "overagePerMinUsd" TYPE DECIMAL(65,30) USING "overagePerMinUsd"::DECIMAL(65,30);
