import { Router } from "express";
import { prisma } from "../../db/prisma";
import { runZap } from "../../engines/runner";

const router = Router();

router.post("/debug/run/:zapRunId", async (req, res) => {
  const zapRunId = req.params.zapRunId;
  try {
    await runZap(zapRunId);
    return res.status(200).json({ ok: true, zapRunId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "runZap failed";
    return res.status(500).json({ ok: false, error: message });
  }
});

router.get("/debug/zap-runs/:zapRunId", async (req, res) => {
  const zapRunId = req.params.zapRunId;
  const zapRun = await prisma.zapRun.findUnique({
    where: { id: zapRunId },
  });
  if (!zapRun) {
    return res.status(404).json({ ok: false, error: "ZapRun not found" });
  }
  return res.status(200).json({ ok: true, zapRun });
});

export default router;
