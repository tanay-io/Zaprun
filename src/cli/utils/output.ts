import CliTable3 from "cli-table3";

type SimpleTable = {
  push: (row: unknown[]) => void;
  toString: () => string;
};

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toISOString();
}

export function createTable(head: string[]): SimpleTable {
  return new (CliTable3 as unknown as new (config: unknown) => SimpleTable)({
    head,
    style: {
      head: ["cyan"],
    },
    wordWrap: true,
  });
}

export function durationMs(startedAt?: string | null, finishedAt?: string | null): string {
  if (!startedAt || !finishedAt) {
    return "-";
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "-";
  }

  return `${Math.max(end - start, 0)}ms`;
}

export function safePreview(value: unknown, maxLength = 120): string {
  if (value == null) {
    return "-";
  }

  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}
