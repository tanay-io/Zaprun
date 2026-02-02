import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "zap-run-worker",
  brokers: ["kafka1:9092", "kafka2:9092"],
});

const consumer = kafka.consumer({
  groupId: "zaprun-workers",
});

export async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({
    topic: "zaprun-outbox",
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const { outboxId } = JSON.parse(message.value.toString());

      // Phase 5.2 ends HERE
      // Phase 5.3 will start from here
      console.log("Received outboxId:", outboxId);

      // next phase:
      // await handleOutboxJob(outboxId);
    },
  });
}
