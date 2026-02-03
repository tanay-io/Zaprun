"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const producer_1 = require("../kafka/producer");
const consumer_1 = require("../kafka/consumer");
async function main() {
    try {
        await (0, producer_1.initProducer)();
        await (0, consumer_1.startConsumer)();
        console.log("Outbox consumer worker started");
    }
    catch (err) {
        console.error("Outbox consumer worker failed to start:", err);
        process.exit(1);
    }
}
main();
