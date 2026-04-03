import { Connection } from "@prisma/client";
import { getManifest } from "../../engines/pluginRegistry";
import { decryptString } from "../../utils/encryption";
import { AuthResolver, ResolvedAuth } from "../types";

type ApiKeyPlacement = "header" | "query";

type ParsedApiKeyData = {
  apiKey: string;
  name?: string;
  in?: ApiKeyPlacement;
};

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
//remove any spaces
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toApiKeyPlacement(value: unknown): ApiKeyPlacement | null {
  return value === "header" || value === "query" ? value : null;
}

function parseApiKeyAuthData(
  connection: Pick<Connection, "provider" | "authData">,
): ParsedApiKeyData {
  try {
    const decrypted = decryptString(connection.authData);
    const parsed = JSON.parse(decrypted) as Record<string, unknown>;

    const apiKey =
      toNonEmptyString(parsed.apiKey) ??
      toNonEmptyString(parsed.value) ??
      toNonEmptyString(parsed.key);

    if (!apiKey) {
      throw new Error("Missing API key");
    }

    return {
      apiKey,
      name: toNonEmptyString(parsed.name) ?? undefined,
      in: toApiKeyPlacement(parsed.in) ?? undefined,
    };
  } catch {
    throw new Error(`CONNECTION_INVALID:${connection.provider}`);
  }
}

export const resolveApiKeyAuth: AuthResolver = async (
  connection,
): Promise<ResolvedAuth> => {
  if (connection.authType !== "apiKey") {
    throw new Error(`UNSUPPORTED_AUTH_TYPE:${connection.authType}`);
  }

  const manifest = getManifest(connection.provider);
  if (!manifest || manifest.authType !== "apiKey") {
    throw new Error(`CONNECTION_INVALID:${connection.provider}`);
  }

  if (manifest.authConfig.type !== "apiKey") {
    throw new Error(`CONNECTION_INVALID:${connection.provider}`);
  }

  const parsed = parseApiKeyAuthData(connection);

  const placement = parsed.in ?? manifest.authConfig.in;
  const keyName = parsed.name ?? manifest.authConfig.name;

  if (!keyName) {
    throw new Error(`CONNECTION_INVALID:${connection.provider}`);
  }

  if (placement === "query") {
    return {
      headers: {},    
      queryParams: {
        [keyName]: parsed.apiKey,
      },
    };
  }

  return {
    headers: {
      [keyName]: parsed.apiKey,
    },
    queryParams: {},
  };
};
