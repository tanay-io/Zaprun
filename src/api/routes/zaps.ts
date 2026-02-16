import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { buildNewVersionFromActions } from "../../services/versionBuilder";

const router = Router();

type TriggerInput = {
  availableTriggerId: string;
  config: unknown;
};

type ActionInput = {
  availableActionId: string;
  config: unknown;
};

type CreateZapBody = {
  userId: string;
  name: string;
  status?: "active" | "paused";
  trigger: TriggerInput;
  actions: ActionInput[];
};

type UpdateZapBody = {
  name?: string;
  status?: "active" | "paused";
  trigger?: TriggerInput;
  actions?: ActionInput[];
};
router.post("/zaps", async (req, res) => {
  const body = req.body as CreateZapBody;

  if (
    !body?.userId ||
    !body?.name ||
    !body?.trigger ||
    !Array.isArray(body.actions)
  ) {
    return res.status(400).json({
      message: "Invalid body. Required: userId, name, trigger, actions[]",
    });
  }

  if (body.actions.length === 0) {
    return res.status(400).json({
      message: "Zap must contain at least one action",
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const zap = await tx.zap.create({
      data: {
        userId: body.userId,
        name: body.name,
        status: body.status ?? "paused",
      },
    });

    await tx.zapTrigger.create({
      data: {
        zapId: zap.id,
        availableTriggerId: body.trigger.availableTriggerId,
        config: body.trigger.config as Prisma.InputJsonValue,
      },
    });

    await tx.zapAction.createMany({
      data: body.actions.map((action, index) => ({
        zapId: zap.id,
        availableActionId: action.availableActionId,
        stepOrder: index,
        config: action.config as Prisma.InputJsonValue,
      })),
    });

    const version = await buildNewVersionFromActions(zap.id, tx);
    return { zap, version };
  });

  return res.status(201).json(result);
});

router.put("/zaps/:zapId", async (req, res) => {
  const zapId = req.params.zapId;
  const body = req.body as UpdateZapBody;

  const existing = await prisma.zap.findUnique({ where: { id: zapId } });
  if (!existing) {
    return res.status(404).json({ message: "Zap not found" });
  }

  const result = await prisma.$transaction(async (tx) => {
    if (body.name || body.status) {
      await tx.zap.update({
        where: { id: zapId },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.status ? { status: body.status } : {}),
        },
      });
    }

    if (body.trigger) {
      await tx.zapTrigger.upsert({
        where: { zapId },
        create: {
          zapId,
          availableTriggerId: body.trigger.availableTriggerId,
          config: body.trigger.config as Prisma.InputJsonValue,
        },
        update: {
          availableTriggerId: body.trigger.availableTriggerId,
          config: body.trigger.config as Prisma.InputJsonValue,
        },
      });
    }

    if (body.actions) {
      await tx.zapAction.deleteMany({ where: { zapId } });
      if (body.actions.length > 0) {
        await tx.zapAction.createMany({
          data: body.actions.map((action, index) => ({
            zapId,
            availableActionId: action.availableActionId,
            stepOrder: index,
            config: action.config as Prisma.InputJsonValue,
          })),
        });
      }
    }

    const shouldCreateVersion =
      Array.isArray(body.actions) || !existing.latestVersionId;
    const version = shouldCreateVersion
      ? await buildNewVersionFromActions(zapId, tx)
      : null;
    const zap = await tx.zap.findUnique({
      where: { id: zapId },
      include: { trigger: true },
    });

    return { zap, version };
  });

  return res.status(200).json(result);
});

export default router;
