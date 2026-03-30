-- AlterTable
ALTER TABLE "ZapRun" ADD COLUMN     "error" JSONB,
ADD COLUMN     "failedStepId" TEXT;
