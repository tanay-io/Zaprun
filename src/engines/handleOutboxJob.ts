import { prisma } from "../db/prisma";
import { claimOutboxJob } from "../outbox/claim";
import { completeJob } from "../outbox/complete";
import { failJob } from "../outbox/fail";
import { enqueueNextJob } from "../outbox/enqueue";
import { getActionManifest, getExecutor } from "./pluginRegistry";
import { interpolateConfig } from "../utils/interpolate";
import { publishOutbox } from "../kafka/producer";
import { handleSystemWait } from "./systemWait";
import { validateStepConfig } from "../utils/validateStepConfig";
import { getConnection } from "../auth/resolvers/oauth2";
import { resolveConnectionAuth } from "../auth/services/connectionAuth";

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
      zap: {
        select: {
          userId: true,
        },
      },
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
  const executor = getExecutor(step.actionKey);
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
   * STEP 6.5 — VALIDATE INTERPOLATED CONFIG AGAINST MANIFEST SCHEMA
   */
  const validation = validateStepConfig(step.actionKey, resolvedConfig);
  if (!validation.valid) {
    await failJob(outbox.id);

    await prisma.stepState.create({
      data: {
        zapRunId: zapRun.id,
        stepIndex: outbox.stepIndex,
        attempt: outbox.attempt,
        status: "error",
        error: {
          code: "VALIDATION_FAILED",
          message: "Interpolated config failed schema validation",
          errors: validation.errors,
        },
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });

    await prisma.zapRun.update({
      where: { id: zapRun.id },
      data: {
        status: "failed",
        failedStepId: step.id,
        error: {
          code: "VALIDATION_FAILED",
          message: "Interpolated config failed schema validation",
          errors: validation.errors,
          retriable: false,
        },
        finishedAt: new Date(),
      },
    });
    return;
  }

  /**
   * STEP 6.75 — RESOLVE/REFRESH CONNECTION AUTH IF STEP NEEDS ONE
   */
  const actionManifest = getActionManifest(step.actionKey);
  if (actionManifest?.requiresConnection) {
    const failWithConnectionError = async (code: string, message: string) => {
      await failJob(outbox.id);

      await prisma.stepState.create({
        data: {
          zapRunId: zapRun.id,
          stepIndex: outbox.stepIndex,
          attempt: outbox.attempt,
          status: "error",
          error: {
            code,
            message,
            retriable: false,
          },
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });

      await prisma.zapRun.update({
        where: { id: zapRun.id },
        data: {
          status: "failed",
          failedStepId: step.id,
          error: {
            code,
            message,
            retriable: false,
          },
          finishedAt: new Date(),
        },
      });
    };

    const configRecord =
      resolvedConfig &&
      typeof resolvedConfig === "object" &&
      !Array.isArray(resolvedConfig)
        ? (resolvedConfig as Record<string, unknown>)
        : null;

    const connectionId =
      configRecord && typeof configRecord.connectionId === "string"
        ? configRecord.connectionId
        : null;

    if (!connectionId) {
      await failWithConnectionError(
        "CONNECTION_INVALID",
        "connectionId is required for step requiring connection",
      );
      return;
    }

    let connection = await getConnection(connectionId, zapRun.zap.userId);
    if (!connection || connection.status !== "active") {
      await failWithConnectionError(
        "CONNECTION_INVALID",
        "Connection is missing or inactive",
      );
      return;
    }
    //fixed bug: what if somehow we have a malicious thing that puts wrong connectionId in the config? Like suppose
    // slack token is in the config but the connection is for github provider it will fail everytime no matter what
    // we also need to fix in the creation of zap too like we need to add a check in the post:/zaps endpoint
    const stepProvider = step?.actionKey.split(".")[0];
    if (connection.provider != stepProvider) {
      await failWithConnectionError(
        "CONNECTION_INVALID",
        `Connection provider (${connection.provider}) does not match step provider (${stepProvider})`,
      );
      return;
    }
    try {
      const resolvedAuth = await resolveConnectionAuth(connection);

      const existingHeaders =
        configRecord &&
        configRecord.headers &&
        typeof configRecord.headers === "object" &&
        !Array.isArray(configRecord.headers)
          ? (configRecord.headers as Record<string, unknown>)
          : {};

      configRecord!.headers = {
        ...existingHeaders,
        ...resolvedAuth.headers,
      };

      const hasAuthQueryParams =
        Object.keys(resolvedAuth.queryParams).length > 0;

      if (hasAuthQueryParams) {
        const existingQueryParams =
          configRecord &&
          configRecord.queryParams &&
          typeof configRecord.queryParams === "object" &&
          !Array.isArray(configRecord.queryParams)
            ? (configRecord.queryParams as Record<string, unknown>)
            : {};

        configRecord!.queryParams = {
          ...existingQueryParams,
          ...resolvedAuth.queryParams,
        };
      }
    } catch {
      await failWithConnectionError(
        "CONNECTION_AUTH_FAILED",
        "Failed to resolve connection auth. Reconnect provider and retry.",
      );
      return;
    }
  }

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
