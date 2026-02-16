"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleOutboxJob = handleOutboxJob;
const prisma_1 = require("../db/prisma");
const claim_1 = require("../outbox/claim");
const complete_1 = require("../outbox/complete");
const fail_1 = require("../outbox/fail");
const enqueue_1 = require("../outbox/enqueue");
const executors_1 = require("../executors");
const interpolate_1 = require("../utils/interpolate");
const producer_1 = require("../kafka/producer");
const systemWait_1 = require("./systemWait");
async function handleOutboxJob(outboxId) {
    /**
     * STEP 1 — CLAIM OUTBOX JOB
     */
    const MAX_RETRIES = 3;
    const claimed = await (0, claim_1.claimOutboxJob)(outboxId);
    if (!claimed)
        return;
    /**
     * STEP 2 — LOAD OUTBOX ROW
     */
    const outbox = await prisma_1.prisma.zapRunOutbox.findUnique({
        where: { id: outboxId },
    });
    if (!outbox || outbox.status !== "processing")
        return;
    /**
     * STEP 3 — LOAD ZAP RUN
     */
    const zapRun = await prisma_1.prisma.zapRun.findUnique({
        where: { id: outbox.zapRunId },
        include: {
            zapVersion: {
                include: {
                    steps: true,
                },
            },
        },
    });
    if (!zapRun || !zapRun.zapVersion)
        return;
    /**
     * STEP 4 — MARK ZAPRUN AS RUNNING (ONLY ON FIRST STEP)
     */
    if (outbox.stepIndex === 0 && zapRun.status === "pending") {
        await prisma_1.prisma.zapRun.update({
            where: { id: zapRun.id },
            data: { status: "running" },
        });
    }
    /**
     * STEP 5 — LOAD STEP DEFINITION
     */
    const step = zapRun.zapVersion.steps.find((s) => s.stepIndex === outbox.stepIndex);
    if (!step) {
        await (0, complete_1.completeJob)(outbox.id);
        await prisma_1.prisma.zapRun.update({
            where: { id: zapRun.id },
            data: {
                status: "success",
                finishedAt: new Date(),
            },
        });
        return;
    }
    if (step.actionKey === "system.wait") {
        const durationMs = step.config.durationMs;
        if (typeof durationMs !== "number") {
            throw new Error("system.wait requires durationMs");
        }
        await (0, systemWait_1.handleSystemWait)(zapRun.id, outbox.id, outbox.stepIndex, durationMs);
        return;
    }
    /**
     * STEP 6 — RESOLVE EXECUTOR + INTERPOLATE CONFIG
     */
    const executor = executors_1.executorRegistry[step.actionKey];
    if (!executor) {
        await (0, fail_1.failJob)(outbox.id);
        await prisma_1.prisma.zapRun.update({
            where: { id: zapRun.id },
            data: {
                status: "failed",
                failedStepId: step.id,
                error: {
                    code: "EXECUTOR_NOT_FOUND",
                    message: `Executor not found for ${step.actionKey}`,
                    retriable: false,
                },
                finishedAt: new Date(),
            },
        });
        return;
    }
    const previousStepStates = await prisma_1.prisma.stepState.findMany({
        where: {
            zapRunId: zapRun.id,
            stepIndex: { lt: outbox.stepIndex },
            status: "success",
        },
    });
    const steps = {};
    for (const state of previousStepStates) {
        steps[`step${state.stepIndex}`] = state.output;
    }
    const resolvedConfig = (0, interpolate_1.interpolateConfig)(step.config, {
        trigger: zapRun.triggerPayload,
        steps,
    });
    /**
     * STEP 7 — EXECUTE STEP + WRITE STEPSTATE
     */
    const startedAt = new Date();
    const result = await executor({
        payload: zapRun.triggerPayload,
        config: resolvedConfig,
    });
    if (result.status === "success") {
        await prisma_1.prisma.stepState.create({
            data: {
                zapRunId: zapRun.id,
                stepIndex: outbox.stepIndex,
                attempt: outbox.attempt,
                status: "success",
                output: result.output,
                startedAt,
                finishedAt: new Date(),
            },
        });
        /**
         * STEP 8A — SUCCESS PATH
         */
        await (0, complete_1.completeJob)(outbox.id);
        const nextStepIndex = outbox.stepIndex + 1;
        const nextStep = zapRun.zapVersion.steps.find((s) => s.stepIndex === nextStepIndex);
        if (nextStep) {
            const nextOutbox = await (0, enqueue_1.enqueueNextJob)(zapRun.id, outbox.stepIndex);
            await (0, producer_1.publishOutbox)(nextOutbox.id);
        }
        else {
            await prisma_1.prisma.zapRun.update({
                where: { id: zapRun.id },
                data: {
                    status: "success",
                    finishedAt: new Date(),
                },
            });
        }
    }
    else {
        await prisma_1.prisma.stepState.create({
            data: {
                zapRunId: zapRun.id,
                stepIndex: outbox.stepIndex,
                attempt: outbox.attempt,
                status: "error",
                error: result.error,
                startedAt,
                finishedAt: new Date(),
            },
        });
        /**
         * STEP 8B — FAILURE PATH
         */
        const shouldRetry = result.error?.retriable === true && outbox.attempt < MAX_RETRIES;
        if (shouldRetry) {
            await (0, fail_1.failJob)(outbox.id);
            const retryOutbox = await prisma_1.prisma.zapRunOutbox.create({
                data: {
                    zapRunId: outbox.zapRunId,
                    stepIndex: outbox.stepIndex,
                    attempt: outbox.attempt + 1,
                    status: "pending",
                },
            });
            await (0, producer_1.publishOutbox)(retryOutbox.id);
            return;
        }
        await (0, fail_1.failJob)(outbox.id);
        await prisma_1.prisma.zapRun.update({
            where: { id: zapRun.id },
            data: {
                status: "failed",
                failedStepId: step.id,
                error: result.error,
                finishedAt: new Date(),
            },
        });
    }
}
