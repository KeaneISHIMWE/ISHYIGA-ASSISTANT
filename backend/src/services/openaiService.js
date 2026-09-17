const OpenAI = require("openai");
const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { SYSTEM_PROMPT } = require("./supportSystemPrompt");
const {
  classifyIntent,
  conversationalFallback,
  isConversationalMessage,
  isActionRequiredIntent,
  unknownFallback,
} = require("./intentService");

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_HISTORY_MESSAGES = 16;
const FALLBACK_REPLY =
  "Sorry, I didn't quite understand that. Could you explain what you need help with?";
const ESCALATION_REPLY =
  "I've sent your request to my fellow support so they can assist you.";
const ESCALATE_TOOL = {
  type: "function",
  function: {
    name: "escalate_to_support",
    description:
      "Create a VIBE ticket and notify the assigned support agent only when the customer needs an action you cannot perform: register a contact, change company data, change POS configuration, add a user, or another task with no API or permission. Do not use this for how-to questions, greetings, troubleshooting you can explain, or when you are only unsure.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Short description of the customer issue",
        },
        why: {
          type: "string",
          description: "Why a support agent must intervene",
        },
        tried: {
          type: "string",
          description: "What you already checked or tried",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        reason: {
          type: "string",
          enum: [
            "support_required",
            "unregistered_contact",
            "human_requested",
            "ai_escalation",
          ],
        },
      },
      required: ["summary", "why"],
    },
  },
};
const GREETING_REPLY = "Hello 👋 How can I help you today?";
const UNREGISTERED_IDENTITY_REPLY =
  "Hello 👋 It seems this number isn't registered with us yet. May I know your name and the company you represent?";
const MAX_CONSECUTIVE_FALLBACKS = 2;
const UNREGISTERED_STATUS_MARKER =
  "CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT";
