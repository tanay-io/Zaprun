#!/usr/bin/env node
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth";
import { registerConnectCommands } from "./commands/connect";
import { registerCreateCommand } from "./commands/create";
import { registerListCommand } from "./commands/list";
import { registerLogsCommand } from "./commands/logs";
import { registerManageCommands } from "./commands/manage";
import { registerReplayCommand } from "./commands/replay";
import { registerTestCommand } from "./commands/test";
import { ApiError } from "./api/client";

const program = new Command();

program
  .name("zap")
  .description("Zaprun CLI")
  .showHelpAfterError()
  .configureOutput({
    outputError: (str: string, write: (message: string) => void) => {
      write(str);
    },
  });

registerAuthCommands(program);
registerConnectCommands(program);
registerCreateCommand(program);
registerListCommand(program);
registerLogsCommand(program);
registerTestCommand(program);
registerManageCommands(program);
registerReplayCommand(program);

async function run(): Promise<void> {
  await program.parseAsync(process.argv);
}

run().catch((error: unknown) => {
  if (error instanceof ApiError) {
    console.error(
      `Error: ${error.message}${
        error.statusCode ? ` (status=${error.statusCode})` : ""
      }`,
    );
    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.error("Unexpected error");
  process.exitCode = 1;
});
