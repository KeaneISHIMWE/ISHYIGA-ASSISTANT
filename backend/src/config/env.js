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
  whatsappApiVersion: readEnv("WHATSAPP_API_VERSION", "v21.0"),
  openaiApiKey: readEnv("OPENAI_API_KEY", ""),
  openaiModel: readEnv("OPENAI_MODEL", "gpt-5"),
};

if (!Number.isInteger(env.port) || env.port <= 0) {
  throw new Error("PORT must be a positive integer");
}

if (!env.databaseUrl.startsWith("postgres")) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection string");
}

module.exports = { env };
