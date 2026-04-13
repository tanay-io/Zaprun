import crypto from "crypto";
import express, { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { publishOutbox } from "../../kafka/producer";

const router = Router();

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getHeaderValue(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }

  return typeof value === "string" ? value : null;
}

function toRawBuffer(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }

  if (body == null) {
    return Buffer.from("{}", "utf8");
  }

  return Buffer.from(JSON.stringify(body), "utf8");
}
  
function parseJsonPayload(rawBody: Buffer): unknown {
  const text = rawBody.toString("utf8").trim();
  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

function secureCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

router.post("/webhook/:zapId", express.raw({ type: "*/*" }), async (req, res) => {
  const zapId = req.params.zapId;
  const rawBody = toRawBuffer(req.body);
  let payload: unknown;

  try {
    payload = parseJsonPayload(rawBody);
  } catch {
    return res.status(400).json({ message: "Webhook payload must be valid JSON" });
  }

  const zap = await prisma.zap.findUnique({
    where: {
      id: zapId,
    },
    include: {
      trigger: {
        include: {
          availableTrigger: {
            select: {
              key: true,
            },
          },
        },
      },
    },
  });
  if (!zap || zap.status !== "active") {
    return res.status(404).json({ message: "Zap not found or inactive" });
  }

  const triggerKey = zap.trigger?.availableTrigger?.key ?? null;

  if (triggerKey === "github.webhook") {
    const triggerConfig = toRecord(zap.trigger?.config ?? null) ?? {};
    const secret = getString(triggerConfig.secret);
    const expectedEventsRaw = triggerConfig.events;
    const expectedEvents = Array.isArray(expectedEventsRaw)
      ? expectedEventsRaw.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
      : [];

    const githubEvent = getHeaderValue(req.header("x-github-event"));
    const githubDelivery = getHeaderValue(req.header("x-github-delivery"));

    if (expectedEvents.length > 0) {
      if (!githubEvent || !expectedEvents.includes(githubEvent)) {
        return res.status(202).json({
          success: true,
          ignored: true,
          reason: "event_not_subscribed",
          event: githubEvent,
        });
      }
    }

    if (secret) {
      const signatureHeader = getHeaderValue(req.header("x-hub-signature-256"));
      if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
        return res.status(401).json({
          message: "Missing or invalid X-Hub-Signature-256 header",
        });
      }

      const expectedSignature = `sha256=${crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex")}`;

      if (!secureCompare(expectedSignature, signatureHeader)) {
        return res.status(401).json({ message: "Invalid GitHub webhook signature" });
      }
    }

    payload = {
      ...(toRecord(payload) ?? {}),
      __webhook: {
        provider: "github",
        event: githubEvent,
        deliveryId: githubDelivery,
      },
    };
  }

  if (!zap.latestVersionId) {
    return res
      .status(400)
      .json({ message: "Zap has no latest version" });
  }
  const zapRun = await prisma.zapRun.create({
    data: {
      zapId: zap.id,
      zapVersionId: zap.latestVersionId,
      status: "pending",
      triggerPayload: payload as Prisma.InputJsonValue,
    },
  });
  const outbox = await prisma.zapRunOutbox.create({
    data: {
      zapRunId: zapRun.id,
      stepIndex: 0,
      status: "pending",
    },
  });

  await publishOutbox(outbox.id);

  return res
    .status(200)
    .json({ success: true, zapRunId: zapRun.id, outboxId: outbox.id });
});

export default router;
