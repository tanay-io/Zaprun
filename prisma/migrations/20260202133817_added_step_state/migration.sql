-- CreateEnum
CREATE TYPE "StepExecutionStatus" AS ENUM ('success', 'error');

-- CreateTable
CREATE TABLE "StepState" (
    "id" TEXT NOT NULL,
    "zapRunId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "StepExecutionStatus" NOT NULL,
    "output" JSONB,
    "error" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "StepState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StepState_zapRunId_stepIndex_attempt_key" ON "StepState"("zapRunId", "stepIndex", "attempt");

-- AddForeignKey
ALTER TABLE "StepState" ADD CONSTRAINT "StepState_zapRunId_fkey" FOREIGN KEY ("zapRunId") REFERENCES "ZapRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
