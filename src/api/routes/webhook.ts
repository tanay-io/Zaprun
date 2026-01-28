import { Router } from "express";
import { prisma } from "../../db/prisma";

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
  const zapRun = await prisma.zapRun.create({
    data: {
      zapId: zap.id,
      status: "pending",
      triggerPayload: payload,
    },
  });
  await prisma.zapRunOutbox.create({
    data: {
      eventType: "ZAP_RUN_CREATED",
      zapRunId: zapRun.id,
      payload: {
        zapRunId: zapRun.id,
      },
      status: "pending",
    },
  });
  return res.status(200).json({ success: true });
});
export default router;
