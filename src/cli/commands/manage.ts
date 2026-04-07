import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import { createClientFromActiveProfile } from "../utils/profile";

type UpdateResponse = {
  zap: {
    id: string;
    status: "active" | "paused";
    name: string;
  };
};

export function registerManageCommands(program: Command): void {
  program
    .command("pause <zapId>")
    .description("Pause an automation")
    .action(async (zapId: string) => {
      const client = await createClientFromActiveProfile();
      const response = await client.put<UpdateResponse>(`/zaps/${zapId}`, {
        status: "paused",
      });

      console.log(
        chalk.yellow(`Paused '${response.zap.name}' (id=${response.zap.id}).`),
      );
    });

  program
    .command("resume <zapId>")
    .description("Resume an automation")
    .action(async (zapId: string) => {
      const client = await createClientFromActiveProfile();
      const response = await client.put<UpdateResponse>(`/zaps/${zapId}`, {
        status: "active",
      });

      console.log(
        chalk.green(`Resumed '${response.zap.name}' (id=${response.zap.id}).`),
      );
    });

  program
    .command("delete <zapId>")
    .description("Delete an automation")
    .option("--yes", "Skip confirmation")
    .action(async (zapId: string, options: { yes?: boolean }) => {
      if (!options.yes) {
        const confirm = await inquirer.prompt<{ proceed: boolean }>([
          {
            type: "confirm",
            name: "proceed",
            message: `Delete zap ${zapId}?`,
            default: false,
          },
        ]);

        if (!confirm.proceed) {
          console.log("Aborted.");
          return;
        }
      }

      const client = await createClientFromActiveProfile();
      await client.delete<{ message: string }>(`/zaps/${zapId}`);
      console.log(chalk.red(`Deleted zap ${zapId}.`));
    });
}
