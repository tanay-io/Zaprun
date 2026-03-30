/*
  Warnings:

  - A unique constraint covering the columns `[latestVersionId]` on the table `Zap` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Zap" ADD COLUMN     "latestVersionId" TEXT;

-- CreateTable
CREATE TABLE "ZapVersion" (
    "id" TEXT NOT NULL,
    "zapId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZapVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZapVersionStep" (
    "id" TEXT NOT NULL,
    "zapVersionId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "actionKey" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "stepDefinitionHash" TEXT,

    CONSTRAINT "ZapVersionStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZapVersion_zapId_versionNumber_key" ON "ZapVersion"("zapId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ZapVersionStep_zapVersionId_stepIndex_key" ON "ZapVersionStep"("zapVersionId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Zap_latestVersionId_key" ON "Zap"("latestVersionId");

-- AddForeignKey
ALTER TABLE "Zap" ADD CONSTRAINT "Zap_latestVersionId_fkey" FOREIGN KEY ("latestVersionId") REFERENCES "ZapVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZapVersion" ADD CONSTRAINT "ZapVersion_zapId_fkey" FOREIGN KEY ("zapId") REFERENCES "Zap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZapVersionStep" ADD CONSTRAINT "ZapVersionStep_zapVersionId_fkey" FOREIGN KEY ("zapVersionId") REFERENCES "ZapVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
