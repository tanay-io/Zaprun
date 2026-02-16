import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { publishOutbox } from "../../kafka/producer";

const router = Router();

router.post("/zapRuns/:zapRunId/replay", async (req, res) => {
  const zapRunId = req.params.zapRunId;

  const oldRun = await prisma.zapRun.findUnique({
    where: { id: zapRunId },
  });

  if (!oldRun) {
    return res.status(404).json({ message: "ZapRun not found" });
  }

  const result = await prisma.$transaction(async (tx) => {
    const newRun = await tx.zapRun.create({
      data: {
        zapId: oldRun.zapId,
        zapVersionId: oldRun.zapVersionId,
        triggerPayload: oldRun.triggerPayload ?? Prisma.JsonNull,
        status: "pending",
      },
    });

    const outbox = await tx.zapRunOutbox.create({
      data: {
        zapRunId: newRun.id,
        stepIndex: 0,
        status: "pending",
      },
    });

    return { newRun, outbox };
  });

  await publishOutbox(result.outbox.id);

  return res.status(201).json({
    message: "Replay started",
    newZapRunId: result.newRun.id,
  });
});

export default router;
