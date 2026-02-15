import { Router } from "express";
import { prisma } from "../../db/prisma";
import { publishOutbox } from "../../kafka/producer";

const router = Router();
router.post("/webhook/:zapId", async (req, res) => {
  const zapId = req.params.zapId;
  const payload = req.body;
  const zap = await prisma.zap.findUnique({
    where: {
      id: zapId,
    },
    include: { trigger: true },
  });
  if (!zap || zap.status !== "active") {
    return res.status(404).json({ message: "Zap not found or inactive" });
  }
  if (!zap.latestVersionId) {
    return res
      .status(400)
      .json({ message: "Zap has no latest version" });
  }
  const zapRun = await prisma.zapRun.create({
    data: {
      zapId: zap.id,
      zapVersionId: zap.latestVersionId,
      status: "pending",
      triggerPayload: payload,
    },
  });
  const outbox = await prisma.zapRunOutbox.create({
    data: {
      zapRunId: zapRun.id,
      stepIndex: 0,
      status: "pending",
    },
  });

  await publishOutbox(outbox.id);

  return res
    .status(200)
    .json({ success: true, zapRunId: zapRun.id, outboxId: outbox.id });
});

export default router;
