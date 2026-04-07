import { Command } from "commander";
import inquirer from "inquirer";
import { createClientFromActiveProfile } from "../utils/profile";
import { durationMs, formatDate } from "../utils/output";
import { monitorRun } from "../utils/runs";

type RunDetailResponse = {
  run: {
    id: string;
    zapId: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
    stepStates: Array<{ status: string }>;
  };
};

type ReplayResponse = {
  message: string;
  newZapRunId: string;
};

export function registerReplayCommand(program: Command): void {
  program
    .command("replay <runId>")
    .description("Replay a previous run")
    .option("--yes", "Skip confirmation")
    .action(async (runId: string, options: { yes?: boolean }) => {
      const client = await createClientFromActiveProfile();
      const previous = await client.get<RunDetailResponse>(`/zapRuns/${runId}`);

      console.log(`runId=${previous.run.id}`);
      console.log(`status=${previous.run.status}`);
      console.log(`startedAt=${formatDate(previous.run.startedAt)}`);
      console.log(`duration=${durationMs(previous.run.startedAt, previous.run.finishedAt)}`);

      if (!options.yes) {
        const answer = await inquirer.prompt<{ proceed: boolean }>([
          {
            type: "confirm",
            name: "proceed",
            message: `Replay run ${runId}?`,
            default: false,
          },
        ]);

        if (!answer.proceed) {
          console.log("Aborted.");
          return;
        }
      }

      const replay = await client.post<ReplayResponse>(`/zapRuns/${runId}/replay`);
      console.log(replay.message);
      await monitorRun(client, replay.newZapRunId);
    });
}
