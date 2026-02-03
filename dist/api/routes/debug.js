"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../db/prisma");
const runner_1 = require("../../engines/runner");
const router = (0, express_1.Router)();
router.post("/debug/run/:zapRunId", async (req, res) => {
    const zapRunId = req.params.zapRunId;
    try {
        await (0, runner_1.runZap)(zapRunId);
        return res.status(200).json({ ok: true, zapRunId });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "runZap failed";
        return res.status(500).json({ ok: false, error: message });
    }
});
router.get("/debug/zap-runs/:zapRunId", async (req, res) => {
    const zapRunId = req.params.zapRunId;
    const zapRun = await prisma_1.prisma.zapRun.findUnique({
        where: { id: zapRunId },
    });
    if (!zapRun) {
        return res.status(404).json({ ok: false, error: "ZapRun not found" });
    }
    return res.status(200).json({ ok: true, zapRun });
});
exports.default = router;
