"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTimerWorker = startTimerWorker;
const prisma_1 = require("../db/prisma");
const producer_1 = require("../kafka/producer");
const TICK_MS = 5000;
const BATCH_SIZE = 50;
async function startTimerWorker() {
    console.log("Timer worker started");
    while (true) {
        try {
            const now = new Date();
            const readyJobs = await prisma_1.prisma.zapRunOutbox.findMany({
                where: {
                    status: "pending",
                    resumeAt: {
                        lte: now,
                    },
                },
                orderBy: {
                    resumeAt: "asc",
                },
                take: BATCH_SIZE,
            });
            for (const job of readyJobs) {
                await (0, producer_1.publishOutbox)(job.id);
            }
        }
        catch (error) {
            console.error("Timer worker error:", error);
        }
        await new Promise((resolve) => setTimeout(resolve, TICK_MS));
    }
}
