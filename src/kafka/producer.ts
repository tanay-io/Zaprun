import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "zap-run",
  brokers: ["kafka1:9092", "kafka2:9092"],
});

export const producer = kafka.producer();

export async function initProducer() {
  await producer.connect();
}

export async function publishOutbox(outboxId: string) {
  await producer.send({
    topic: "zaprun-outbox",
    messages: [
      {
        value: JSON.stringify({ outboxId }),
      },
    ],
  });
}
