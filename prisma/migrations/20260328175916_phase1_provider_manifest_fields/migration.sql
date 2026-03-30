-- AlterTable
ALTER TABLE "AvailableProvider" ADD COLUMN     "authConfig" JSONB,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "iconUrl" TEXT;
