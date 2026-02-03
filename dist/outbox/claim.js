"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimOutboxJob = claimOutboxJob;
const prisma_1 = require("../db/prisma");
async function claimOutboxJob(outboxJobId, lockMs = 60000) {
    const now = new Date();
    const lockUntil = new Date(Date.now() + lockMs);
    const result = await prisma_1.prisma.zapRunOutbox.updateMany({
        where: {
            id: outboxJobId,
            status: "pending",
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
        data: {
            status: "processing",
            lockedUntil: lockUntil,
        },
    });
    return result.count === 1;
}
