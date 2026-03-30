/**
 * @deprecated — Use src/engines/pluginRegistry.ts instead.
 *
 * This file is kept for backward compatibility only.
 * The dynamic plugin registry (pluginRegistry.ts) replaces this hardcoded map.
 * New code should use getExecutor(actionKey) from the plugin registry.
 */
import { Executor } from "./types";
import { getExecutor } from "../engines/pluginRegistry";

export const executorRegistry: Record<string, Executor> = new Proxy(
  {} as Record<string, Executor>,
  {
    get(_target, prop: string) {
      return getExecutor(prop);
    },
  },
);
