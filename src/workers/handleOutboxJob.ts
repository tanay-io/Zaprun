import { prisma } from "../db/prisma";
import { claimOutboxJob } from "../outbox/claim";
import { completeJob } from "../outbox/complete";
import { failJob } from "../outbox/fail";
import { enqueueNextJob } from "../outbox/enqueue";
import { executorRegistry } from "../executors";
import { interpolateConfig } from "../utils/interpolate";
import { publishOutbox } from "../kafka/producer";

export async function handleOutboxJob(outboxId: string) {
  /**
   * STEP 1 — CLAIM OUTBOX JOB
   */
  const claimed = await claimOutboxJob(outboxId);
  if (!claimed) return;

  /**
   * STEP 2 — LOAD OUTBOX ROW
   */
  const outbox = await prisma.zapRunOutbox.findUnique({
    where: { id: outboxId },
  });
  if (!outbox || outbox.status !== "processing") return;

  /**
   * STEP 3 — LOAD ZAP RUN
   */
  const zapRun = await prisma.zapRun.findUnique({
    where: { id: outbox.zapRunId },
  });
  if (!zapRun) return;

  /**
   * STEP 4 — MARK ZAPRUN AS RUNNING (ONLY ON FIRST STEP)
   */
  if (outbox.stepIndex === 0 && zapRun.status === "pending") {
    await prisma.zapRun.update({
      where: { id: zapRun.id },
      data: { status: "running" },
    });
  }

  /**
   * STEP 5 — LOAD STEP DEFINITION
   */
  const action = await prisma.zapAction.findFirst({
    where: {
      zapId: zapRun.zapId,
      stepOrder: outbox.stepIndex,
    },
    include: {
      availableAction: true,
    },
  });

  // No step → workflow finished
  if (!action) {
    await completeJob(outbox.id);
    await prisma.zapRun.update({
      where: { id: zapRun.id },
      data: {
        status: "success",
        finishedAt: new Date(),
      },
    });
    return;
  }

  /**
   * STEP 6 — RESOLVE EXECUTOR + INTERPOLATE CONFIG
   */
  const executor = executorRegistry[action.availableAction.key];
  if (!executor) {
    await failJob(outbox.id);
    await prisma.zapRun.update({
      where: { id: zapRun.id },
      data: {
        status: "failed",
        failedStepId: action.id,
        error: {
          code: "EXECUTOR_NOT_FOUND",
          message: `Executor not found for ${action.availableAction.key}`,
          retriable: false,
        },
        finishedAt: new Date(),
      },
    });
    return;
  }

  const previousStepStates = await prisma.stepState.findMany({
    where: {
      zapRunId: zapRun.id,
      stepIndex: { lt: outbox.stepIndex },
      status: "success",
    },
  });

  const steps: Record<string, any> = {};
  for (const state of previousStepStates) {
    steps[`step${state.stepIndex}`] = state.output;
  }

  const resolvedConfig = interpolateConfig(action.config, {
    trigger: zapRun.triggerPayload,
    steps,
  });

  /**
   * STEP 7 — EXECUTE STEP + WRITE STEPSTATE
   */
  const startedAt = new Date();
  const result = await executor({
    payload: zapRun.triggerPayload,
    config: resolvedConfig,
  });

  if (result.status === "success") {
    await prisma.stepState.create({
      data: {
        zapRunId: zapRun.id,
        stepIndex: outbox.stepIndex,
        attempt: outbox.attempt,
        status: "success",
        output: result.output,
        startedAt,
        finishedAt: new Date(),
      },
    });

    /**
     * STEP 8A — SUCCESS PATH
     */
    await completeJob(outbox.id);

    const nextAction = await prisma.zapAction.findFirst({
      where: {
        zapId: zapRun.zapId,
        stepOrder: outbox.stepIndex + 1,
      },
    });

    if (nextAction) {
      const nextOutbox = await enqueueNextJob(
        zapRun.id,
        outbox.stepIndex,
      );
      await publishOutbox(nextOutbox.id);
    } else {
      await prisma.zapRun.update({
        where: { id: zapRun.id },
        data: {
          status: "success",
          finishedAt: new Date(),
        },
      });
    }
  } else {
    await prisma.stepState.create({
      data: {
        zapRunId: zapRun.id,
        stepIndex: outbox.stepIndex,
        attempt: outbox.attempt,
        status: "error",
        error: result.error,
        startedAt,
        finishedAt: new Date(),
      },
    });

    /**
     * STEP 8B — FAILURE PATH
     */
    await failJob(outbox.id);
    await prisma.zapRun.update({
      where: { id: zapRun.id },
      data: {
        status: "failed",
        failedStepId: action.id,
        error: result.error,
        finishedAt: new Date(),
      },
    });
  }
}
