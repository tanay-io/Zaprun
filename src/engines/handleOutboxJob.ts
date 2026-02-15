import { prisma } from "../db/prisma";
import { claimOutboxJob } from "../outbox/claim";
import { completeJob } from "../outbox/complete";
import { failJob } from "../outbox/fail";
import { enqueueNextJob } from "../outbox/enqueue";
import { executorRegistry } from "../executors";
import { interpolateConfig } from "../utils/interpolate";
import { publishOutbox } from "../kafka/producer";
import { handleSystemWait } from "./systemWait";

export async function handleOutboxJob(outboxId: string) {
  /**
   * STEP 1 — CLAIM OUTBOX JOB
   */
  const MAX_RETRIES = 3;
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
    include: {
      zapVersion: {
        include: {
          steps: true,
        },
      },
    },
  });
  if (!zapRun || !zapRun.zapVersion) return;

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
  const step = zapRun.zapVersion.steps.find(
    (s) => s.stepIndex === outbox.stepIndex,
  );
  if (!step) {
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

  if (step.actionKey === "system.wait") {
    const durationMs = (step.config as Record<string, unknown>).durationMs;

    if (typeof durationMs !== "number") {
      throw new Error("system.wait requires durationMs");
    }

    await handleSystemWait(zapRun.id, outbox.id, outbox.stepIndex, durationMs);

    return;
  }

  /**
   * STEP 6 — RESOLVE EXECUTOR + INTERPOLATE CONFIG
   */
  const executor = executorRegistry[step.actionKey];
  if (!executor) {
    await failJob(outbox.id);
    await prisma.zapRun.update({
      where: { id: zapRun.id },
      data: {
        status: "failed",
        failedStepId: step.id,
        error: {
          code: "EXECUTOR_NOT_FOUND",
          message: `Executor not found for ${step.actionKey}`,
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

  const resolvedConfig = interpolateConfig(step.config, {
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

    const nextStepIndex = outbox.stepIndex + 1;
    const nextStep = zapRun.zapVersion.steps.find(
      (s) => s.stepIndex === nextStepIndex,
    );

    if (nextStep) {
      const nextOutbox = await enqueueNextJob(zapRun.id, outbox.stepIndex);
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
    const shouldRetry =
      result.error?.retriable === true && outbox.attempt < MAX_RETRIES;

    if (shouldRetry) {
      await failJob(outbox.id);

      const retryOutbox = await prisma.zapRunOutbox.create({
        data: {
          zapRunId: outbox.zapRunId,
          stepIndex: outbox.stepIndex,
          attempt: outbox.attempt + 1,
          status: "pending",
        },
      });

      await publishOutbox(retryOutbox.id);

      return;
    }

    await failJob(outbox.id);

    await prisma.zapRun.update({
      where: { id: zapRun.id },
      data: {
        status: "failed",
        failedStepId: step.id,
        error: result.error,
        finishedAt: new Date(),
      },
    });
  }
}
