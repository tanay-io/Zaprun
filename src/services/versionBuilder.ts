import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { hashStepDefinition } from "../utils/hashStepDefinition";

type DbClient = Prisma.TransactionClient;

async function createVersionFromActions(zapId: string, tx: DbClient) {
    const latestVersion = await tx.zapVersion.findFirst({
      where: { zapId },
      orderBy: { versionNumber: "desc" },
    });

    const nextVersionNumber = latestVersion
      ? latestVersion.versionNumber + 1
      : 1;

    const newVersion = await tx.zapVersion.create({
      data: {
        zapId,
        versionNumber: nextVersionNumber,
      },
    });

    const actions = await tx.zapAction.findMany({
      where: { zapId },
      orderBy: { stepOrder: "asc" },
      include: {
        availableAction: true,
      },
    });

    await tx.zapVersionStep.createMany({
      data: actions.map((action) => ({
        zapVersionId: newVersion.id,
        stepIndex: action.stepOrder,
        actionKey: action.availableAction.key,
        config: action.config as any,
        inputSchema: action.availableAction.schema as any,
        outputSchema: {} as any,
        stepDefinitionHash: hashStepDefinition({
          actionKey: action.availableAction.key,
          config: action.config,
          inputSchema: action.availableAction.schema,
          outputSchema: {},
        }),
      })),
    });
    await tx.zap.update({
      where: { id: zapId },
      data: {
        latestVersionId: newVersion.id,
      },
    });

    return newVersion;
}

export async function buildNewVersionFromActions(
  zapId: string,
  tx?: DbClient,
) {
  if (tx) {
    return createVersionFromActions(zapId, tx);
  }

  return prisma.$transaction(async (trx) => createVersionFromActions(zapId, trx));
}
