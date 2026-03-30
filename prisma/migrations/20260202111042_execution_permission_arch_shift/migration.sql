/*
  Warnings:

  - You are about to drop the column `attempts` on the `ZapRunOutbox` table. All the data in the column will be lost.
  - You are about to drop the column `eventType` on the `ZapRunOutbox` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ZapRunOutbox" DROP COLUMN "attempts",
DROP COLUMN "eventType",
ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stepIndex" INTEGER NOT NULL DEFAULT 0;
