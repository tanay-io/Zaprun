"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../db/prisma");
const versionBuilder_1 = require("../../services/versionBuilder");
const router = (0, express_1.Router)();
router.post("/zaps", async (req, res) => {
    const body = req.body;
    if (!body?.userId || !body?.name || !body?.trigger || !Array.isArray(body.actions)) {
        return res.status(400).json({
            message: "Invalid body. Required: userId, name, trigger, actions[]",
        });
    }
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        const zap = await tx.zap.create({
            data: {
                userId: body.userId,
                name: body.name,
                status: body.status ?? "paused",
            },
        });
        await tx.zapTrigger.create({
            data: {
                zapId: zap.id,
                availableTriggerId: body.trigger.availableTriggerId,
                config: body.trigger.config,
            },
        });
        if (body.actions.length > 0) {
            await tx.zapAction.createMany({
                data: body.actions.map((action, index) => ({
                    zapId: zap.id,
                    availableActionId: action.availableActionId,
                    stepOrder: index,
                    config: action.config,
                })),
            });
        }
        const version = await (0, versionBuilder_1.buildNewVersionFromActions)(zap.id, tx);
        return { zap, version };
    });
    return res.status(201).json(result);
});
router.put("/zaps/:zapId", async (req, res) => {
    const zapId = req.params.zapId;
    const body = req.body;
    const existing = await prisma_1.prisma.zap.findUnique({ where: { id: zapId } });
    if (!existing) {
        return res.status(404).json({ message: "Zap not found" });
    }
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        if (body.name || body.status) {
            await tx.zap.update({
                where: { id: zapId },
                data: {
                    ...(body.name ? { name: body.name } : {}),
                    ...(body.status ? { status: body.status } : {}),
                },
            });
        }
        if (body.trigger) {
            await tx.zapTrigger.upsert({
                where: { zapId },
                create: {
                    zapId,
                    availableTriggerId: body.trigger.availableTriggerId,
                    config: body.trigger.config,
                },
                update: {
                    availableTriggerId: body.trigger.availableTriggerId,
                    config: body.trigger.config,
                },
            });
        }
        if (body.actions) {
            await tx.zapAction.deleteMany({ where: { zapId } });
            if (body.actions.length > 0) {
                await tx.zapAction.createMany({
                    data: body.actions.map((action, index) => ({
                        zapId,
                        availableActionId: action.availableActionId,
                        stepOrder: index,
                        config: action.config,
                    })),
                });
            }
        }
        const shouldCreateVersion = Array.isArray(body.actions) || !existing.latestVersionId;
        const version = shouldCreateVersion
            ? await (0, versionBuilder_1.buildNewVersionFromActions)(zapId, tx)
            : null;
        const zap = await tx.zap.findUnique({
            where: { id: zapId },
            include: { trigger: true },
        });
        return { zap, version };
    });
    return res.status(200).json(result);
});
exports.default = router;
