import express from "express";
import webhookRouter from "./routes/webhook";
import zapsRouter from "./routes/zaps";
import zapRunsRouter from "./routes/zapRuns";
import providersRouter from "./routes/providers";
import authRouter from "./routes/oauth/auth";
import connectionsRouter from "./routes/apiKeys/connections";
import { logger } from "../utils/logger";
import { prisma } from "../db/prisma";

const app = express();
app.use(webhookRouter);
app.use(express.json());

app.get("/health", (req, res) => {
  logger.debug("Health check hit");
  res.json({ ok: true });
});

app.get("/me", async (req, res) => {
  const userId =
    (typeof req.header("x-user-id") === "string" && req.header("x-user-id")) ||
    (typeof req.query.userId === "string" ? req.query.userId : null);

  if (!userId) {
    return res.status(400).json({
      message:
        "Missing user identity. Provide x-user-id header or userId query param.",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
  });

  if (!user) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  return res.status(200).json({ user });
});

app.use(zapsRouter);
app.use(zapRunsRouter);
app.use(providersRouter);
app.use(authRouter);
app.use(connectionsRouter);
export default app;
