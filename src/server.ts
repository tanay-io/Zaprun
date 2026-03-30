import app from "./api/app";
import { initProducer } from "./kafka/producer";
import { loadPlugins } from "./engines/pluginRegistry";
import { logger } from "./utils/logger";

const PORT = 3000;

async function main() {
  try {
    await loadPlugins();
    await initProducer();
    app.listen(PORT, () => {
      logger.info({ port: PORT }, `Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error(err, "Failed to start services");
    process.exit(1);
  }
}

main();
