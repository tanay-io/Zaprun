import { prisma } from "../db/prisma";
import { publishOutbox } from "../kafka/producer";
import { logger } from "../utils/logger";

const BASE_TICK_MS = 4000;
const JITTER_MS = 2000;
const BATCH_SIZE = 50;

let running = true;

function nextTick(): number {
  return BASE_TICK_MS + Math.random() * JITTER_MS;
}

export async function startTimerWorker() {
  logger.info("Timer worker started");

  process.on("SIGTERM", () => {
    logger.info("Timer worker received SIGTERM, shutting down gracefully");
    running = false;
  });
  process.on("SIGINT", () => {
    logger.info("Timer worker received SIGINT, shutting down gracefully");
    running = false;
  });

  while (running) {
    try {
      const now = new Date();

      const readyJobs = await prisma.zapRunOutbox.findMany({
        where: {
          status: "pending",
          resumeAt: {
            lte: now,
          },
        },
        orderBy: {
          resumeAt: "asc",
        },
        take: BATCH_SIZE,
      });

      if (readyJobs.length > 0) {
        logger.info({ count: readyJobs.length }, "Timer worker found due jobs");
      }

      for (const job of readyJobs) {
        await publishOutbox(job.id);
      }
    } catch (error) {
      logger.error(error, "Timer worker error");
    }
    await new Promise((resolve) => setTimeout(resolve, nextTick()));
  }

  logger.info("Timer worker shut down cleanly");
}