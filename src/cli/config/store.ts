import fs from "fs/promises";
import path from "path";
import os from "os";
import { CliConfig, CliProfile } from "../types";

const CONFIG_SCHEMA_VERSION = 1;
const CONFIG_DIR = path.join(os.homedir(), ".zap");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function defaultConfig(): CliConfig {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    profiles: [],
  };
}

function normalizeConfig(input: unknown): CliConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return defaultConfig();
  }

  const candidate = input as Partial<CliConfig>;
  const profiles = Array.isArray(candidate.profiles)
    ? candidate.profiles
        .filter((profile): profile is CliProfile => {
          if (!profile || typeof profile !== "object") {
            return false;
          }

          const record = profile as Record<string, unknown>;
          return (
            typeof record.name === "string" &&
            typeof record.apiUrl === "string" &&
            typeof record.userId === "string" &&
            typeof record.active === "boolean"
          );
        })
        .map((profile) => ({
          name: profile.name,
          apiUrl: profile.apiUrl,
          userId: profile.userId,
          active: profile.active,
        }))
    : [];

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    profiles,
  };
}

export async function readConfig(): Promise<CliConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeConfig(parsed);
  } catch {
    return defaultConfig();
  }
}

export async function writeConfig(config: CliConfig): Promise<void> {
  const normalized = normalizeConfig(config);
  await fs.mkdir(CONFIG_DIR, { recursive: true });

  const tempPath = `${CONFIG_PATH}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, CONFIG_PATH);
}

export async function getActiveProfile(): Promise<CliProfile | null> {
  const config = await readConfig();
  return config.profiles.find((profile) => profile.active) ?? null;
}

export async function upsertProfile(profile: Omit<CliProfile, "active">): Promise<CliProfile> {
  const config = await readConfig();

  const nextProfiles = config.profiles
    .filter((existing) => existing.name !== profile.name)
    .map((existing) => ({ ...existing, active: false }));

  const nextProfile: CliProfile = {
    ...profile,
    active: true,
  };

  nextProfiles.unshift(nextProfile);

  await writeConfig({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    profiles: nextProfiles,
  });

  return nextProfile;
}

export async function clearActiveProfile(): Promise<void> {
  const config = await readConfig();
  const nextProfiles = config.profiles.map((profile) => ({
    ...profile,
    active: false,
  }));

  await writeConfig({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    profiles: nextProfiles,
  });
}

export async function deleteConfig(): Promise<void> {
  await fs.rm(CONFIG_PATH, { force: true });
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
