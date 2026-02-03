"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.failJob = failJob;
const prisma_1 = require("../db/prisma");
async function failJob(outboxId) {
    const result = await prisma_1.prisma.zapRunOutbox.updateMany({
        where: {
            id: outboxId,
            status: "processing",
        },
        data: {
            status: "failed",
            lockedUntil: null,
        },
    });
    if (result.count !== 1) {
        throw new Error(`Invariant violation: expected to fail exactly 1 outbox job, but failed ${result.count} (outboxId=${outboxId})`);
    }
}
