import { prisma } from "../db/prisma";

export async function failJob(outboxId: string) {
  const result = await prisma.zapRunOutbox.updateMany({
    where: {
      id: outboxId,
      status: "processing",
    },
    data: {
      status: "failed",
      lockedUntil: null,
    },
  });

  if (result.count !== 1) {
    throw new Error(
      `Invariant violation: expected to fail exactly 1 outbox job, but failed ${result.count} (outboxId=${outboxId})`,
    );
  }
}
