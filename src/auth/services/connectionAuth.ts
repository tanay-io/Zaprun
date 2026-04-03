import { Connection } from "@prisma/client";
import { ResolvedAuth } from "../types";
import { resolveApiKeyAuth } from "../resolvers/apiKey";
import { resolveBasicAuth } from "../resolvers/basic";
import { resolveNoAuth } from "../resolvers/none";
import { resolveOAuth2Auth } from "../resolvers/oauth2";

export async function resolveConnectionAuth(
  connection: Connection,
): Promise<ResolvedAuth> {
  if (connection.authType === "oauth2") {
    return resolveOAuth2Auth(connection);
  }

  if (connection.authType === "apiKey") {
    return resolveApiKeyAuth(connection);
  }

  if (connection.authType === "basic") {
    return resolveBasicAuth(connection);
  }

  if (connection.authType === "none") {
    return resolveNoAuth(connection);
  }

  throw new Error(`UNSUPPORTED_AUTH_TYPE:${connection.authType}`);
}
