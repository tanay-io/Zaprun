"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueNextJob = enqueueNextJob;
const prisma_1 = require("../db/prisma");
async function enqueueNextJob(zapRunId, currentStepIndex) {
    const nextStepIndex = currentStepIndex + 1;
    const result = await prisma_1.prisma.zapRunOutbox.create({
        data: {
            zapRunId: zapRunId,
            status: "pending",
            stepIndex: nextStepIndex,
            attempt: 0,
            lockedUntil: null,
        },
    });
    return result;
}
