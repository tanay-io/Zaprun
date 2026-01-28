"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const webhook_1 = __importDefault(require("./routes/webhook"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get("/health", (req, res) => {
    console.log("Hi there");
    res.json({ ok: true });
});
app.use(express_1.default.json());
app.use(webhook_1.default);
exports.default = app;
