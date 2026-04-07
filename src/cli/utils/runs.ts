import ora from "ora";
import { ApiClient } from "../api/client";
import { durationMs, safePreview } from "./output";

type StepState = {
  id: string;
  stepIndex: number;
  attempt: number;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  output?: unknown;
  error?: unknown;
};

type ZapRunDetailResponse = {
  run: {
    id: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
    stepStates: StepState[];
  };
};

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function monitorRun(
  client: ApiClient,
  runId: string,
  options?: { pollingMs?: number },
): Promise<void> {
  const pollMs = options?.pollingMs ?? 2000;
  const spinner = ora(`Waiting for run ${runId}...`).start();
  const seen = new Set<string>();

  let stopped = false;
  const onSigint = () => {
    stopped = true;
  };
  process.once("SIGINT", onSigint);

  try {
    while (!stopped) {
      const response = await client.get<ZapRunDetailResponse>(`/zapRuns/${runId}`);
      const run = response.run;

      spinner.text = `Run ${run.id} status: ${run.status}`;

      for (const step of run.stepStates) {
        const key = `${step.stepIndex}:${step.attempt}:${step.status}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        spinner.stop();
        const detail =
          step.status === "success"
            ? safePreview(step.output)
            : safePreview(step.error);
        console.log(
          `step=${step.stepIndex} attempt=${step.attempt} status=${step.status} duration=${durationMs(
            step.startedAt,
            step.finishedAt,
          )} detail=${detail}`,
        );
        spinner.start();
      }

      if (run.status === "success" || run.status === "failed") {
        spinner.succeed(`Run ${run.id} finished with status=${run.status}`);
        return;
      }

      await sleep(pollMs);
    }

    spinner.warn("Stopped watching run");
  } finally {
    process.removeListener("SIGINT", onSigint);
  }
}
