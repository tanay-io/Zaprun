import { prisma } from "../db/prisma";
import { executorRegistry } from "../executors";
import { interpolateConfig } from "../utils/interpolate";

export async function runZap(zapRunId: string) {
  const zapRun = await prisma.zapRun.findUnique({
    where: { id: zapRunId },
  });

  if (!zapRun) {
    throw new Error("ZapRun not found");
  }

  if (zapRun.status !== "pending") {
    throw new Error(`Illegal ZapRun state: ${zapRun.status}`);
  }

  await prisma.zapRun.update({
    where: { id: zapRunId },
    data: { status: "running" },
  });

  // 3. Fetch actions
  const actions = await prisma.zapAction.findMany({
    where: { zapId: zapRun.zapId },
    orderBy: { stepOrder: "asc" },
    include: {
      availableAction: true,
    },
  });

  let payload = zapRun.triggerPayload;
  const steps: Record<string, any> = {};

  for (const action of actions) {
    const executor = executorRegistry[action.availableAction.key];

    if (!executor) {
      await prisma.zapRun.update({
        where: { id: zapRunId },
        data: {
          status: "failed",
          failedStepId: action.id,
          error: {
            code: "EXECUTOR_NOT_FOUND",
            message: `No executor for ${action.availableAction.key}`,
            retriable: false,
          },
          finishedAt: new Date(),
        },
      });
      return;
    }

    const resolvedConfig = interpolateConfig(action.config, {
      payload,
      steps,
    });

    const result = await executor({
      payload,
      config: resolvedConfig,
    });

    if (result.status === "error") {
      await prisma.zapRun.update({
        where: { id: zapRunId },
        data: {
          status: "failed",
          failedStepId: action.id,
          error: result.error,
          finishedAt: new Date(),
        },
      });

      return; 
    }

    steps[`step${action.stepOrder}`] = result.output;
  }

  await prisma.zapRun.update({
    where: { id: zapRunId },
    data: {
      status: "success",
      finishedAt: new Date(),
    },
  });
}
