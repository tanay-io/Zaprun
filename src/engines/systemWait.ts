import { prisma } from "../db/prisma";
import { completeJob } from "../outbox/complete";

export async function handleSystemWait(
  zapRunId: string,
  currentOutboxId: string,
  currentStepIndex: number,
  durationMs: number,
) {
  const resumeAt = new Date(Date.now() + durationMs);
  const newRow = await prisma.zapRunOutbox.create({
    data: {
      zapRunId,
      stepIndex: currentStepIndex,
      status: "pending",
      resumeAt,
      attempt: 0,
    },
  });
  await completeJob(currentOutboxId);
}
