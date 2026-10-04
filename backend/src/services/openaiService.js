const OpenAI = require("openai");
const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { SYSTEM_PROMPT } = require("./supportSystemPrompt");
const {
  formatConversationMemory,
} = require("./conversationMemoryService");

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_HISTORY_MESSAGES = 40;
const FALLBACK_REPLY =
  "Sorry, I didn't get that properly. Could you please explain it to me again?";
const ESCALATION_REPLY =
  "I'm having trouble answering right now. Please contact our support team and we'll help you from there.";
const GREETING_REPLY = "Hello 👋";
const MAX_CONSECUTIVE_FALLBACKS = 2;
const GREETING_ONLY_PATTERN =
  /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|bonjour|salut|muraho|habari)(?:\s+there)?[!.,\s]*$/i;

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

function combineClientContext(clientContext, conversationSummary) {
  const memoryContext = formatConversationMemory(conversationSummary);
  return [clientContext, memoryContext]
    .filter((part) => typeof part === "string" && part.trim())
    .join("\n\n");
}

function buildSystemPrompt(clientContext, conversationSummary) {
  const combined = combineClientContext(clientContext, conversationSummary);
  if (!combined) {
    return SYSTEM_PROMPT;
  }

  return `${SYSTEM_PROMPT}\n\n${combined}`;
}

function buildInput(
  message,
  history,
  image,
  clientContext,
  conversationSummary
) {
  return [
    {
      role: "system",
      content: buildSystemPrompt(clientContext, conversationSummary),
    },
    ...normalizeHistory(history),
    { role: "user", content: buildUserContent(message, image) },
  ];
}

function buildResponseInput(message, history, image) {
  const turns = normalizeHistory(history).map((item) => ({
    role: item.role,
    content: item.content,
  }));

  if (!image || typeof image.dataUrl !== "string" || !image.dataUrl) {
    turns.push({ role: "user", content: message });
    return turns;
  }

  turns.push({
    role: "user",
    content: [
      { type: "input_text", text: message },
      { type: "input_image", image_url: image.dataUrl },
    ],
  });
  return turns;
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
  if (typeof message !== "string") {
    return false;
  }

  return GREETING_ONLY_PATTERN.test(message.trim());
}

function resolveFailedCustomerReply(history, reply = FALLBACK_REPLY) {
  if (countConsecutiveFailedReplies(history) >= MAX_CONSECUTIVE_FALLBACKS) {
    return ESCALATION_REPLY;
  }

  return reply || FALLBACK_REPLY;
}

function resolveCustomerFacingFailure({
  message,
  history,
  hasImage = false,
  reply = FALLBACK_REPLY,
} = {}) {
  if (!hasImage && isGreetingOnly(message)) {
    return GREETING_REPLY;
  }

  return resolveFailedCustomerReply(history, reply);
}

function failureResult({ message, history, image, error }) {
  return {
    ok: false,
    reply: resolveCustomerFacingFailure({
      message,
      history,
      hasImage: Boolean(image && image.dataUrl),
    }),
    error,
  };
}

