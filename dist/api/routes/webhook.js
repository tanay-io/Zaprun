"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../db/prisma");
const producer_1 = require("../../kafka/producer");
const router = (0, express_1.Router)();
router.post("/webhook/:zapId", async (req, res) => {
    const zapId = req.params.zapId;
    const payload = req.body;
    const zap = await prisma_1.prisma.zap.findUnique({
        where: {
            id: zapId,
        },
        include: { trigger: true },
    });
    if (!zap || zap.status !== "active") {
        return res.status(404).json({ message: "Zap not found or inactive" });
    }
    if (!zap.latestVersionId) {
        return res
            .status(400)
            .json({ message: "Zap has no latest version" });
    }
    const zapRun = await prisma_1.prisma.zapRun.create({
        data: {
            zapId: zap.id,
            zapVersionId: zap.latestVersionId,
            status: "pending",
            triggerPayload: payload,
        },
    });
    const outbox = await prisma_1.prisma.zapRunOutbox.create({
        data: {
            zapRunId: zapRun.id,
            stepIndex: 0,
            status: "pending",
        },
    });
    await (0, producer_1.publishOutbox)(outbox.id);
    return res
        .status(200)
        .json({ success: true, zapRunId: zapRun.id, outboxId: outbox.id });
});
exports.default = router;
