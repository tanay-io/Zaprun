"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNewVersionFromActions = buildNewVersionFromActions;
const prisma_1 = require("../db/prisma");
const hashStepDefinition_1 = require("../utils/hashStepDefinition");
async function createVersionFromActions(zapId, tx) {
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
            config: action.config,
            inputSchema: action.availableAction.schema,
            outputSchema: {},
            stepDefinitionHash: (0, hashStepDefinition_1.hashStepDefinition)({
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
async function buildNewVersionFromActions(zapId, tx) {
    if (tx) {
        return createVersionFromActions(zapId, tx);
    }
    return prisma_1.prisma.$transaction(async (trx) => createVersionFromActions(zapId, trx));
}
