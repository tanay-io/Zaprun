import { prisma } from "../db/prisma";

export async function completeJob(outboxId: string) {
  const job = await prisma.zapRunOutbox.updateMany({
    where: {
      id: outboxId,
      status: "processing",
    },
    data: {
      status: "completed",
      lockedUntil: null,
    },
  });
  if (job.count !== 1) {
    throw new Error(
      `Invariant violation: expected to complete exactly 1 outbox job, but completed ${job.count} (outboxId=${outboxId})`,
    );
  }
}