function extractTextFromContent(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

function extractReplyText(response) {
  if (!response) {
    return "";
  }

  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  if (Array.isArray(response.output)) {
    const parts = [];
    for (const item of response.output) {
      if (!item || item.type !== "message" || !Array.isArray(item.content)) {
        continue;
      }
      for (const part of item.content) {
        if (part && typeof part.text === "string" && part.text.trim()) {
          parts.push(part.text.trim());
        }
      }
    }
    if (parts.length) {
      return parts.join("\n");
    }
  }

  const message =
    response.choices && response.choices[0] ? response.choices[0].message : null;
  if (!message) {
    return "";
  }

  const fromContent = extractTextFromContent(message.content);
  if (fromContent) {
    return fromContent;
  }

  return typeof message.refusal === "string" ? message.refusal.trim() : "";
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
    /function tools|reasoning_effort|\btools\b/i.test(message)
  ) {
    return "extras_unsupported";
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
  return historyCount > 0 && reason === "context_length";
}

function shouldRetryPlainCompletion(reason) {
  return (
    reason === "extras_unsupported" ||
    reason === "api_error" ||
    reason === "timeout"
  );
}

async function generateReply({
  message,
  history = [],
  image,
  client,
  clientContext,
  conversationSummary,
} = {}) {
  const hasImage = Boolean(image && image.dataUrl);
  if (!hasImage && (typeof message !== "string" || !message.trim())) {
    return failureResult({
      message,
      history,
      image,
      error: "Missing message",
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
    });
  }

  const trimmedMessage =
    typeof message === "string" && message.trim()
      ? message.trim()
      : "The client sent a screenshot of the problem.";
  const safeHistory = normalizeHistory(history);

  const startedAt = Date.now();
  logger.info("OpenAI request started", {
    model,
    historyCount: safeHistory.length,
    hasSummary: Boolean(
      conversationSummary && String(conversationSummary).trim()
    ),
    hasImage,
  });

  const requestCompletion = (historyForRequest, extra = {}) => {
    const body = {
      model,
      messages: buildInput(
        trimmedMessage,
        historyForRequest,
        hasImage ? image : null,
        clientContext,
        conversationSummary
      ),
    };
    if (extra.maxTokens !== false) {
      body.max_completion_tokens = 2048;
    }
    if (extra.reasoning !== false) {
      body.reasoning_effort = "none";
    }
    return openai.chat.completions.create(body, {
      timeout: REQUEST_TIMEOUT_MS,
    });
  };

  const requestResponse = (historyForRequest, extra = {}) => {
    const body = {
      model,
      instructions: buildSystemPrompt(clientContext, conversationSummary),
      input: buildResponseInput(
        trimmedMessage,
        historyForRequest,
        hasImage ? image : null
      ),
      store: false,
    };
    if (extra.maxTokens !== false) {
      body.max_output_tokens = 2048;
    }
    if (extra.reasoning !== false) {
      body.reasoning = { effort: "none" };
    }
    return openai.responses.create(body, { timeout: REQUEST_TIMEOUT_MS });
  };

  const requestModel = async (historyForRequest, extra = {}) => {
    if (openai.responses && typeof openai.responses.create === "function") {
      try {
        const result = await requestResponse(historyForRequest, extra);
        if (extractReplyText(result)) {
          return result;
        }
        logger.warn("OpenAI responses API returned empty text");
      } catch (error) {
        logger.warn("OpenAI responses API failed, using chat completions", {
          reason: classifyOpenAIError(error),
          detail:
            typeof error.message === "string" ? error.message.slice(0, 180) : "",
        });
      }
    }

    return requestCompletion(historyForRequest, extra);
  };

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
      response = await requestModel(safeHistory);
    } catch (error) {
      const reason = classifyOpenAIError(error);
      logFailure(error, reason);

      if (shouldRetryPlainCompletion(reason)) {
        logger.warn("OpenAI request retrying without extras", { reason });
        try {
          response = await requestModel(safeHistory, {
            reasoning: false,
            maxTokens: false,
          });
        } catch (retryError) {
          const retryReason = classifyOpenAIError(retryError);
          logFailure(retryError, retryReason);
          if (shouldRetryWithoutHistory(retryReason, safeHistory.length)) {
            logger.warn("OpenAI request retrying without history", {
              reason: retryReason,
            });
            response = await requestModel([], {
              reasoning: false,
              maxTokens: false,
            });
          } else {
            return failureResult({
              message: trimmedMessage,
              history: safeHistory,
              image,
              error: retryReason,
            });
          }
        }
      } else if (shouldRetryWithoutHistory(reason, safeHistory.length)) {
        logger.warn("OpenAI request retrying without history", { reason });
        response = await requestModel([]);
      } else {
        return failureResult({
          message: trimmedMessage,
          history: safeHistory,
          image,
          error: reason,
        });
      }
    }

    let text = extractReplyText(response);

    if (!text) {
      logger.warn("OpenAI response received", { empty: true });
      try {
        response = await requestModel(safeHistory, {
          reasoning: false,
          maxTokens: false,
        });
        text = extractReplyText(response);
      } catch (retryError) {
        const retryReason = classifyOpenAIError(retryError);
        logFailure(retryError, retryReason);
        return failureResult({
          message: trimmedMessage,
          history: safeHistory,
          image,
          error: retryReason,
        });
      }
    }

    if (!text) {
      return failureResult({
        message: trimmedMessage,
        history: safeHistory,
        image,
        error: "Empty model response",
      });
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
    return { ok: true, reply: text };
  } catch (error) {
    const reason = classifyOpenAIError(error);
    logFailure(error, reason);
    return failureResult({
      message: trimmedMessage,
      history: safeHistory,
      image,
      error: reason,
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
  GREETING_REPLY,
  MAX_CONSECUTIVE_FALLBACKS,
  isGreetingOnly,
  resolveFailedCustomerReply,
  resolveCustomerFacingFailure,
  SYSTEM_PROMPT,
  REQUEST_TIMEOUT_MS,
  MAX_HISTORY_MESSAGES,
  combineClientContext,
  buildResponseInput,
};
