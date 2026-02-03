import { Kafka } from "kafkajs";

const brokers = process.env.KAFKA_BROKERS?.split(",") ?? ["localhost:9092"];
export const OUTBOX_TOPIC = process.env.OUTBOX_TOPIC ?? "zaprun-outbox";

const kafka = new Kafka({
  clientId: "zap-run",
  brokers,
});

const producer = kafka.producer();
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

export async function initProducer() {
  await ensureOutboxTopic();
  await producer.connect();
}

export async function publishOutbox(outboxId: string) {
  await producer.send({
    topic: OUTBOX_TOPIC,
    messages: [
      {
        value: JSON.stringify({ outboxId }),
      },
    ],
  });
}
