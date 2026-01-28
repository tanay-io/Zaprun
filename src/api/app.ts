import express from "express";
import webhookRouter from "./routes/webhook";
import debugRouter from "./routes/debug";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  console.log("Hi there");
  res.json({ ok: true });
});
app.use(express.json());
app.use(webhookRouter);
app.use(debugRouter);
export default app;
