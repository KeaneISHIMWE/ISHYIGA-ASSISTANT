const OpenAI = require("openai");
const { env } = require("../config/env");
const { logger } = require("../utils/logger");

const REQUEST_TIMEOUT_MS = 20_000;
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const FALLBACK_REPLY =
  "Sorry, I could not generate a reply just now. Please try again in a moment.";
const SYSTEM_PROMPT =
  "You are a company WhatsApp assistant. Reply in short, professional, text-only messages. Do not mention that you are an AI unless asked.";

function createClient(apiKey) {
  return new OpenAI({
    apiKey,
    baseURL: GROQ_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (item) =>
        item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim()
    )
    .map((item) => ({
      role: item.role,
      content: item.content.trim(),
    }));
}

function buildInput(message, history) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...normalizeHistory(history),
    { role: "user", content: message },
  ];
}

function extractReplyText(response) {
  const text = response && response.choices && response.choices[0]
    ? response.choices[0].message && response.choices[0].message.content
    : "";

  return typeof text === "string" ? text.trim() : "";
}

function classifyOpenAIError(error) {
  if (!error) {
    return "unknown";
  }

  const status = error.status || error.statusCode;
  const name = error.name || "";
  const code = error.code || "";
  const message = typeof error.message === "string" ? error.message : "";

  if (
    name === "APIConnectionTimeoutError" ||
    code === "ETIMEDOUT" ||
    /timeout/i.test(message)
  ) {
    return "timeout";
  }

  if (status === 429) {
    if (code === "insufficient_quota" || /quota/i.test(message)) {
      return "insufficient_quota";
    }
    return "rate_limit";
  }

  if (status === 401 || status === 403) {
    return "auth";
  }

  return "api_error";
}

async function generateReply({ message, history = [], client } = {}) {
  if (typeof message !== "string" || !message.trim()) {
    return {
      ok: false,
      reply: FALLBACK_REPLY,
      error: "Missing message",
    };
  }

  const apiKey = env.groqApiKey;
  const model = env.groqModel;
  const groq = client || (apiKey ? createClient(apiKey) : null);

  if (!groq) {
    logger.error("Groq request failed", { reason: "missing_api_key" });
    return {
      ok: false,
      reply: FALLBACK_REPLY,
      error: "Groq is not configured",
    };
  }

  const trimmedMessage = message.trim();
  const safeHistory = normalizeHistory(history);

  logger.info("Groq request started", {
    model,
    historyCount: safeHistory.length,
  });

  try {
    const response = await groq.chat.completions.create(
      {
        model,
        messages: buildInput(trimmedMessage, safeHistory),
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const text = extractReplyText(response);

    if (!text) {
      logger.warn("Groq response received", { empty: true });
      return {
        ok: false,
        reply: FALLBACK_REPLY,
        error: "Empty model response",
      };
    }

    logger.info("Groq response received", { model });
    return { ok: true, reply: text };
  } catch (error) {
    const reason = classifyOpenAIError(error);
    logger.error("Groq request failed", { reason });
    return {
      ok: false,
      reply: FALLBACK_REPLY,
      error: reason,
    };
  }
}

module.exports = {
  generateReply,
  buildInput,
  classifyOpenAIError,
  FALLBACK_REPLY,
  SYSTEM_PROMPT,
  REQUEST_TIMEOUT_MS,
  GROQ_BASE_URL,
};
