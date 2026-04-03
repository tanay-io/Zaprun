import { Request, Router } from "express";
import { prisma } from "../../../db/prisma";
import { getConnectionTester, getManifest } from "../../../engines/pluginRegistry";
import { encryptString } from "../../../utils/encryption";
import { logger } from "../../../utils/logger";

const router = Router();

function getQueryString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function resolveUserId(req: Request): string | null {
  const headerUserId = req.header("x-user-id");
  if (headerUserId) {
    return headerUserId;
  }

  return getQueryString(req.query.userId);
}

function resolveBodyRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

router.post("/connections", async (req, res) => {
  const body = resolveBodyRecord(req.body);

  const userId = resolveUserId(req) ?? getQueryString(body.userId);
  if (!userId) {
    return res.status(400).json({
      message:
        "Missing user identity. Provide x-user-id header, userId query param, or userId in request body.",
    });
  }

  const providerKey =
    getQueryString(body.providerKey) ?? getQueryString(body.provider);
  if (!providerKey) {
    return res.status(400).json({
      message: "providerKey is required",
    });
  }

  const manifest = getManifest(providerKey);
  if (!manifest) {
    return res.status(404).json({
      message: `Provider '${providerKey}' not found`,
    });
  }

  if (manifest.authType !== "apiKey" || manifest.authConfig.type !== "apiKey") {
    return res.status(400).json({
      message: `Provider '${providerKey}' does not support apiKey auth`,
    });
  }

  const apiKey = getQueryString(body.apiKey);
  if (!apiKey) {
    return res.status(400).json({
      message: "apiKey is required",
    });
  }

  const keyPlacementRaw = getQueryString(body.in);
  const keyPlacement = keyPlacementRaw ?? manifest.authConfig.in;
  if (keyPlacement !== "header" && keyPlacement !== "query") {
    return res.status(400).json({
      message: "in must be either 'header' or 'query'",
    });
  }

  const keyName = getQueryString(body.name) ?? manifest.authConfig.name;
  if (!keyName) {
    return res.status(400).json({
      message: "name is required for apiKey auth",
    });
  }

  const authData = encryptString(
    JSON.stringify({
      apiKey,
      in: keyPlacement,
      name: keyName,
    }),
  );

  const existingConnection = await prisma.connection.findFirst({
    where: {
      userId,
      provider: providerKey,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const connectionData = {
    provider: providerKey,
    authType: "apiKey",
    authData,
    status: "active",
    scopes: [] as string[],
    expiresAt: null,
    refreshToken: null,
    tokenEndpoint: null,
    authorizationEndpoint: null,
  };

  const connection = existingConnection
    ? await prisma.connection.update({
        where: { id: existingConnection.id },
        data: connectionData,
        select: {
          id: true,
          provider: true,
          authType: true,
          status: true,
          updatedAt: true,
        },
      })
    : await prisma.connection.create({
        data: {
          userId,
          ...connectionData,
        },
        select: {
          id: true,
          provider: true,
          authType: true,
          status: true,
          updatedAt: true,
        },
      });

  return res.status(existingConnection ? 200 : 201).json({
    message: existingConnection
      ? "API key connection updated"
      : "API key connection created",
    connection,
  });
});

router.get("/connections", async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(400).json({
      message:
        "Missing user identity. Provide x-user-id header or userId query param.",
    });
  }

  const connections = await prisma.connection.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      provider: true,
      status: true,
      scopes: true,
      expiresAt: true,
    },
  });

  return res.status(200).json({
    connections: connections.map((connection) => ({
      id: connection.id,
      providerKey: connection.provider,
      displayName:
        getManifest(connection.provider)?.name ?? connection.provider,
      scopes: connection.scopes,
      expiresAt: connection.expiresAt,
      healthy: connection.status === "active",
    })),
  });
});

router.get("/connections/:id/test", async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(400).json({
      message:
        "Missing user identity. Provide x-user-id header or userId query param.",
    });
  }

  const connection = await prisma.connection.findUnique({
    where: { id: req.params.id },
  });

  if (!connection || connection.userId !== userId) {
    return res.status(404).json({ message: "Connection not found" });
  }

  const testConnection = getConnectionTester(connection.provider);
  if (!testConnection) {
    return res.status(200).json({
      healthy: connection.status === "active",
      status: connection.status,
      message: `No testConnection implementation for provider '${connection.provider}'`,
    });
  }

  try {
    const result = await testConnection(connection);
    const nextStatus = result.healthy ? "active" : "invalid";

    if (connection.status !== nextStatus) {
      await prisma.connection.update({
        where: { id: connection.id },
        data: { status: nextStatus },
      });
    }

    return res.status(200).json({
      healthy: result.healthy,
      status: nextStatus,
      ...(typeof result.httpStatus === "number"
        ? { httpStatus: result.httpStatus }
        : {}),
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (error) {
    logger.warn(
      {
        connectionId: connection.id,
        provider: connection.provider,
        err: error,
      },
      "Connection health check failed",
    );

    await prisma.connection.update({
      where: { id: connection.id },
      data: { status: "invalid" },
    });

    return res.status(200).json({
      healthy: false,
      status: "invalid",
      error: "Connection test failed",
    });
  }
});

export default router;
