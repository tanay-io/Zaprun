import fs from "fs/promises";
import { Command } from "commander";
import inquirer from "inquirer";
import { createClientFromActiveProfile } from "../utils/profile";
import { monitorRun } from "../utils/runs";
import { printJson } from "../utils/output";

type WebhookResponse = {
  success: boolean;
  zapRunId: string;
  outboxId: string;
};

async function parsePayload(payloadInput: string | undefined): Promise<unknown> {
  if (!payloadInput) {
    const answer = await inquirer.prompt<{ payload: string }>([
      {
        type: "input",
        name: "payload",
        message: "Test payload JSON",
        default: "{}",
      },
    ]);

    return JSON.parse(answer.payload);
  }

  if (payloadInput.trim().startsWith("{")) {
    return JSON.parse(payloadInput);
  }

  const fileContents = await fs.readFile(payloadInput, "utf8");
  return JSON.parse(fileContents);
}

export function registerTestCommand(program: Command): void {
  program
    .command("test <zapId>")
    .description("Trigger a test run and stream progress")
    .option("--payload <jsonOrFile>", "Payload JSON or file path")
    .option("--json", "Output JSON")
    .action(async (zapId: string, options: { payload?: string; json?: boolean }) => {
      const client = await createClientFromActiveProfile();
      const payload = await parsePayload(options.payload);

      const response = await client.post<WebhookResponse>(`/webhook/${zapId}`, payload);
      if (options.json) {
        printJson(response);
      } else {
        console.log(`Triggered run ${response.zapRunId}. Watching progress...`);
      }

      await monitorRun(client, response.zapRunId);
    });
}
