import { Executor } from "./types";
import { httpExecutor } from "./http.executor";

export const executorRegistry: Record<string, Executor> = {
  http: httpExecutor as Executor,
};