const IDENTITY_DETAIL_PATTERN =
  /\b(ltd|limited|pharmacy|sarl|inc\.?|company|clinic|shop|store|hotel|school|hospital|i(?:'m| am)|my name is|nitwa|nziwa|twitwa)\b/i;

function createClient(apiKey) {
  return new OpenAI({
    apiKey,
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

function isGreetingOnly(message) {
  return isConversationalMessage(message);
}

function isUnregisteredPrompt(clientContext) {
  return String(clientContext || "").includes(UNREGISTERED_STATUS_MARKER);
}

function hasIdentityDetails(message) {
  return IDENTITY_DETAIL_PATTERN.test(String(message || ""));
}

function resolveFailedCustomerReply(history, reply = FALLBACK_REPLY, message = "") {
  if (
    isActionRequiredIntent(classifyIntent(message)) &&
    countConsecutiveFailedReplies(history) >= MAX_CONSECUTIVE_FALLBACKS
  ) {
    return ESCALATION_REPLY;
  }

  return conversationalFallback(message) || reply || unknownFallback();
}

function resolveCustomerFacingFailure({
  message,
  history,
  hasImage = false,
  reply = FALLBACK_REPLY,
  clientContext = "",
} = {}) {
  if (!hasImage && isGreetingOnly(message)) {
    return conversationalFallback(message) || GREETING_REPLY;
  }

  if (!hasImage && isUnregisteredPrompt(clientContext)) {
    return UNREGISTERED_IDENTITY_REPLY;
  }

  return resolveFailedCustomerReply(history, reply, message);
}

function failureResult({ message, history, image, error, clientContext }) {
  return {
    ok: false,
    reply: resolveCustomerFacingFailure({
      message,
      history,
      hasImage: Boolean(image && image.dataUrl),
      clientContext,
    }),
    error,
  };
}

function extractReplyText(response) {
  const text = response && response.choices && response.choices[0]
    ? response.choices[0].message && response.choices[0].message.content
    : "";

  return typeof text === "string" ? text.trim() : "";
}

function extractEscalationRequest(response) {
  const message =
    response && response.choices && response.choices[0]
      ? response.choices[0].message
      : null;
  const calls = message && Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const call = calls.find((item) => {
    const name =
      (item && item.function && item.function.name) || (item && item.name);
    return name === "escalate_to_support";
  });

  if (!call) {
    return null;
  }

  let args = {};
  try {
    args = JSON.parse((call.function && call.function.arguments) || "{}");
  } catch (_error) {
    args = {};
  }

  const summary = typeof args.summary === "string" ? args.summary.trim() : "";
  const why = typeof args.why === "string" ? args.why.trim() : "";
  if (!summary && !why) {
    return {
      summary: "Support intervention required",
      why: why || "A support agent needs to take action.",
      tried: typeof args.tried === "string" ? args.tried.trim() : "",
      priority: args.priority,
      reason: args.reason,
    };
  }

  return {
    summary: summary || "Support intervention required",
    why: why || "A support agent needs to take action.",
    tried: typeof args.tried === "string" ? args.tried.trim() : "",
    priority: args.priority,
    reason: args.reason,
  };
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
    if (
      code === "insufficient_quota" ||
      code === "credit_balance_exhausted" ||
      /quota|no credits remaining|credit_balance/i.test(message)
    ) {
      return "insufficient_quota";
    }
    return "rate_limit";
  }

  if (status === 401 || status === 403) {
    return "auth";
  }

  if (
    status === 400 &&
    /context|token|too large|maximum/i.test(message)
  ) {
    return "context_length";
  }

  return "api_error";
}

function shouldRetryWithoutHistory(reason, historyCount) {
  return (
    historyCount > 0 &&
    (reason === "api_error" ||
      reason === "timeout" ||
      reason === "context_length")
  );
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
    return failureResult({
      message,
      history,
      image,
      error: "Missing message",
      clientContext,
    });
  }

  const apiKey = env.openaiApiKey;
  const model = hasImage ? env.openaiVisionModel : env.openaiModel;
  const openai = client || (apiKey ? createClient(apiKey) : null);

  if (!openai) {
    logger.error("OpenAI request failed", { reason: "missing_api_key" });
    return failureResult({
      message,
      history,
      image,
      error: "OpenAI is not configured",
      clientContext,
    });
  }

  const trimmedMessage =
    typeof message === "string" && message.trim()
      ? message.trim()
      : "The client sent a screenshot of the problem.";
  const safeHistory = normalizeHistory(history);
  const intent = classifyIntent(trimmedMessage);
  const allowTools = hasImage || isActionRequiredIntent(intent);

  const startedAt = Date.now();
  logger.info("OpenAI request started", {
    model,
    historyCount: safeHistory.length,
    hasImage,
    intent,
    toolsEnabled: allowTools,
  });

  const requestCompletion = (historyForRequest, withTools = allowTools) =>
    openai.chat.completions.create(
      {
        model,
        messages: buildInput(
          trimmedMessage,
          historyForRequest,
          hasImage ? image : null,
          clientContext
        ),
        ...(withTools ? { tools: [ESCALATE_TOOL], tool_choice: "auto" } : {}),
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );

  const logFailure = (error, reason) => {
    const detail =
      typeof error.message === "string" ? error.message.slice(0, 180) : "";
    logger.error("OpenAI request failed", {
      reason,
      status: error.status || error.statusCode || null,
      code: error.code || null,
      durationMs: Date.now() - startedAt,
      detail,
    });
  };

  try {
    let response;
    try {
      response = await requestCompletion(safeHistory);
    } catch (error) {
      const reason = classifyOpenAIError(error);
      logFailure(error, reason);

      if (shouldRetryWithoutHistory(reason, safeHistory.length)) {
        logger.warn("OpenAI request retrying without history", { reason });
        response = await requestCompletion([]);
      } else if (reason === "api_error" || reason === "timeout") {
        logger.warn("OpenAI request retrying without tools", { reason });
        response = await requestCompletion(safeHistory, false);
      } else {
        return failureResult({
          message: trimmedMessage,
          history: safeHistory,
          image,
          error: reason,
          clientContext,
        });
      }
    }

    let escalationRequest = extractEscalationRequest(response);
    let text = extractReplyText(response);
    const unregistered = isUnregisteredPrompt(clientContext);
    const skipEscalation =
      Boolean(escalationRequest) &&
      !hasImage &&
      (!isActionRequiredIntent(intent) ||
        (unregistered && !hasIdentityDetails(trimmedMessage)));

    if (skipEscalation) {
      return {
        ok: true,
        reply:
          text ||
          conversationalFallback(trimmedMessage) ||
          (unregistered && !hasIdentityDetails(trimmedMessage)
            ? UNREGISTERED_IDENTITY_REPLY
            : unknownFallback()),
        escalationRequest: null,
        intent,
      };
    }

    if (!text && !escalationRequest) {
      logger.warn("OpenAI response received", { empty: true });
      try {
        response = await requestCompletion(safeHistory, false);
        text = extractReplyText(response);
        escalationRequest = extractEscalationRequest(response);
      } catch (retryError) {
        const retryReason = classifyOpenAIError(retryError);
        logFailure(retryError, retryReason);
        return failureResult({
          message: trimmedMessage,
          history: safeHistory,
          image,
          error: retryReason,
          clientContext,
        });
      }

      if (!text && !escalationRequest) {
        return failureResult({
          message: trimmedMessage,
          history: safeHistory,
          image,
          error: "Empty model response",
          clientContext,
        });
      }
    }

    logger.info("OpenAI response received", {
      model: response.model || model,
      durationMs: Date.now() - startedAt,
      promptTokens:
        response.usage && response.usage.prompt_tokens != null
          ? response.usage.prompt_tokens
          : null,
      completionTokens:
        response.usage && response.usage.completion_tokens != null
          ? response.usage.completion_tokens
          : null,
    });
    return {
      ok: true,
      reply: text || "",
      escalationRequest: allowTools ? escalationRequest : null,
      intent,
    };
  } catch (error) {
    const reason = classifyOpenAIError(error);
    logFailure(error, reason);
    return failureResult({
      message: trimmedMessage,
      history: safeHistory,
      image,
      error: reason,
      clientContext,
    });
  }
}

module.exports = {
  generateReply,
  buildInput,
  buildSystemPrompt,
  classifyOpenAIError,
  FALLBACK_REPLY,
  ESCALATION_REPLY,
  extractEscalationRequest,
  GREETING_REPLY,
  UNREGISTERED_IDENTITY_REPLY,
  MAX_CONSECUTIVE_FALLBACKS,
  isGreetingOnly,
  hasIdentityDetails,
  resolveFailedCustomerReply,
  resolveCustomerFacingFailure,
  SYSTEM_PROMPT,
  REQUEST_TIMEOUT_MS,
  MAX_HISTORY_MESSAGES,
};
