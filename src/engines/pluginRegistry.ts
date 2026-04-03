import * as fs from "fs";
import * as path from "path";
import { Connection } from "@prisma/client";
import { ProviderManifest, ActionManifest } from "../types/manifest";
import { Executor } from "../executors/types";
import { logger } from "../utils/logger";

export type ConnectionTestResult = {
  healthy: boolean;
  httpStatus?: number;
  error?: string;
};

export type ConnectionTester = (
  connection: Connection,
) => Promise<ConnectionTestResult>;

type RegisteredPlugin = {
  manifest: ProviderManifest;
  executors: Record<string, Executor>;
  testConnection?: ConnectionTester;
};

const registry = new Map<string, RegisteredPlugin>();

const executorIndex = new Map<string, Executor>();

const actionManifestIndex = new Map<string, ActionManifest>();

const connectionTesterIndex = new Map<string, ConnectionTester>();

export async function loadPlugins(): Promise<void> {
  registry.clear();
  executorIndex.clear();
  actionManifestIndex.clear();
  connectionTesterIndex.clear();

  const pluginsDir = path.resolve(__dirname, "..", "plugins");

  if (!fs.existsSync(pluginsDir)) {
    logger.warn(
      { pluginsDir },
      "Plugins directory not found — no plugins loaded",
    );
    return;
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  const pluginDirs = entries.filter((e) => e.isDirectory());

  for (const dir of pluginDirs) {
    const pluginPath = path.join(pluginsDir, dir.name);
    try {
      const plugin = require(pluginPath);

      const manifest: ProviderManifest | undefined = plugin.manifest;
      const execute: Executor | undefined = plugin.execute;
      const testConnection: ConnectionTester | undefined =
        plugin.testConnection;

      if (!manifest) {
        logger.warn({ plugin: dir.name }, "Plugin missing manifest — skipped");
        continue;
      }
      if (!execute) {
        logger.warn({ plugin: dir.name }, "Plugin missing execute — skipped");
        continue;
      }

      const executors: Record<string, Executor> = {};
      for (const action of manifest.actions) {
        executors[action.key] = execute;
        executorIndex.set(action.key, execute);
        actionManifestIndex.set(action.key, action);
      }

      if (testConnection) {
        connectionTesterIndex.set(manifest.key, testConnection);
      }

      registry.set(manifest.key, { manifest, executors, testConnection });

      logger.info(
        {
          provider: manifest.key,
          actions: manifest.actions.map((a) => a.key),
          triggers: manifest.triggers.map((t) => t.key),
        },
        `Loaded plugin: ${manifest.name}`,
      );
    } catch (err) {
      logger.error(err, `Failed to load plugin from ${dir.name}`);
    }
  }

  logger.info(
    {
      providers: Array.from(registry.keys()),
      totalActions: executorIndex.size,
    },
    `Plugin registry ready — ${registry.size} provider(s), ${executorIndex.size} action(s)`,
  );
}

export function getExecutor(actionKey: string): Executor | undefined {
  return executorIndex.get(actionKey);
}

export function getManifest(providerKey: string): ProviderManifest | undefined {
  return registry.get(providerKey)?.manifest;
}

export function getActionManifest(
  actionKey: string,
): ActionManifest | undefined {
  return actionManifestIndex.get(actionKey);
}

export function getAllManifests(): ProviderManifest[] {
  return Array.from(registry.values()).map((r) => r.manifest);
}

export function getConnectionTester(
  providerKey: string,
): ConnectionTester | undefined {
  return connectionTesterIndex.get(providerKey);
}
