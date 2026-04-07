import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { publishOutbox } from "../../kafka/producer";

const router = Router();

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

router.get("/zapRuns", async (req, res) => {
  const userId = getString(req.header("x-user-id")) ?? getString(req.query.userId);
  if (!userId) {
    return res.status(400).json({
      message:
        "Missing user identity. Provide x-user-id header or userId query param.",
    });
  }

  const zapId = getString(req.query.zapId);
  const status = getString(req.query.status);
  const parsedStatus =
    status === "pending" ||
    status === "running" ||
    status === "success" ||
    status === "failed"
      ? status
      : undefined;

  const limit = Math.min(Math.max(getPositiveInt(req.query.limit, 20), 1), 100);
  const offset = Math.max(getPositiveInt(req.query.offset, 0), 0);

  const where: Prisma.ZapRunWhereInput = {
    zap: {
      userId,
    },
    ...(zapId ? { zapId } : {}),
    ...(parsedStatus ? { status: parsedStatus } : {}),
  };

  const [total, runs] = await Promise.all([
    prisma.zapRun.count({ where }),
    prisma.zapRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        stepStates: {
          orderBy: [{ stepIndex: "asc" }, { attempt: "asc" }],
          select: {
            id: true,
            stepIndex: true,
            attempt: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            error: true,
          },
        },
      },
    }),
  ]);

  return res.status(200).json({
    total,
    limit,
    offset,
    runs,
  });
});

router.get("/zapRuns/:id", async (req, res) => {
  const userId = getString(req.header("x-user-id")) ?? getString(req.query.userId);
  if (!userId) {
    return res.status(400).json({
      message:
        "Missing user identity. Provide x-user-id header or userId query param.",
    });
  }

  const run = await prisma.zapRun.findUnique({
    where: { id: req.params.id },
    include: {
      zap: {
        select: {
          id: true,
          name: true,
          userId: true,
        },
      },
      stepStates: {
        orderBy: [{ stepIndex: "asc" }, { attempt: "asc" }],
      },
      outbox: {
        orderBy: [{ stepIndex: "asc" }, { attempt: "asc" }],
      },
      zapVersion: {
        include: {
          steps: {
            orderBy: { stepIndex: "asc" },
          },
        },
      },
    },
  });

  if (!run || run.zap.userId !== userId) {
    return res.status(404).json({ message: "ZapRun not found" });
  }

  return res.status(200).json({ run });
});

router.post("/zapRuns/:zapRunId/replay", async (req, res) => {
  const userId = getString(req.header("x-user-id")) ?? getString(req.query.userId);
  if (!userId) {
    return res.status(400).json({
      message:
        "Missing user identity. Provide x-user-id header or userId query param.",
    });
  }

  const zapRunId = req.params.zapRunId;

  const oldRun = await prisma.zapRun.findUnique({
    where: { id: zapRunId },
    include: {
      zap: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!oldRun || oldRun.zap.userId !== userId) {
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
