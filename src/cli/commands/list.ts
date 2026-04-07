import { Command } from "commander";
import { createClientFromActiveProfile } from "../utils/profile";
import { createTable, formatDate, printJson } from "../utils/output";

type ZapListItem = {
  id: string;
  name: string;
  status: "active" | "paused";
  trigger: { key: string; name: string } | null;
  actions: Array<{ key: string; name: string; stepOrder: number }>;
  latestRun: {
    id: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
  } | null;
};

type ZapListResponse = {
  zaps: ZapListItem[];
};

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List automations")
    .option("--status <status>", "Filter by status: active|paused")
    .option("--json", "Output JSON")
    .action(async (options: { status?: string; json?: boolean }) => {
      const client = await createClientFromActiveProfile();
      const response = await client.get<ZapListResponse>("/zaps", {
        ...(options.status ? { status: options.status } : {}),
      });

      if (options.json) {
        printJson(response);
        return;
      }

      if (response.zaps.length === 0) {
        console.log("No automations found.");
        return;
      }

      const table = createTable([
        "id",
        "name",
        "status",
        "trigger",
        "actions",
        "lastRun",
        "lastStatus",
      ]);

      for (const zap of response.zaps) {
        table.push([
          zap.id,
          zap.name,
          zap.status,
          zap.trigger ? `${zap.trigger.name} (${zap.trigger.key})` : "-",
          zap.actions.length,
          formatDate(zap.latestRun?.startedAt),
          zap.latestRun?.status ?? "-",
        ]);
      }

      console.log(table.toString());
    });
}
