import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
  redact: {
    paths: [
      "authData",
      "connection.authData",
      "accessToken",
      "*.accessToken",
      "refreshToken",
      "*.refreshToken",
      "clientSecret",
      "*.clientSecret",
      "authorization",
      "*.authorization",
      "apiKey",
      "*.apiKey",
    ],
    censor: "[REDACTED]",
  },
});
