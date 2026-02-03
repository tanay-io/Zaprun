import app from "./api/app";
import { initProducer } from "./kafka/producer";

const PORT = 3000;

async function main() {
  try {
    await initProducer();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start services:", err);
    process.exit(1);
  }
}

main();
