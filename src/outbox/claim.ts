import { prisma } from "../db/prisma";

export async function claimOutboxJob(
  outboxJobId: string,
  lockMs = 60_000,
): Promise<boolean> {
  const now = new Date();
  const lockUntil = new Date(Date.now() + lockMs);

  const result = await prisma.zapRunOutbox.updateMany({
    where: {
      id: outboxJobId,
      status: "pending",
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: {
      status: "processing",
      lockedUntil: lockUntil,
    },
  });

  return result.count === 1;
}
