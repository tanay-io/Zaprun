import { Command } from "commander";
import inquirer from "inquirer";
import { createClientFromActiveProfile, requireActiveProfile } from "../utils/profile";
import { printJson } from "../utils/output";

type ProviderSummary = {
  key: string;
  name: string;
};

type ProviderDetail = {
  provider: {
    key: string;
    name: string;
    triggers: Array<{ key: string; name: string; description: string }>;
    actions: Array<{ key: string; name: string; description: string }>;
  };
};

type ProvidersResponse = {
  providers: ProviderSummary[];
};

type CreateResponse = {
  zap: {
    id: string;
    name: string;
    status: string;
  };
};

type CreateDraft = {
  name: string;
  status: "active" | "paused";
  trigger: {
    availableTriggerKey: string;
    config: unknown;
  };
  actions: Array<{
    availableActionKey: string;
    config: unknown;
  }>;
};

function printDraftSummary(draft: CreateDraft): void {
  console.log("Draft:");
  console.log(`name: ${draft.name}`);
  console.log(`status: ${draft.status}`);
  console.log(`trigger: ${draft.trigger.availableTriggerKey}`);
  console.log(
    `actions: ${draft.actions.map((action) => action.availableActionKey).join(" -> ")}`,
  );
}

async function confirmDraft(draft: CreateDraft): Promise<CreateDraft | null> {
  let currentDraft = draft;

  while (true) {
    printDraftSummary(currentDraft);

    const confirmation = await inquirer.prompt<{
      decision: "confirm" | "edit" | "cancel";
    }>([
      {
        type: "list",
        name: "decision",
        message: "Confirm draft?",
        choices: [
          { name: "Confirm", value: "confirm" },
          { name: "Edit (restart wizard)", value: "edit" },
          { name: "Cancel", value: "cancel" },
        ],
        default: "confirm",
      },
    ]);

    if (confirmation.decision === "confirm") {
      return currentDraft;
    }

    if (confirmation.decision === "cancel") {
      return null;
    }

    currentDraft = await buildManualDraft();
  }
}

async function parseJsonInput(prompt: string, defaultValue: string): Promise<unknown> {
  while (true) {
    const answer = await inquirer.prompt<{ value: string }>([
      {
        type: "input",
        name: "value",
        message: prompt,
        default: defaultValue,
      },
    ]);

    try {
      return JSON.parse(answer.value);
    } catch {
      console.log("Invalid JSON. Please try again.");
    }
  }
}

async function buildManualDraft(): Promise<CreateDraft> {
  const client = await createClientFromActiveProfile();
  const providers = await client.get<ProvidersResponse>("/providers");

  const allTriggers: Array<{ label: string; value: string }> = [];
  const allActions: Array<{ label: string; value: string }> = [];

  for (const provider of providers.providers) {
    const detail = await client.get<ProviderDetail>(`/providers/${provider.key}`);

    for (const trigger of detail.provider.triggers) {
      allTriggers.push({
        label: `${detail.provider.name} :: ${trigger.name} (${trigger.key})`,
        value: trigger.key,
      });
    }

    for (const action of detail.provider.actions) {
      allActions.push({
        label: `${detail.provider.name} :: ${action.name} (${action.key})`,
        value: action.key,
      });
    }
  }

  if (allTriggers.length === 0) {
    throw new Error("No triggers available. Seed triggers first.");
  }
  if (allActions.length === 0) {
    throw new Error("No actions available. Seed actions first.");
  }

  const nameAnswer = await inquirer.prompt<{ name: string }>([
    {
      type: "input",
      name: "name",
      message: "Automation name",
      default: "My automation",
    },
  ]);

  const triggerAnswer = await inquirer.prompt<{ triggerKey: string }>([
    {
      type: "list",
      name: "triggerKey",
      message: "Select trigger",
      choices: allTriggers,
    },
  ]);

  const triggerConfig = await parseJsonInput("Trigger config JSON", "{}");

  const actions: Array<{ availableActionKey: string; config: unknown }> = [];
  let addMore = true;

  while (addMore) {
    const actionAnswer = await inquirer.prompt<{ actionKey: string }>([
      {
        type: "list",
        name: "actionKey",
        message: `Select action #${actions.length + 1}`,
        choices: allActions,
      },
    ]);

    const actionConfig = await parseJsonInput("Action config JSON", "{}");
    actions.push({
      availableActionKey: actionAnswer.actionKey,
      config: actionConfig,
    });

    const continueAnswer = await inquirer.prompt<{ next: boolean }>([
      {
        type: "confirm",
        name: "next",
        message: "Add another action?",
        default: false,
      },
    ]);

    addMore = continueAnswer.next;
  }

  const statusAnswer = await inquirer.prompt<{ status: "active" | "paused" }>([
    {
      type: "list",
      name: "status",
      message: "Initial status",
      choices: [
        { name: "paused", value: "paused" },
        { name: "active", value: "active" },
      ],
      default: "paused",
    },
  ]);

  return {
    name: nameAnswer.name,
    status: statusAnswer.status,
    trigger: {
      availableTriggerKey: triggerAnswer.triggerKey,
      config: triggerConfig,
    },
    actions,
  };
}

export function registerCreateCommand(program: Command): void {
  program
    .command("create")
    .description("Interactive automation creation")
    .option("--json", "Output JSON")
    .action(async (options: { json?: boolean }) => {
      const client = await createClientFromActiveProfile();
      const profile = await requireActiveProfile();

      const intentAnswer = await inquirer.prompt<{ intent: string }>([
        {
          type: "input",
          name: "intent",
          message: "What do you want to automate?",
        },
      ]);

      let draft: CreateDraft | null = null;
      if (intentAnswer.intent.trim().length > 0) {
        try {
          const aiResponse = await client.post<{ draft?: CreateDraft }>("/ai/parse-intent", {
            text: intentAnswer.intent,
          });

          if (aiResponse?.draft?.trigger && Array.isArray(aiResponse.draft.actions)) {
            draft = aiResponse.draft;
          }
        } catch {
          draft = null;
        }
      }

      if (!draft) {
        draft = await buildManualDraft();
      }

      const confirmedDraft = await confirmDraft(draft);
      if (!confirmedDraft) {
        console.log("Cancelled.");
        return;
      }

      const response = await client.post<CreateResponse>("/zaps", {
        userId: profile.userId,
        name: confirmedDraft.name,
        status: confirmedDraft.status,
        trigger: {
          availableTriggerKey: confirmedDraft.trigger.availableTriggerKey,
          config: confirmedDraft.trigger.config,
        },
        actions: confirmedDraft.actions.map((action) => ({
          availableActionKey: action.availableActionKey,
          config: action.config,
        })),
      });

      if (options.json) {
        printJson(response);
        return;
      }

      console.log(`Created automation '${response.zap.name}' with id=${response.zap.id}`);
    });
}
