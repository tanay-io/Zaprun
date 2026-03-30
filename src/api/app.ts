import express from "express";
import webhookRouter from "./routes/webhook";
import zapsRouter from "./routes/zaps";
import zapRunsRouter from "./routes/zapRuns";
import providersRouter from "./routes/providers";
import { logger } from "../utils/logger";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  logger.debug("Health check hit");
  res.json({ ok: true });
});
app.use(webhookRouter);
app.use(zapsRouter);
app.use(zapRunsRouter);
app.use(providersRouter);
export default app;
