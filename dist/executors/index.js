"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executorRegistry = void 0;
const http_executor_1 = require("./http.executor");
exports.executorRegistry = {
    http: http_executor_1.httpExecutor,
};
