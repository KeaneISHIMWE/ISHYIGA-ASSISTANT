const OpenAI = require("openai");
const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const conversationModel = require("../models/conversation");
const messageModel = require("../models/message");

const MAX_SUMMARY_CHARS = 2500;
const MEMORY_RECENT_LIMIT = 40;
const SUMMARY_AFTER_MESSAGES = 16;
const SUMMARY_REFRESH_AFTER = 8;
const SUMMARY_SOURCE_LIMIT = 60;
const REQUEST_TIMEOUT_MS = 20_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isConversationId(value) {
  return UUID_PATTERN.test(String(value || ""));
}

const SUMMARIZE_PROMPT =
  "Summarize this customer-support conversation for a first-line assistant. Facts only. Include the current issue, troubleshooting already tried, company or identity facts, ticket status if mentioned, and decisions. Do not invent. Do not include passwords, PINs, card numbers, or other secrets. Maximum 180 words. Reply with plain text only.";

function createClient(apiKey) {
  return new OpenAI({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

function formatTranscript(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }

  return messages
    .filter(
      (row) =>
        row &&
        typeof row.message === "string" &&
        row.message.trim() &&
        (row.sender_type === "customer" ||
          row.sender_type === "assistant" ||
          row.role === "user" ||
          row.role === "assistant")
    )
    .map((row) => {
      const isCustomer =
        row.sender_type === "customer" || row.role === "user";
      const text = String(row.message || row.content || "").trim();
      return `${isCustomer ? "Client" : "AI"}: ${text}`;
    })
    .join("\n");
}

function seedSummaryFromMessages(messages) {
  const transcript = formatTranscript(
    Array.isArray(messages) ? messages.slice(-8) : []
  );
  if (!transcript) {
    return "";
  }

  return `Earlier conversation:\n${transcript}`.slice(0, MAX_SUMMARY_CHARS);
}

function formatConversationMemory(summary) {
  const text = typeof summary === "string" ? summary.trim() : "";
  if (!text) {
    return "";
  }

  return [
    "CONVERSATION MEMORY",
    "Earlier in this client's conversation (do not invent extra details):",
    text.slice(0, MAX_SUMMARY_CHARS),
    "This conversation is still open. Use this together with the recent chat messages. Do not ask the client to repeat facts already listed here unless you need confirmation. This memory belongs only to this client.",
  ].join("\n");
}

function shouldRefreshSummary({
  messageCount = 0,
  messagesSinceSummary = 0,
  hasSummary = false,
} = {}) {
  if (messageCount <= SUMMARY_AFTER_MESSAGES) {
    return false;
  }

  if (!hasSummary) {
    return true;
  }

  return messagesSinceSummary >= SUMMARY_REFRESH_AFTER;
}

function compactFallbackSummary(existingSummary, olderMessages) {
  const prior = typeof existingSummary === "string" ? existingSummary.trim() : "";
  const transcript = formatTranscript(olderMessages).slice(0, 1800);
  if (!prior && !transcript) {
    return "";
  }

  return [prior, transcript].filter(Boolean).join("\n").slice(0, MAX_SUMMARY_CHARS);
}

function extractSummaryText(response) {
  const text =
    response &&
    response.choices &&
    response.choices[0] &&
    response.choices[0].message &&
    response.choices[0].message.content;

  return typeof text === "string" ? text.trim() : "";
}

async function summarizeConversation({
  existingSummary,
  olderMessages,
  client,
} = {}) {
  const fallback = compactFallbackSummary(existingSummary, olderMessages);
  const transcript = formatTranscript(olderMessages);
  if (!transcript && !existingSummary) {
    return "";
  }

  const apiKey = env.openaiApiKey;
  const openai = client || (apiKey ? createClient(apiKey) : null);
  if (!openai) {
    return fallback;
  }

  try {
    const response = await openai.chat.completions.create(
      {
        model: env.openaiModel,
        messages: [
          { role: "system", content: SUMMARIZE_PROMPT },
          {
            role: "user",
            content: [
              existingSummary
                ? `Existing summary:\n${String(existingSummary).trim()}`
                : null,
              transcript ? `Older messages:\n${transcript}` : null,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const summary = extractSummaryText(response);
    return summary ? summary.slice(0, MAX_SUMMARY_CHARS) : fallback;
  } catch (_error) {
    logger.error("Conversation summary failed", { reason: "api_error" });
    return fallback;
  }
}

async function loadConversationSummary(
  conversationId,
  { findConversation = conversationModel.findById } = {}
) {
  if (!isConversationId(conversationId)) {
    return "";
  }

  try {
    const row = await findConversation(conversationId);
    return row && typeof row.summary === "string" ? row.summary.trim() : "";
  } catch (_error) {
    logger.error("Conversation summary load failed");
    return "";
  }
}

async function maybeRefreshConversationMemory(
  {
    conversationId,
    recentHistory = [],
    currentMessage,
    assistantReply,
  } = {},
  {
    findConversation = conversationModel.findById,
    countMessages = messageModel.countByConversationId,
    countAfter = messageModel.countCreatedAfter,
    listMessages = messageModel.listRecentByConversationId,
    saveSummary = conversationModel.updateSummary,
    summarizeFn = summarizeConversation,
  } = {}
) {
  if (!isConversationId(conversationId)) {
    return "";
  }

  try {
    const conversation = await findConversation(conversationId);
    const messageCount = await countMessages(conversationId);
    const hasSummary = Boolean(conversation && conversation.summary);
    const messagesSinceSummary = hasSummary
      ? await countAfter(conversationId, conversation.summary_updated_at)
      : messageCount;

    if (
      !shouldRefreshSummary({
        messageCount,
        messagesSinceSummary,
        hasSummary,
      })
    ) {
      return hasSummary ? conversation.summary : "";
    }

    const window = Math.max(SUMMARY_SOURCE_LIMIT, MEMORY_RECENT_LIMIT + 4);
    const rows = await listMessages(conversationId, window);
    const olderMessages = Array.isArray(rows)
      ? rows.slice(0, Math.max(0, rows.length - MEMORY_RECENT_LIMIT))
      : [];

    if (currentMessage) {
      olderMessages.push({
        sender_type: "customer",
        message: currentMessage,
      });
    }
    if (assistantReply) {
      olderMessages.push({
        sender_type: "assistant",
        message: assistantReply,
      });
    }

    const summary = await summarizeFn({
      existingSummary: hasSummary ? conversation.summary : "",
      olderMessages,
    });

    if (!summary) {
      return hasSummary ? conversation.summary : "";
    }

    await saveSummary(conversationId, summary);
    logger.info("Conversation summary updated", {
      conversationId,
      messageCount,
    });
    return summary;
  } catch (_error) {
    logger.error("Conversation memory refresh failed");
    return "";
  }
}

module.exports = {
  MAX_SUMMARY_CHARS,
  MEMORY_RECENT_LIMIT,
  SUMMARY_AFTER_MESSAGES,
  SUMMARY_REFRESH_AFTER,
  formatTranscript,
  formatConversationMemory,
  seedSummaryFromMessages,
  shouldRefreshSummary,
  compactFallbackSummary,
  summarizeConversation,
  loadConversationSummary,
  maybeRefreshConversationMemory,
};
