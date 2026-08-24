const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

function readEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  return value;
}

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

const env = {
  nodeEnv: readEnv("NODE_ENV", "development"),
  port: Number(readEnv("PORT", "4000")),
  databaseUrl: requireEnv("DATABASE_URL"),
  whatsappVerifyToken: requireEnv("WHATSAPP_VERIFY_TOKEN"),
  whatsappAppSecret: readEnv("WHATSAPP_APP_SECRET", ""),
  whatsappAccessToken: readEnv("WHATSAPP_ACCESS_TOKEN", ""),
  whatsappPhoneNumberId: readEnv("WHATSAPP_PHONE_NUMBER_ID", ""),
  whatsappApiVersion: readEnv("WHATSAPP_API_VERSION", "v23.0"),
  groqApiKey: readEnv("GROQ_API_KEY", ""),
  groqModel: readEnv("GROQ_MODEL", "openai/gpt-oss-20b"),
  groqVisionModel: readEnv("GROQ_VISION_MODEL", "qwen/qwen3.6-27b"),
  clientsApiUrl: readEnv("CLIENTS_API_URL", ""),
  clientsApiKey: readEnv("CLIENTS_API_KEY", ""),
  clientsApiTimeoutMs: Number(readEnv("CLIENTS_API_TIMEOUT_MS", "8000")),
  conversationsApiKey: readEnv("CONVERSATIONS_API_KEY", ""),
};

if (!Number.isInteger(env.port) || env.port <= 0) {
  throw new Error("PORT must be a positive integer");
}

if (!env.databaseUrl.startsWith("postgres")) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection string");
}

if (
  !Number.isInteger(env.clientsApiTimeoutMs) ||
  env.clientsApiTimeoutMs <= 0
) {
  throw new Error("CLIENTS_API_TIMEOUT_MS must be a positive integer");
}

module.exports = { env };
