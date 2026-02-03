"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./api/app"));
const producer_1 = require("./kafka/producer");
const PORT = 3000;
async function main() {
    try {
        await (0, producer_1.initProducer)();
        app_1.default.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    }
    catch (err) {
        console.error("Failed to start services:", err);
        process.exit(1);
    }
}
main();
