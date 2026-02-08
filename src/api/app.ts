import express from "express";
import webhookRouter from "./routes/webhook";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  console.log("Hi there");
  res.json({ ok: true });
});
app.use(express.json());
app.use(webhookRouter);
export default app;
