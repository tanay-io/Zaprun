import { initProducer } from "../kafka/producer";
import { startConsumer } from "../kafka/consumer";

async function main() {
  try {
    await initProducer();
    await startConsumer();
    console.log("Outbox consumer worker started");
  } catch (err) {
    console.error("Outbox consumer worker failed to start:", err);
    process.exit(1);
  }
}

main();
