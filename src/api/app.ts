import express from "express";
import webhookRouter from "./routes/webhook";
import zapsRouter from "./routes/zaps";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  console.log("Hi there");
  res.json({ ok: true });
});
app.use(express.json());
app.use(webhookRouter);
app.use(zapsRouter);
export default app;
