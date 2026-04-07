import { ApiClient } from "../api/client";
import { getActiveProfile } from "../config/store";
import { CliProfile } from "../types";

export async function requireActiveProfile(): Promise<CliProfile> {
  const profile = await getActiveProfile();

  if (!profile) {
    throw new Error(
      "No active profile found. Run `zap auth login` first.",
    );
  }

  return profile;
}

export async function createClientFromActiveProfile(): Promise<ApiClient> {
  const profile = await requireActiveProfile();
  return new ApiClient(profile);
}
