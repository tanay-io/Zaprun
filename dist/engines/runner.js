"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runZap = runZap;
const prisma_1 = require("../db/prisma");
const executors_1 = require("../executors");
const interpolate_1 = require("../utils/interpolate");
async function runZap(zapRunId) {
    const zapRun = await prisma_1.prisma.zapRun.findUnique({
        where: { id: zapRunId },
    });
    if (!zapRun) {
        throw new Error("ZapRun not found");
    }
    if (zapRun.status !== "pending") {
        throw new Error(`Illegal ZapRun state: ${zapRun.status}`);
    }
    await prisma_1.prisma.zapRun.update({
        where: { id: zapRunId },
        data: { status: "running" },
    });
    // 3. Fetch actions
    const actions = await prisma_1.prisma.zapAction.findMany({
        where: { zapId: zapRun.zapId },
        orderBy: { stepOrder: "asc" },
        include: {
            availableAction: true,
        },
    });
    let payload = zapRun.triggerPayload;
    const steps = {};
    for (const action of actions) {
        const executor = executors_1.executorRegistry[action.availableAction.key];
        if (!executor) {
            await prisma_1.prisma.zapRun.update({
                where: { id: zapRunId },
                data: {
                    status: "failed",
                    failedStepId: action.id,
                    error: {
                        code: "EXECUTOR_NOT_FOUND",
                        message: `No executor for ${action.availableAction.key}`,
                        retriable: false,
                    },
                    finishedAt: new Date(),
                },
            });
            return;
        }
        const resolvedConfig = (0, interpolate_1.interpolateConfig)(action.config, {
            payload,
            steps,
        });
        const result = await executor({
            payload,
            config: resolvedConfig,
        });
        if (result.status === "error") {
            await prisma_1.prisma.zapRun.update({
                where: { id: zapRunId },
                data: {
                    status: "failed",
                    failedStepId: action.id,
                    error: result.error,
                    finishedAt: new Date(),
                },
            });
            return;
        }
        steps[`step${action.stepOrder}`] = result.output;
    }
    await prisma_1.prisma.zapRun.update({
        where: { id: zapRunId },
        data: {
            status: "success",
            finishedAt: new Date(),
        },
    });
}
