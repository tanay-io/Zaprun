"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../db/prisma");
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
    const zapRun = await prisma_1.prisma.zapRun.create({
        data: {
            zapId: zap.id,
            status: "pending",
            triggerPayload: payload,
        },
    });
    await prisma_1.prisma.zapRunOutbox.create({
        data: {
            eventType: "ZAP_RUN_CREATED",
            zapRunId: zapRun.id,
            payload: {
                zapRunId: zapRun.id,
            },
            status: "pending",
        },
    });
    return res.status(200).json({ success: true });
});
exports.default = router;
