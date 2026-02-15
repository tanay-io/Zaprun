import crypto from "crypto";

export function hashStepDefinition(step: {
  actionKey: string;
  config: any;
  inputSchema: any;
  outputSchema: any;
}) {
  const normalized = JSON.stringify({
    actionKey: step.actionKey,
    config: step.config,
    inputSchema: step.inputSchema,
    outputSchema: step.outputSchema,
  });

  return crypto.createHash("sha256").update(normalized).digest("hex");
}
