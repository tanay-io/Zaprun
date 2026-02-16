"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashStepDefinition = hashStepDefinition;
const crypto_1 = __importDefault(require("crypto"));
function hashStepDefinition(step) {
    const normalized = JSON.stringify({
        actionKey: step.actionKey,
        config: step.config,
        inputSchema: step.inputSchema,
        outputSchema: step.outputSchema,
    });
    return crypto_1.default.createHash("sha256").update(normalized).digest("hex");
}
