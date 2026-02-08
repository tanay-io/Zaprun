import { prisma } from "../db/prisma";
import { publishOutbox } from "../kafka/producer";

const TICK_MS = 5000;
const BATCH_SIZE = 50;

export async function startTimerWorker() { 
  console.log("Timer worker started");

  while (true) { 
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

      for (const job of readyJobs) {
        await publishOutbox(job.id);
      }

    } catch (error) {
      console.error("Timer worker error:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
}