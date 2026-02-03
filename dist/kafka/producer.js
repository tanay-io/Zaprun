"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OUTBOX_TOPIC = void 0;
exports.initProducer = initProducer;
exports.publishOutbox = publishOutbox;
const kafkajs_1 = require("kafkajs");
const brokers = process.env.KAFKA_BROKERS?.split(",") ?? ["localhost:9092"];
exports.OUTBOX_TOPIC = process.env.OUTBOX_TOPIC ?? "zaprun-outbox";
const kafka = new kafkajs_1.Kafka({
    clientId: "zap-run",
    brokers,
});
const producer = kafka.producer();
let topicEnsured = false;
async function ensureOutboxTopic() {
    if (topicEnsured)
        return;
    const admin = kafka.admin();
    await admin.connect();
    await admin.createTopics({
        waitForLeaders: true,
        topics: [
            {
                topic: exports.OUTBOX_TOPIC,
                numPartitions: 1,
                replicationFactor: 1,
            },
        ],
    });
    await admin.disconnect();
    topicEnsured = true;
}
async function initProducer() {
    await ensureOutboxTopic();
    await producer.connect();
}
async function publishOutbox(outboxId) {
    await producer.send({
        topic: exports.OUTBOX_TOPIC,
        messages: [
            {
                value: JSON.stringify({ outboxId }),
            },
        ],
    });
}
