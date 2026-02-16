"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const producer_1 = require("../kafka/producer");
const consumer_1 = require("../kafka/consumer");
const timer_worker_1 = require("./timer.worker");
async function main() {
    try {
        await (0, producer_1.initProducer)();
        await (0, consumer_1.startConsumer)();
        (0, timer_worker_1.startTimerWorker)();
        console.log("Outbox consumer worker and Timer worker started");
    }
    catch (err) {
        console.error("Outbox consumer worker and Timer worker failed to start:", err);
        process.exit(1);
    }
}
main();
