/*
  Warnings:

  - Added the required column `zapVersionId` to the `ZapRun` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ZapRun" ADD COLUMN     "zapVersionId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "ZapRun" ADD CONSTRAINT "ZapRun_zapVersionId_fkey" FOREIGN KEY ("zapVersionId") REFERENCES "ZapVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
