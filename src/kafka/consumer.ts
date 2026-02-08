import { Kafka } from "kafkajs";
import { handleOutboxJob } from "../engines/handleOutboxJob";

const brokers = process.env.KAFKA_BROKERS?.split(",") ?? ["localhost:9092"];
const OUTBOX_TOPIC = process.env.OUTBOX_TOPIC ?? "zaprun-outbox";

const kafka = new Kafka({
  clientId: "zap-run-worker",
  brokers,
});

const consumer = kafka.consumer({
  groupId: "zaprun-workers",
});

let topicEnsured = false;

async function ensureOutboxTopic() {
  if (topicEnsured) return;
  const admin = kafka.admin();
  await admin.connect();
  await admin.createTopics({
    waitForLeaders: true,
    topics: [
      {
        topic: OUTBOX_TOPIC,
        numPartitions: 1,
        replicationFactor: 1,
      },
    ],
  });
  await admin.disconnect();
  topicEnsured = true;
}

export async function startConsumer() {
  await ensureOutboxTopic();
  await consumer.connect();
  await consumer.subscribe({
    topic: OUTBOX_TOPIC,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const { outboxId } = JSON.parse(message.value.toString());

      console.log("Received outboxId:", outboxId);
      await handleOutboxJob(outboxId);
    },
  });
}
