import { initProducer } from "../kafka/producer";
import { startConsumer } from "../kafka/consumer";
import { startTimerWorker } from "./timer.worker";
import { loadPlugins } from "../engines/pluginRegistry";
import { logger } from "../utils/logger";

async function main() {
  try {
    await loadPlugins();
    await initProducer();
    await startConsumer();
    startTimerWorker();
    logger.info("Outbox consumer worker and Timer worker started");
  } catch (err) {
    logger.error(err, "Outbox consumer worker and Timer worker failed to start");
    process.exit(1);
  }
}

main();
