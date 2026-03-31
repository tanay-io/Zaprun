import { Router, Request } from "express";
import axios from "axios";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../db/prisma";
import { getManifest } from "../../engines/pluginRegistry";
import { OAuth2AuthConfig } from "../../types/manifest";
import { logger } from "../../utils/logger";
import { decryptString, encryptString } from "../../utils/encryption";

const router = Router();

const AUTH_SESSION_TTL_MS = 10 * 60 * 1000;

type ProviderOAuthEnvironment = {
  clientId: string;
  clientSecret?: string;
  redirectUri?: string;
};

function getQueryString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function providerEnvPrefix(providerKey: string): string {
  return providerKey.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

function getProviderOAuthEnvironment(providerKey: string): ProviderOAuthEnvironment | null {
  const prefix = providerEnvPrefix(providerKey);

  const clientId = process.env[`${prefix}_CLIENT_ID`];
  if (!clientId) {
    return null;
  }

  return {
    clientId,
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
    redirectUri: process.env[`${prefix}_REDIRECT_URI`],
  };
}

function base64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function generateCodeVerifier(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(codeVerifier: string): string {
  const digest = crypto.createHash("sha256").update(codeVerifier).digest();
  return base64UrlEncode(digest);
}

function resolveOAuthConfig(providerKey: string): OAuth2AuthConfig | null {
  const manifest = getManifest(providerKey);
  if (!manifest || manifest.authType !== "oauth2") {
    return null;
  }

  if (manifest.authConfig.type !== "oauth2") {
    return null;
  }

  return manifest.authConfig;
}

function resolveUserId(req: Request): string | null {
  const headerUserId = req.header("x-user-id");
  if (headerUserId) {
    return headerUserId;
  }

  return getQueryString(req.query.userId);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function parseTokenResponse(data: unknown): Record<string, unknown> {
  if (typeof data === "string") {
    const parsed = new URLSearchParams(data);
    const out: Record<string, unknown> = {};

    for (const [key, value] of parsed.entries()) {
      out[key] = value;
    }

    return out;
  }

  return toRecord(data);
}

function toOptionalString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function toExpiresAt(expiresInRaw: unknown): Date | null {
  const expiresIn = toOptionalString(expiresInRaw);
  if (!expiresIn) {
    return null;
  }

  const expiresInSeconds = Number(expiresIn);
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    return null;
  }

  return new Date(Date.now() + expiresInSeconds * 1000);
}

function parseScopes(scopeRaw: unknown, fallbackScopes: string[]): string[] {
  const scope = toOptionalString(scopeRaw);
  if (!scope) {
    return fallbackScopes;
  }

  return scope
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

router.get("/auth/:providerKey/start", async (req, res) => {
  const providerKey = req.params.providerKey;
  const oauthConfig = resolveOAuthConfig(providerKey);

  if (!oauthConfig) {
    return res.status(404).json({
      message: `Provider '${providerKey}' is missing OAuth2 auth config`,
    });
  }

  const providerEnv = getProviderOAuthEnvironment(providerKey);
  if (!providerEnv?.redirectUri) {
    const prefix = providerEnvPrefix(providerKey);
    return res.status(500).json({
      message: `Missing OAuth environment for provider '${providerKey}'. Expected ${prefix}_CLIENT_ID and ${prefix}_REDIRECT_URI.`,
    });
  }

  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(400).json({
      message: "Missing user identity. Provide x-user-id header or userId query param.",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    return res.status(404).json({ message: `User '${userId}' not found` });
  }

  const state = uuidv4();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_MS);

  await prisma.oauthSession.create({
    data: {
      state,
      provider: providerKey,
      userId,
      codeVerifier: encryptString(codeVerifier),
      redirectUri: providerEnv.redirectUri,
      expiresAt,
    },
  });

  const authUrl = new URL(oauthConfig.authorizationUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", providerEnv.clientId);
  authUrl.searchParams.set("redirect_uri", providerEnv.redirectUri);
  authUrl.searchParams.set("scope", oauthConfig.scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return res.redirect(authUrl.toString());
});

router.get("/auth/:providerKey/callback", async (req, res) => {
  const providerKey = req.params.providerKey;
  const oauthConfig = resolveOAuthConfig(providerKey);

  if (!oauthConfig) {
    return res.status(404).json({
      message: `Provider '${providerKey}' is missing OAuth2 auth config`,
    });
  }

  const providerError = getQueryString(req.query.error);
  if (providerError) {
    return res.status(400).json({
      message: "OAuth provider rejected authorization request",
      error: providerError,
      errorDescription: getQueryString(req.query.error_description),
    });
  }

  const code = getQueryString(req.query.code);
  const state = getQueryString(req.query.state);

  if (!code || !state) {
    return res.status(400).json({ message: "Missing OAuth code or state" });
  }

  const now = new Date();
  const oauthSession = await prisma.oauthSession.findUnique({ where: { state } });

  if (!oauthSession || oauthSession.provider !== providerKey) {
    return res.status(400).json({ message: "Invalid OAuth state" });
  }

  if (oauthSession.consumedAt) {
    return res.status(400).json({ message: "OAuth state already used" });
  }

  if (oauthSession.expiresAt <= now) {
    return res.status(400).json({ message: "OAuth state expired" });
  }

  const consumeResult = await prisma.oauthSession.updateMany({
    where: {
      state,
      provider: providerKey,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });

  if (consumeResult.count !== 1) {
    return res.status(400).json({ message: "OAuth state is no longer valid" });
  }

  let codeVerifier: string;
  try {
    codeVerifier = decryptString(oauthSession.codeVerifier);
  } catch (error) {
    logger.error({ err: error, providerKey }, "Failed to decrypt PKCE verifier");
    return res.status(500).json({ message: "Invalid stored PKCE verifier" });
  }

  const providerEnv = getProviderOAuthEnvironment(providerKey);
  if (!providerEnv) {
    const prefix = providerEnvPrefix(providerKey);
    return res.status(500).json({
      message: `Missing OAuth environment for provider '${providerKey}'. Expected ${prefix}_CLIENT_ID.`,
    });
  }

  const tokenRequestBody = new URLSearchParams();
  tokenRequestBody.set("grant_type", "authorization_code");
  tokenRequestBody.set("code", code);
  tokenRequestBody.set("client_id", providerEnv.clientId);
  tokenRequestBody.set("redirect_uri", oauthSession.redirectUri);
  tokenRequestBody.set("code_verifier", codeVerifier);
  if (providerEnv.clientSecret) {
    tokenRequestBody.set("client_secret", providerEnv.clientSecret);
  }

  let tokenPayload: Record<string, unknown>;
  try {
    const tokenResponse = await axios.post(oauthConfig.tokenUrl, tokenRequestBody.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    tokenPayload = parseTokenResponse(tokenResponse.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.warn(
        {
          providerKey,
          statusCode: error.response?.status,
          errorMessage: error.message,
        },
        "OAuth token exchange failed",
      );
    } else {
      logger.warn({ providerKey, err: error }, "OAuth token exchange failed");
    }

    return res.status(502).json({ message: "Failed to exchange authorization code" });
  }

  const accessToken = toOptionalString(tokenPayload.access_token);
  if (!accessToken) {
    return res.status(502).json({
      message: "Token endpoint response did not include access_token",
    });
  }

  const refreshTokenRaw = toOptionalString(tokenPayload.refresh_token);
  const encryptedRefreshToken = refreshTokenRaw ? encryptString(refreshTokenRaw) : null;
  const expiresAt = toExpiresAt(tokenPayload.expires_in);
  const scopes = parseScopes(tokenPayload.scope, oauthConfig.scopes);

  const authData = encryptString(
    JSON.stringify({
      accessToken,
      tokenType: toOptionalString(tokenPayload.token_type),
      scope: toOptionalString(tokenPayload.scope),
    }),
  );

  const existingConnection = await prisma.connection.findFirst({
    where: {
      userId: oauthSession.userId,
      provider: providerKey,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, refreshToken: true },
  });

  const refreshTokenToStore = encryptedRefreshToken ?? existingConnection?.refreshToken ?? null;

  const connectionData = {
    provider: providerKey,
    authType: "oauth2",
    authData,
    scopes,
    tokenEndpoint: oauthConfig.tokenUrl,
    authorizationEndpoint: oauthConfig.authorizationUrl,
    expiresAt,
    refreshToken: refreshTokenToStore,
    status: "active",
  } as const;

  let connection;
  if (existingConnection) {
    connection = await prisma.connection.update({
      where: { id: existingConnection.id },
      data: connectionData,
      select: { id: true, provider: true, scopes: true, expiresAt: true, status: true },
    });
  } else {
    connection = await prisma.connection.create({
      data: {
        userId: oauthSession.userId,
        ...connectionData,
      },
      select: { id: true, provider: true, scopes: true, expiresAt: true, status: true },
    });
  }

  return res.status(200).json({
    message: "OAuth connection saved",
    connection,
  });
});

export default router;
