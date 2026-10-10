import pino from "pino";

export const log = pino({
  name: "creatorcrew-worker",
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "*.apiKey",
    "*.authorization",
    "*.OPENAI_API_KEY",
    "*.OPENROUTER_API_KEY",
    "*.X_API_BEARER",
  ],
});
