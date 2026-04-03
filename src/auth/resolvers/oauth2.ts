import axios from "axios";
import { Connection } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { getManifest } from "../../engines/pluginRegistry";
import { OAuth2AuthConfig } from "../../types/manifest";
import { decryptString, encryptString } from "../../utils/encryption";
import { logger } from "../../utils/logger";
import { AuthResolver, ResolvedAuth } from "../types";

const REFRESH_WINDOW_MS = 5 * 60 * 1000;

export type ProviderOAuthEnvironment = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
};

type OAuthTokenData = {
  accessToken: string;
  tokenType?: string | null;
  scope?: string | null;
};

export function toOptionalString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

export function parseTokenResponse(data: unknown): Record<string, unknown> {
  if (typeof data === "string") {
    const parsed = new URLSearchParams(data);
    const output: Record<string, unknown> = {};

    for (const [key, value] of parsed.entries()) {
      output[key] = value;
    }

    return output;
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  return {};
}

export function parseScopes(
  scopeRaw: unknown,
  fallbackScopes: string[],
): string[] {
  const scope = toOptionalString(scopeRaw);
  if (!scope) {
    return fallbackScopes;
  }

  return scope
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toExpiresAt(expiresInRaw: unknown): Date | null {
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

export function providerEnvPrefix(providerKey: string): string {
  return providerKey.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

export function getProviderOAuthEnvironment(
  providerKey: string,
): ProviderOAuthEnvironment {
  const prefix = providerEnvPrefix(providerKey);

  return {
    clientId: process.env[`${prefix}_CLIENT_ID`],
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
    redirectUri: process.env[`${prefix}_REDIRECT_URI`],
  };
}

function getRequiredProviderOAuthEnvironment(providerKey: string): {
  clientId: string;
  clientSecret?: string;
} {
  const env = getProviderOAuthEnvironment(providerKey);
  if (!env.clientId) {
    throw new Error(`Missing OAuth client id for provider '${providerKey}'`);
  }

  return {
    clientId: env.clientId,
    clientSecret: env.clientSecret,
  };
}

export function getOAuthConfig(providerKey: string): OAuth2AuthConfig | null {
  const manifest = getManifest(providerKey);
  if (!manifest || manifest.authType !== "oauth2") {
    return null;
  }

  if (manifest.authConfig.type !== "oauth2") {
    return null;
  }

  return manifest.authConfig;
}

function parseOAuthAuthData(
  connection: Pick<Connection, "provider" | "authData">,
): OAuthTokenData {
  try {
    const decrypted = decryptString(connection.authData);
    const parsed = JSON.parse(decrypted) as Record<string, unknown>;
    const accessToken = toOptionalString(parsed.accessToken);

    if (!accessToken) {
      throw new Error(
        `Connection '${connection.provider}' does not contain access token`,
      );
    }

    return {
      accessToken,
      tokenType: toOptionalString(parsed.tokenType),
      scope: toOptionalString(parsed.scope),
    };
  } catch {
    throw new Error(`CONNECTION_INVALID:${connection.provider}`);
  }
}

async function markConnectionInvalid(connectionId: string): Promise<void> {
  await prisma.connection
    .update({
      where: { id: connectionId },
      data: { status: "invalid" },
    })
    .catch(() => undefined);
}

export async function getConnection(
  connectionId: string,
  userId?: string,
): Promise<Connection | null> {
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) {
    return null;
  }

  if (userId && connection.userId !== userId) {
    return null;
  }

  return connection;
}

export function tokenExpiresSoon(
  connection: Pick<Connection, "expiresAt">,
  windowMs: number = REFRESH_WINDOW_MS,
): boolean {
  if (!connection.expiresAt) {
    return false;
  }

  return connection.expiresAt.getTime() <= Date.now() + windowMs;
}

export function getOAuthAccessToken(
  connection: Pick<Connection, "provider" | "authData">,
): string {
  const parsed = parseOAuthAuthData(connection);
  return parsed.accessToken;
}

export async function refreshOAuthToken(
  connection: Connection,
): Promise<Connection> {
  if (connection.authType !== "oauth2") {
    throw new Error(`UNSUPPORTED_AUTH_TYPE:${connection.authType}`);
  }

  const oauthConfig = getOAuthConfig(connection.provider);
  if (!oauthConfig) {
    await markConnectionInvalid(connection.id);
    throw new Error(`CONNECTION_EXPIRED:${connection.provider}`);
  }

  if (!connection.refreshToken) {
    await markConnectionInvalid(connection.id);
    throw new Error(`CONNECTION_EXPIRED:${connection.provider}`);
  }

  const tokenEndpoint = connection.tokenEndpoint ?? oauthConfig.tokenUrl;
  if (!tokenEndpoint) {
    await markConnectionInvalid(connection.id);
    throw new Error(`CONNECTION_EXPIRED:${connection.provider}`);
  }

  let refreshToken: string;
  try {
    refreshToken = decryptString(connection.refreshToken);
  } catch {
    await markConnectionInvalid(connection.id);
    throw new Error(`CONNECTION_EXPIRED:${connection.provider}`);
  }

  const providerEnv = getRequiredProviderOAuthEnvironment(connection.provider);

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("client_id", providerEnv.clientId);
  if (providerEnv.clientSecret) {
    body.set("client_secret", providerEnv.clientSecret);
  }

  let tokenPayload: Record<string, unknown>;
  try {
    const response = await axios.post(tokenEndpoint, body.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      await markConnectionInvalid(connection.id);
      logger.warn(
        {
          connectionId: connection.id,
          provider: connection.provider,
          statusCode: response.status,
        },
        "OAuth refresh request rejected by provider",
      );
      throw new Error(`CONNECTION_EXPIRED:${connection.provider}`);
    }

    tokenPayload = parseTokenResponse(response.data);
  } catch (error) {
    await markConnectionInvalid(connection.id);
    logger.warn(
      {
        connectionId: connection.id,
        provider: connection.provider,
        err: error,
      },
      "OAuth refresh failed",
    );
    throw new Error(`CONNECTION_EXPIRED:${connection.provider}`);
  }

  const newAccessToken = toOptionalString(tokenPayload.access_token);
  if (!newAccessToken) {
    await markConnectionInvalid(connection.id);
    throw new Error(`CONNECTION_EXPIRED:${connection.provider}`);
  }

  const currentAuthData = parseOAuthAuthData(connection);
  const nextRefreshToken =
    toOptionalString(tokenPayload.refresh_token) ?? refreshToken;
  const expiresAt = toExpiresAt(tokenPayload.expires_in);

  const updated = await prisma.connection.update({
    where: { id: connection.id },
    data: {
      authData: encryptString(
        JSON.stringify({
          accessToken: newAccessToken,
          tokenType:
            toOptionalString(tokenPayload.token_type) ??
            currentAuthData.tokenType ??
            null,
          scope:
            toOptionalString(tokenPayload.scope) ??
            currentAuthData.scope ??
            null,
        }),
      ),
      refreshToken: encryptString(nextRefreshToken),
      expiresAt,
      scopes: parseScopes(tokenPayload.scope, connection.scopes),
      tokenEndpoint,
      status: "active",
    },
  });

  logger.info(
    {
      connectionId: updated.id,
      provider: updated.provider,
    },
    "OAuth2 token refreshed",
  );

  return updated;
}

export const resolveOAuth2Auth: AuthResolver = async (
  connection,
): Promise<ResolvedAuth> => {
  if (connection.authType !== "oauth2") {
    throw new Error(`UNSUPPORTED_AUTH_TYPE:${connection.authType}`);
  }

  let workingConnection = connection;

  if (tokenExpiresSoon(workingConnection)) {
    workingConnection = await refreshOAuthToken(workingConnection);
  }

  const accessToken = getOAuthAccessToken(workingConnection);

  return {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    queryParams: {},
  };
};
