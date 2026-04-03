import { Connection } from "@prisma/client";

export type ResolvedAuth = {
  headers: Record<string, string>;
  queryParams: Record<string, string>;
};

export const EMPTY_AUTH: ResolvedAuth = {
  headers: {},
  queryParams: {},
};

export type AuthResolver = (
  connection: Connection,
) => Promise<ResolvedAuth> | ResolvedAuth;
