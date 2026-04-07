import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { buildNewVersionFromActions } from "../../services/versionBuilder";
import { validateStepConfig } from "../../utils/validateStepConfig";

const router = Router();

type TriggerInput = {
  availableTriggerId?: string;
  availableTriggerKey?: string;
  config: unknown;
};

type ActionInput = {
  availableActionId?: string;
  availableActionKey?: string;
  config: unknown;
};

type CreateZapBody = {
  userId?: string;
  name?: string;
  status?: "active" | "paused";
  trigger?: TriggerInput;
  actions?: ActionInput[];
};

type UpdateZapBody = {
  userId?: string;
  name?: string;
  status?: "active" | "paused";
  trigger?: TriggerInput;
  actions?: ActionInput[];
};

type ResolvedActionInput = {
  availableActionId: string;
  availableActionKey: string;
  config: unknown;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function resolveUserId(bodyOrQuery: unknown, headerUserId: string | undefined): string | null {
  if (headerUserId) {
    return headerUserId;
  }

  const record = toRecord(bodyOrQuery);
  if (!record) {
    return null;
  }

  return getString(record.userId);
}

async function resolveTriggerId(
  tx: Prisma.TransactionClient,
  trigger: TriggerInput,
): Promise<string | null> {
  if (trigger.availableTriggerId) {
    const existing = await tx.availableTrigger.findUnique({
      where: { id: trigger.availableTriggerId },
      select: { id: true },
    });

    return existing?.id ?? null;
  }

  if (trigger.availableTriggerKey) {
    const existing = await tx.availableTrigger.findUnique({
      where: { key: trigger.availableTriggerKey },
      select: { id: true },
    });

    return existing?.id ?? null;
  }

  return null;
}

async function resolveActions(
  tx: Prisma.TransactionClient,
  actions: ActionInput[],
): Promise<{ resolved: ResolvedActionInput[]; unknown: string[] }> {
  const ids = actions
    .map((action) => action.availableActionId)
    .filter((value): value is string => Boolean(value));
  const keys = actions
    .map((action) => action.availableActionKey)
    .filter((value): value is string => Boolean(value));

  const where: Prisma.AvailableActionWhereInput[] = [];
  if (ids.length > 0) {
    where.push({ id: { in: ids } });
  }
  if (keys.length > 0) {
    where.push({ key: { in: keys } });
  }

  const dbActions =
    where.length > 0
      ? await tx.availableAction.findMany({
          where: { OR: where },
          select: { id: true, key: true },
        })
      : [];

  const byId = new Map(dbActions.map((action) => [action.id, action]));
  const byKey = new Map(dbActions.map((action) => [action.key, action]));

  const resolved: ResolvedActionInput[] = [];
  const unknown: string[] = [];

  for (const action of actions) {
    const selected =
      (action.availableActionId
        ? byId.get(action.availableActionId)
        : undefined) ??
      (action.availableActionKey
        ? byKey.get(action.availableActionKey)
        : undefined);

    if (!selected) {
      unknown.push(
        action.availableActionId ?? action.availableActionKey ?? "<missing>",
      );
      continue;
    }

    resolved.push({
      availableActionId: selected.id,
      availableActionKey: selected.key,
      config: action.config,
    });
  }

  return { resolved, unknown };
}

router.get("/zaps", async (req, res) => {
  const userId = resolveUserId(req.query, req.header("x-user-id") ?? undefined);

  if (!userId) {
    return res.status(400).json({
      message:
        "Missing user identity. Provide x-user-id header or userId query param.",
    });
  }

  const status = req.query.status;
  const parsedStatus =
    status === "active" || status === "paused" ? status : undefined;

  const zaps = await prisma.zap.findMany({
    where: {
      userId,
      ...(parsedStatus ? { status: parsedStatus } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      trigger: {
        include: {
          availableTrigger: {
            select: {
              key: true,
              name: true,
            },
          },
        },
      },
      actions: {
        orderBy: { stepOrder: "asc" },
        include: {
          availableAction: {
            select: {
              key: true,
              name: true,
            },
          },
        },
      },
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });

  return res.status(200).json({
    zaps: zaps.map((zap) => ({
      id: zap.id,
      name: zap.name,
      status: zap.status,
      createdAt: zap.createdAt,
      updatedAt: zap.updatedAt,
      trigger: zap.trigger
        ? {
            key: zap.trigger.availableTrigger.key,
            name: zap.trigger.availableTrigger.name,
          }
        : null,
      actions: zap.actions.map((action) => ({
        key: action.availableAction.key,
        name: action.availableAction.name,
        stepOrder: action.stepOrder,
      })),
      latestRun: zap.runs[0] ?? null,
    })),
  });
});

router.post("/zaps", async (req, res) => {
  const body = req.body as CreateZapBody;
  const userId = resolveUserId(body, req.header("x-user-id") ?? undefined);

  if (!userId || !body?.name || !body?.trigger || !Array.isArray(body.actions)) {
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
    const resolvedTriggerId = await resolveTriggerId(tx, body.trigger!);
    if (!resolvedTriggerId) {
      return {
        statusCode: 400,
        payload: {
          message:
            "Invalid trigger. Provide availableTriggerId or availableTriggerKey.",
        },
      } as const;
    }

    const { resolved: resolvedActions, unknown } = await resolveActions(
      tx,
      body.actions!,
    );

    if (unknown.length > 0) {
      return {
        statusCode: 400,
        payload: {
          message:
            "One or more actions could not be resolved. Provide availableActionId or availableActionKey.",
          unknownActions: unknown,
        },
      } as const;
    }

    const validationErrors: {
      step: number;
      actionKey: string;
      errors: { field: string; message: string }[];
    }[] = [];

    for (let i = 0; i < resolvedActions.length; i++) {
      const action = resolvedActions[i];
      const validation = validateStepConfig(action.availableActionKey, action.config);
      if (!validation.valid) {
        validationErrors.push({
          step: i,
          actionKey: action.availableActionKey,
          errors: validation.errors,
        });
      }
    }

    if (validationErrors.length > 0) {
      return {
        statusCode: 400,
        payload: {
          message: "Action config validation failed",
          validationErrors,
        },
      } as const;
    }

    const zap = await tx.zap.create({
      data: {
        userId,
        name: body.name!,
        status: body.status ?? "paused",
      },
    });

    await tx.zapTrigger.create({
      data: {
        zapId: zap.id,
        availableTriggerId: resolvedTriggerId,
        config: body.trigger!.config as Prisma.InputJsonValue,
      },
    });

    await tx.zapAction.createMany({
      data: resolvedActions.map((action, index) => ({
        zapId: zap.id,
        availableActionId: action.availableActionId,
        stepOrder: index,
        config: action.config as Prisma.InputJsonValue,
      })),
    });

    const version = await buildNewVersionFromActions(zap.id, tx);

    return {
      statusCode: 201,
      payload: { zap, version },
    } as const;
  });

  return res.status(result.statusCode).json(result.payload);
});

router.put("/zaps/:zapId", async (req, res) => {
  const zapId = req.params.zapId;
  const body = req.body as UpdateZapBody;
  const userId = resolveUserId(body, req.header("x-user-id") ?? undefined);

  const existing = await prisma.zap.findUnique({ where: { id: zapId } });
  if (!existing) {
    return res.status(404).json({ message: "Zap not found" });
  }

  if (userId && existing.userId !== userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const result = await prisma.$transaction(async (tx) => {
    let resolvedActions: ResolvedActionInput[] | null = null;

    if (body.actions) {
      const resolution = await resolveActions(tx, body.actions);
      if (resolution.unknown.length > 0) {
        return {
          statusCode: 400,
          payload: {
            message:
              "One or more actions could not be resolved. Provide availableActionId or availableActionKey.",
            unknownActions: resolution.unknown,
          },
        } as const;
      }

      resolvedActions = resolution.resolved;

      const validationErrors: {
        step: number;
        actionKey: string;
        errors: { field: string; message: string }[];
      }[] = [];

      for (let i = 0; i < resolvedActions.length; i++) {
        const action = resolvedActions[i];
        const validation = validateStepConfig(action.availableActionKey, action.config);
        if (!validation.valid) {
          validationErrors.push({
            step: i,
            actionKey: action.availableActionKey,
            errors: validation.errors,
          });
        }
      }

      if (validationErrors.length > 0) {
        return {
          statusCode: 400,
          payload: {
            message: "Action config validation failed",
            validationErrors,
          },
        } as const;
      }
    }

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
      const resolvedTriggerId = await resolveTriggerId(tx, body.trigger);
      if (!resolvedTriggerId) {
        return {
          statusCode: 400,
          payload: {
            message:
              "Invalid trigger. Provide availableTriggerId or availableTriggerKey.",
          },
        } as const;
      }

      await tx.zapTrigger.upsert({
        where: { zapId },
        create: {
          zapId,
          availableTriggerId: resolvedTriggerId,
          config: body.trigger.config as Prisma.InputJsonValue,
        },
        update: {
          availableTriggerId: resolvedTriggerId,
          config: body.trigger.config as Prisma.InputJsonValue,
        },
      });
    }

    if (resolvedActions) {
      await tx.zapAction.deleteMany({ where: { zapId } });
      if (resolvedActions.length > 0) {
        await tx.zapAction.createMany({
          data: resolvedActions.map((action, index) => ({
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

    return {
      statusCode: 200,
      payload: { zap, version },
    } as const;
  });

  return res.status(result.statusCode).json(result.payload);
});

router.delete("/zaps/:zapId", async (req, res) => {
  const zapId = req.params.zapId;
  const userId = resolveUserId(req.query, req.header("x-user-id") ?? undefined);

  if (!userId) {
    return res.status(400).json({
      message:
        "Missing user identity. Provide x-user-id header or userId query param.",
    });
  }

  const zap = await prisma.zap.findUnique({
    where: { id: zapId },
    select: { id: true, userId: true },
  });

  if (!zap) {
    return res.status(404).json({ message: "Zap not found" });
  }

  if (zap.userId !== userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await prisma.$transaction(async (tx) => {
    const runs = await tx.zapRun.findMany({
      where: { zapId },
      select: { id: true },
    });
    const runIds = runs.map((run) => run.id);

    const versions = await tx.zapVersion.findMany({
      where: { zapId },
      select: { id: true },
    });
    const versionIds = versions.map((version) => version.id);

    if (runIds.length > 0) {
      await tx.stepState.deleteMany({
        where: { zapRunId: { in: runIds } },
      });
      await tx.zapRunOutbox.deleteMany({
        where: { zapRunId: { in: runIds } },
      });
      await tx.zapRun.deleteMany({
        where: { id: { in: runIds } },
      });
    }

    if (versionIds.length > 0) {
      await tx.zap.update({
        where: { id: zapId },
        data: { latestVersionId: null },
      });
      await tx.zapVersionStep.deleteMany({
        where: { zapVersionId: { in: versionIds } },
      });
      await tx.zapVersion.deleteMany({
        where: { id: { in: versionIds } },
      });
    }

    await tx.zapAction.deleteMany({ where: { zapId } });
    await tx.zapTrigger.deleteMany({ where: { zapId } });
    await tx.zap.delete({ where: { id: zapId } });
  });

  return res.status(200).json({
    message: "Zap deleted",
    zapId,
  });
});

export default router;
