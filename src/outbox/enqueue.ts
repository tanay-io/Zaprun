import { prisma } from '../db/prisma';

export async function enqueueNextJob(
  zapRunId: string,
  currentStepIndex: number,
) {
  const nextStepIndex = currentStepIndex + 1;
  const result = await prisma.zapRunOutbox.create({
    data: {
      zapRunId: zapRunId,
      status: "pending",
      stepIndex: nextStepIndex,
      attempt: 0,
      lockedUntil: null,
    },
  });


  return result;
}
