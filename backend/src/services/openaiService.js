const OpenAI = require("openai");
const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { SYSTEM_PROMPT } = require("./supportSystemPrompt");
const {
  formatConversationMemory,
} = require("./conversationMemoryService");
const {
  INTENTS,
  classifyIntent,
  conversationalFallback,
  isConversationalMessage,
  isActionRequiredIntent,
  isNonTicketIntent,
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
  const baseURL = (env.openaiBaseUrl || "").trim();
  return new OpenAI({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    ...(baseURL ? { baseURL } : {}),
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

const SCREENSHOT_ANALYZE_PROMPT =
  "Analyze this customer-support screenshot. Reply with JSON only, no markdown. Keys: readable (boolean), application, errorMessage, visibleText, likelyIssue, inferredRequest, needsSupportAction (boolean), whySupportNeeded, followUp. Set readable=false if the image is blurry, cropped, unreadable, or missing the relevant section. Set needsSupportAction=true only if the screenshot shows an action a first-line assistant cannot perform, such as registering a contact, changing company data, changing POS configuration, or changing permissions. How-to screens and errors you can explain are false. Do not copy passwords, PINs, full card numbers, or other secrets.";

const IMAGE_UNCLEAR_REPLY =
  "I received your screenshot, but it is not clear enough to read the important part. Please send a sharper photo of the full error or screen, or tell me what you see.";

function parseScreenshotAnalysis(text) {
  const raw = String(text || "").trim();
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(json);
    return {
      ok: true,
      readable: parsed.readable !== false,
      application: String(parsed.application || "").trim(),
      errorMessage: String(parsed.errorMessage || "").trim(),
      visibleText: String(parsed.visibleText || "").trim().slice(0, 240),
      likelyIssue: String(parsed.likelyIssue || "").trim(),
      inferredRequest: String(parsed.inferredRequest || "").trim(),
      needsSupportAction: parsed.needsSupportAction === true,
      whySupportNeeded: String(parsed.whySupportNeeded || "").trim(),
      followUp: String(parsed.followUp || "").trim(),
    };
  } catch (_error) {
    return null;
  }
}

function formatScreenshotContext(analysis) {
  if (!analysis || !analysis.ok) {
    return "";
  }

  return [
    "SCREENSHOT ANALYSIS",
    `Readable: ${analysis.readable ? "yes" : "no"}`,
    analysis.application ? `Application: ${analysis.application}` : null,
    analysis.errorMessage ? `Visible error: ${analysis.errorMessage}` : null,
    analysis.visibleText ? `Visible text: ${analysis.visibleText}` : null,
    analysis.likelyIssue ? `Likely issue: ${analysis.likelyIssue}` : null,
    analysis.inferredRequest
      ? `Inferred request: ${analysis.inferredRequest}`
      : null,
    `Needs support action: ${analysis.needsSupportAction ? "yes" : "no"}`,
    analysis.whySupportNeeded
      ? `Why support is needed: ${analysis.whySupportNeeded}`
      : null,
    "Use this analysis with the screenshot. Do not ignore the image. Do not invent error text that is not listed here. Do not create a VIBE ticket only because a screenshot was sent.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function analyzeScreenshot({
  image,
  message,
  client,
} = {}) {
  const hasImage = Boolean(image && image.dataUrl);
  if (!hasImage) {
    return { ok: false, readable: false, error: "missing_image" };
  }

  const apiKey = env.openaiApiKey;
  const openai = client || (apiKey ? createClient(apiKey) : null);
  if (!openai) {
    return { ok: false, readable: false, error: "OpenAI is not configured" };
  }

  const caption =
    typeof message === "string" && message.trim()
      ? message.trim()
      : "The client sent this screenshot without extra text.";

  try {
    const response = await openai.chat.completions.create(
      {
        model: env.openaiVisionModel,
        messages: [
          { role: "system", content: SCREENSHOT_ANALYZE_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: caption },
              { type: "image_url", image_url: { url: image.dataUrl } },
            ],
          },
        ],
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const parsed = parseScreenshotAnalysis(extractReplyText(response));
    if (!parsed) {
      logger.warn("Screenshot analysis returned unusable JSON");
      return { ok: true, readable: true, needsSupportAction: false };
    }

    logger.info("Screenshot analyzed", {
      readable: parsed.readable,
      application: parsed.application || null,
      needsSupportAction: parsed.needsSupportAction,
    });
    return parsed;
  } catch (error) {
    logger.error("Screenshot analysis failed", {
      reason: classifyOpenAIError(error),
    });
    return { ok: false, readable: true, needsSupportAction: false, error: "analyze_failed" };
  }
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
  conversationSummary,
  screenshotAnalysis,
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
  const intent = classifyIntent(
    screenshotAnalysis && screenshotAnalysis.inferredRequest
      ? `${trimmedMessage} ${screenshotAnalysis.inferredRequest}`
      : trimmedMessage
  );
  const allowTools =
    screenshotAnalysis && screenshotAnalysis.needsSupportAction === false
      ? isActionRequiredIntent(intent)
      : (!isNonTicketIntent(intent) && intent !== INTENTS.INFORMATION_REQUEST) ||
        Boolean(screenshotAnalysis && screenshotAnalysis.needsSupportAction) ||
        isActionRequiredIntent(intent);

  const startedAt = Date.now();
  logger.info("OpenAI request started", {
    model,
    historyCount: safeHistory.length,
    hasSummary: Boolean(
      conversationSummary && String(conversationSummary).trim()
    ),
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
          clientContext,
          conversationSummary
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
      (isNonTicketIntent(intent) ||
        (intent === INTENTS.INFORMATION_REQUEST &&
          (!screenshotAnalysis || screenshotAnalysis.needsSupportAction !== true)) ||
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
      needsSupportAction: Boolean(
        screenshotAnalysis && screenshotAnalysis.needsSupportAction
      ),
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
  analyzeScreenshot,
  parseScreenshotAnalysis,
  formatScreenshotContext,
  IMAGE_UNCLEAR_REPLY,
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
  combineClientContext,
};
