-- CreateTable
CREATE TABLE "AvailableProvider" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docsUrl" TEXT,
    "authTypes" TEXT[],
    "rateLimitHint" JSONB,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailableProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvailableProvider_key_key" ON "AvailableProvider"("key");

-- AlterTable
ALTER TABLE "AvailableTrigger" ADD COLUMN "availableProviderId" TEXT;

-- AlterTable
ALTER TABLE "AvailableAction" ADD COLUMN "availableProviderId" TEXT;

-- AlterTable
ALTER TABLE "StepState" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StepState_idempotencyKey_key" ON "StepState"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "AvailableTrigger" ADD CONSTRAINT "AvailableTrigger_availableProviderId_fkey" FOREIGN KEY ("availableProviderId") REFERENCES "AvailableProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailableAction" ADD CONSTRAINT "AvailableAction_availableProviderId_fkey" FOREIGN KEY ("availableProviderId") REFERENCES "AvailableProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
