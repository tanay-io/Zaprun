"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeJob = completeJob;
const prisma_1 = require("../db/prisma");
async function completeJob(outboxId) {
    const job = await prisma_1.prisma.zapRunOutbox.updateMany({
        where: {
            id: outboxId,
            status: "processing",
        },
        data: {
            status: "completed",
            lockedUntil: null,
        },
    });
    if (job.count !== 1) {
        throw new Error(`Invariant violation: expected to complete exactly 1 outbox job, but completed ${job.count} (outboxId=${outboxId})`);
    }
}
