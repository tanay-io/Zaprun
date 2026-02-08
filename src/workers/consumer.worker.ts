import { initProducer } from "../kafka/producer";
import { startConsumer } from "../kafka/consumer";
import { startTimerWorker } from "./timer.worker";

async function main() {
  try {
    await initProducer();
    await startConsumer();
    startTimerWorker();
    console.log("Outbox consumer worker and Timer worker started");
  } catch (err) {
    console.error(
      "Outbox consumer worker and Timer worker failed to start:",
      err,
    );
    process.exit(1);
  }
}

main();
