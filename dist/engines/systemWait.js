"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSystemWait = handleSystemWait;
const prisma_1 = require("../db/prisma");
const complete_1 = require("../outbox/complete");
async function handleSystemWait(zapRunId, currentOutboxId, currentStepIndex, durationMs) {
    const resumeAt = new Date(Date.now() + durationMs);
    const newRow = await prisma_1.prisma.zapRunOutbox.create({
        data: {
            zapRunId,
            stepIndex: currentStepIndex,
            status: "pending",
            resumeAt,
            attempt: 0,
        },
    });
    await (0, complete_1.completeJob)(currentOutboxId);
}
