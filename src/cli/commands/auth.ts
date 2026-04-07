import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import {
  clearActiveProfile,
  deleteConfig,
  getConfigPath,
  upsertProfile,
} from "../config/store";
import { ApiClient, ApiError } from "../api/client";
import { printJson } from "../utils/output";
import { requireActiveProfile } from "../utils/profile";

type WhoamiResponse = {
  user: {
    id: string;
    email: string;
    createdAt: string;
  };
};

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Manage CLI authentication profile");

  auth
    .command("login")
    .option("--name <name>", "Profile name", "default")
    .option("--api-url <url>", "API base URL")
    .option("--user-id <id>", "User ID")
    .action(async (options: { name: string; apiUrl?: string; userId?: string }) => {
      const prompts: Array<{ type: "input"; name: string; message: string; default?: string }> = [];

      if (!options.apiUrl) {
        prompts.push({
          type: "input",
          name: "apiUrl",
          message: "API URL",
          default: "http://localhost:3000",
        });
      }

      if (!options.userId) {
        prompts.push({
          type: "input",
          name: "userId",
          message: "User ID",
        });
      }

      const answers = prompts.length > 0 ? await inquirer.prompt<Record<string, string>>(prompts) : {};

      const apiUrl = (options.apiUrl ?? answers.apiUrl ?? "").trim();
      const userId = (options.userId ?? answers.userId ?? "").trim();

      if (!apiUrl || !userId) {
        throw new Error("apiUrl and userId are required.");
      }

      const profile = await upsertProfile({
        name: options.name,
        apiUrl,
        userId,
      });

      console.log(chalk.green(`Saved active profile '${profile.name}'.`));
      console.log(`Config path: ${getConfigPath()}`);
    });

  auth
    .command("whoami")
    .option("--json", "Output JSON")
    .action(async (options: { json?: boolean }) => {
      const profile = await requireActiveProfile();
      const client = new ApiClient(profile);

      try {
        const response = await client.get<WhoamiResponse>("/me");

        if (options.json) {
          printJson(response);
          return;
        }

        console.log(chalk.cyan("Active user"));
        console.log(`id: ${response.user.id}`);
        console.log(`email: ${response.user.email}`);
        console.log(`createdAt: ${response.user.createdAt}`);
      } catch (error) {
        if (error instanceof ApiError) {
          throw new Error(`whoami failed (${error.statusCode ?? "unknown"}): ${error.message}`);
        }

        throw error;
      }
    });

  auth.command("logout").action(async () => {
    await clearActiveProfile();
    await deleteConfig();
    console.log(chalk.yellow("Logged out. Config removed."));
  });
}
