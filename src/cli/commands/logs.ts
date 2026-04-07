import { Command } from "commander";
import { createClientFromActiveProfile } from "../utils/profile";
import { createTable, durationMs, formatDate, printJson, safePreview } from "../utils/output";
import { sleep } from "../utils/runs";

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

type RunItem = {
  id: string;
  zapId: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  triggerPayload?: unknown;
  stepStates: StepState[];
  error?: unknown;
};

type RunsResponse = {
  total: number;
  limit: number;
  offset: number;
  runs: RunItem[];
};

type RunDetailResponse = {
  run: RunItem;
};

function printRunsTable(runs: RunItem[]): void {
  const table = createTable(["runId", "status", "startedAt", "duration", "steps"]);

  for (const run of runs) {
    table.push([
      run.id,
      run.status,
      formatDate(run.startedAt),
      durationMs(run.startedAt, run.finishedAt),
      run.stepStates.length,
    ]);
  }

  console.log(table.toString());
}

function printRunDetail(run: RunItem): void {
  console.log(`runId=${run.id} status=${run.status} startedAt=${formatDate(run.startedAt)}`);

  if (run.stepStates.length === 0) {
    console.log("No step state records found.");
    return;
  }

  const table = createTable(["step", "attempt", "status", "duration", "preview"]);

  for (const step of run.stepStates) {
    table.push([
      step.stepIndex,
      step.attempt,
      step.status,
      durationMs(step.startedAt, step.finishedAt),
      step.status === "success" ? safePreview(step.output) : safePreview(step.error),
    ]);
  }

  console.log(table.toString());
}

export function registerLogsCommand(program: Command): void {
  program
    .command("logs <zapId>")
    .description("Show run history for an automation")
    .option("--run <runId>", "Show a specific run in detail")
    .option("--tail", "Poll and stream newly completed runs")
    .option("--limit <n>", "Number of runs to fetch", "20")
    .option("--json", "Output JSON")
    .action(
      async (
        zapId: string,
        options: {
          run?: string;
          tail?: boolean;
          limit: string;
          json?: boolean;
        },
      ) => {
        const client = await createClientFromActiveProfile();

        if (options.run) {
          const runResponse = await client.get<RunDetailResponse>(`/zapRuns/${options.run}`);
          if (options.json) {
            printJson(runResponse);
            return;
          }

          printRunDetail(runResponse.run);
          return;
        }

        const limit = Number.parseInt(options.limit, 10);
        const initial = await client.get<RunsResponse>("/zapRuns", {
          zapId,
          limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
        });

        if (options.json && !options.tail) {
          printJson(initial);
          return;
        }

        if (initial.runs.length === 0) {
          console.log("No runs found.");
        } else {
          printRunsTable(initial.runs);
        }

        if (!options.tail) {
          return;
        }

        const seen = new Set(initial.runs.map((run) => run.id));
        let stopped = false;
        const onSigint = () => {
          stopped = true;
          console.log("Stopped tailing logs.");
        };
        process.once("SIGINT", onSigint);

        try {
          while (!stopped) {
            await sleep(2500);
            const next = await client.get<RunsResponse>("/zapRuns", {
              zapId,
              limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
            });

            const unseen = next.runs
              .filter((run) => !seen.has(run.id))
              .sort((a, b) =>
                new Date(a.startedAt ?? 0).getTime() -
                new Date(b.startedAt ?? 0).getTime(),
              );

            for (const run of unseen) {
              seen.add(run.id);
              if (options.json) {
                printJson(run);
              } else {
                printRunDetail(run);
              }
            }
          }
        } finally {
          process.removeListener("SIGINT", onSigint);
        }
      },
    );
}
