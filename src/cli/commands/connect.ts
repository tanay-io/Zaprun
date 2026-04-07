import { Command } from "commander";
import chalk from "chalk";
import open from "open";
import { createClientFromActiveProfile } from "../utils/profile";
import { createTable, formatDate, printJson } from "../utils/output";
import { sleep } from "../utils/runs";

type ConnectionItem = {
  id: string;
  providerKey: string;
  displayName: string;
  healthy: boolean;
  scopes: string[];
  expiresAt?: string | null;
  updatedAt?: string | null;
};

type ConnectionsResponse = {
  connections: ConnectionItem[];
};

type TestConnectionResponse = {
  healthy: boolean;
  status: string;
  httpStatus?: number;
  error?: string;
};

function renderConnections(connections: ConnectionItem[]): void {
  const table = createTable(["id", "provider", "healthy", "scopes", "expiresAt"]);

  for (const connection of connections) {
    table.push([
      connection.id,
      `${connection.displayName} (${connection.providerKey})`,
      connection.healthy ? "yes" : "no",
      connection.scopes.join(", ") || "-",
      formatDate(connection.expiresAt),
    ]);
  }

  console.log(table.toString());
}

function parseTimeoutSeconds(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("timeout must be a positive integer number of seconds.");
  }

  return parsed;
}

function findCompletedConnection(
  provider: string,
  before: ConnectionItem[],
  after: ConnectionItem[],
): ConnectionItem | null {
  const beforeById = new Map(before.map((connection) => [connection.id, connection]));

  for (const connection of after) {
    if (connection.providerKey !== provider) {
      continue;
    }

    const previous = beforeById.get(connection.id);
    if (!previous) {
      return connection;
    }

    if (
      previous.updatedAt !== connection.updatedAt ||
      previous.healthy !== connection.healthy ||
      previous.expiresAt !== connection.expiresAt
    ) {
      return connection;
    }
  }

  return null;
}

export function registerConnectCommands(program: Command): void {
  const connect = program.command("connect").description("Manage provider connections");

  connect
    .command("list")
    .option("--json", "Output JSON")
    .action(async (options: { json?: boolean }) => {
      const client = await createClientFromActiveProfile();
      const response = await client.get<ConnectionsResponse>("/connections");

      if (options.json) {
        printJson(response);
        return;
      }

      if (response.connections.length === 0) {
        console.log("No connections found.");
        return;
      }

      renderConnections(response.connections);
    });

  connect
    .command("test <providerOrId>")
    .option("--json", "Output JSON")
    .action(async (providerOrId: string, options: { json?: boolean }) => {
      const client = await createClientFromActiveProfile();
      const response = await client.get<ConnectionsResponse>("/connections");

      const target =
        response.connections.find((connection) => connection.id === providerOrId) ??
        response.connections.find((connection) => connection.providerKey === providerOrId);

      if (!target) {
        throw new Error(`Connection not found for '${providerOrId}'.`);
      }

      const testResult = await client.get<TestConnectionResponse>(`/connections/${target.id}/test`);

      if (options.json) {
        printJson(testResult);
        return;
      }

      console.log(
        `provider=${target.providerKey} healthy=${testResult.healthy} status=${testResult.status}`,
      );
      if (typeof testResult.httpStatus === "number") {
        console.log(`httpStatus=${testResult.httpStatus}`);
      }
      if (testResult.error) {
        console.log(`error=${testResult.error}`);
      }
    });

  connect
    .command("<provider>")
    .option("--no-open", "Do not automatically open the browser")
    .option("--timeout <seconds>", "Polling timeout in seconds", "120")
    .action(
      async (
        provider: string,
        options: { open: boolean; timeout: string },
      ) => {
        const client = await createClientFromActiveProfile();

        const before = await client.get<ConnectionsResponse>("/connections");

        const startResponse = await client.requestRaw<string>({
          method: "GET",
          url: `/auth/${provider}/start`,
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400,
        });

        const authUrlHeader = startResponse.headers.location;
        const authUrlBody =
          typeof startResponse.data === "string" &&
          startResponse.data.startsWith("http")
            ? startResponse.data
            : null;
        const authUrl = authUrlHeader ?? authUrlBody;

        if (!authUrl) {
          throw new Error("OAuth start did not return a redirect URL.");
        }

        console.log(chalk.cyan(`Open this URL to continue: ${authUrl}`));
        if (options.open) {
          await open(authUrl);
        }

        const timeoutMs = parseTimeoutSeconds(options.timeout) * 1000;
        const startedAt = Date.now();
        let stopped = false;
        const onSigint = () => {
          stopped = true;
          console.log("Stopped waiting for connection.");
        };
        process.once("SIGINT", onSigint);

        try {
          while (!stopped && Date.now() - startedAt < timeoutMs) {
            await sleep(2500);
            const after = await client.get<ConnectionsResponse>("/connections");
            const connected = findCompletedConnection(
              provider,
              before.connections,
              after.connections,
            );

            if (connected) {
              console.log(
                chalk.green(
                  `Connected to ${connected.displayName} (connectionId=${connected.id})`,
                ),
              );
              return;
            }
          }
        } finally {
          process.removeListener("SIGINT", onSigint);
        }

        if (stopped) {
          return;
        }

        throw new Error(`Timed out waiting for '${provider}' connection.`);
      },
    );
}
