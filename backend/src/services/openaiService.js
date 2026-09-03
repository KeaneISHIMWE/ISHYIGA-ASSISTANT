const OpenAI = require("openai");
const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { SYSTEM_PROMPT } = require("./supportSystemPrompt");

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_HISTORY_MESSAGES = 16;
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const FALLBACK_REPLY =
  "Sorry, I didn't get that properly. Could you please explain it to me again?";
const ESCALATION_REPLY =
  "I'm having trouble answering right now. Please contact our support team and we'll help you from there.";
const MAX_CONSECUTIVE_FALLBACKS = 2;

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

  const normalized = history
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

  if (normalized.length <= MAX_HISTORY_MESSAGES) {
    return normalized;
  }

  return normalized.slice(-MAX_HISTORY_MESSAGES);
}

function buildUserContent(message, image) {
  if (!image || typeof image.dataUrl !== "string" || !image.dataUrl) {
    return message;
  }

  return [
    { type: "text", text: message },
    {
      type: "image_url",
      image_url: { url: image.dataUrl },
    },
  ];
}

function buildSystemPrompt(clientContext) {
  if (typeof clientContext !== "string" || !clientContext.trim()) {
    return SYSTEM_PROMPT;
  }

  return `${SYSTEM_PROMPT}\n\n${clientContext.trim()}`;
}

function buildInput(message, history, image, clientContext) {
  return [
    { role: "system", content: buildSystemPrompt(clientContext) },
    ...normalizeHistory(history),
    { role: "user", content: buildUserContent(message, image) },
  ];
}

function isFailedAssistantReply(content) {
  return content === FALLBACK_REPLY || content === ESCALATION_REPLY;
}

function countConsecutiveFailedReplies(history) {
  if (!Array.isArray(history)) {
    return 0;
  }

  let count = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (!item || item.role === "user") {
      continue;
    }

    if (item.role !== "assistant") {
      break;
    }

    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!isFailedAssistantReply(content)) {
      break;
    }

    count += 1;
  }

  return count;
}

function resolveFailedCustomerReply(history, reply = FALLBACK_REPLY) {
  if (countConsecutiveFailedReplies(history) >= MAX_CONSECUTIVE_FALLBACKS) {
    return ESCALATION_REPLY;
  }

  return reply || FALLBACK_REPLY;
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

async function generateReply({
  message,
  history = [],
  image,
  client,
  clientContext,
} = {}) {
  const hasImage = Boolean(image && image.dataUrl);
  if (!hasImage && (typeof message !== "string" || !message.trim())) {
    return {
      ok: false,
      reply: FALLBACK_REPLY,
      error: "Missing message",
    };
  }

  const apiKey = env.groqApiKey;
  const model = hasImage ? env.groqVisionModel : env.groqModel;
  const groq = client || (apiKey ? createClient(apiKey) : null);

  if (!groq) {
    logger.error("Groq request failed", { reason: "missing_api_key" });
    return {
      ok: false,
      reply: FALLBACK_REPLY,
      error: "Groq is not configured",
    };
  }

  const trimmedMessage =
    typeof message === "string" && message.trim()
      ? message.trim()
      : "The client sent a screenshot of the problem.";
  const safeHistory = normalizeHistory(history);

  logger.info("Groq request started", {
    model,
    historyCount: safeHistory.length,
    hasImage,
  });

  try {
    const response = await groq.chat.completions.create(
      {
        model,
        messages: buildInput(
          trimmedMessage,
          safeHistory,
          hasImage ? image : null,
          clientContext
        ),
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
    const detail =
      typeof error.message === "string" ? error.message.slice(0, 180) : "";
    logger.error("Groq request failed", {
      reason,
      status: error.status || error.statusCode || null,
      code: error.code || null,
      detail,
    });
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
  buildSystemPrompt,
  classifyOpenAIError,
  FALLBACK_REPLY,
  ESCALATION_REPLY,
  MAX_CONSECUTIVE_FALLBACKS,
  resolveFailedCustomerReply,
  SYSTEM_PROMPT,
  REQUEST_TIMEOUT_MS,
  MAX_HISTORY_MESSAGES,
  GROQ_BASE_URL,
};
