import { AuthResolver, EMPTY_AUTH } from "../types";

// Structure-only scaffold. This one intentionally returns empty auth payload.
export const resolveNoAuth: AuthResolver = async () => {
  return EMPTY_AUTH;
};
