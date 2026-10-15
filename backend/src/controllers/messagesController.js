const { randomUUID } = require("node:crypto");
const { env } = require("../config/env");
const { generateReply } = require("../services/openaiService");
const { loadClientPromptContext } = require("../services/clientProfileService");
const { applyPhoneRegistration } = require("../services/phoneRegistrationTicket");
const { toCanonicalWhatsappDigits } = require("../services/contactRules");
const {
  persistInboundEvent,
  persistOutboundReply,
  loadRecentHistory,
} = require("../services/conversationService");
const {
  loadConversationSummary,
  maybeRefreshConversationMemory,
} = require("../services/conversationMemoryService");
const { logger } = require("../utils/logger");

function describeMessageApi(_req, res) {
  return res.status(405).json({
    error: "Use POST /api/messages with a JSON body",
    example: {
      message: "Hello, what services do you offer?",
      phone: "250792431896",
    },
  });
}

function toLines(history, message, reply) {
  const lines = (Array.isArray(history) ? history : []).map((item) => ({
    from: item.role === "assistant" ? "Assistant" : "Client",
    text: item.content,
  }));

  lines.push({ from: "Client", text: message });
  if (reply) {
    lines.push({ from: "Assistant", text: reply });
  }

  return lines;
}

async function createMessage(
  req,
  res,
  {
    persistInbound = persistInboundEvent,
    loadHistory = loadRecentHistory,
    loadConversationSummaryFn = loadConversationSummary,
    refreshConversationMemoryFn = maybeRefreshConversationMemory,
    generateReplyFn = generateReply,
    persistOutbound = persistOutboundReply,
    loadClientProfileFn = loadClientPromptContext,
    applyPhoneRegistrationFn = applyPhoneRegistration,
  } = {}
) {
  const message = req.body && req.body.message;
  const phone = toCanonicalWhatsappDigits(
    (req.body && (req.body.phone || req.body.whatsappNumber)) || ""
  );
  const customerName =
    req.body && typeof req.body.name === "string" ? req.body.name.trim() : "";

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  if (!env.openaiApiKey && generateReplyFn === generateReply) {
    return res.status(503).json({ error: "OpenAI is not configured" });
  }

  const trimmedMessage = message.trim();
  const inboundId = `api.${randomUUID()}`;
  let conversationId = null;
  let history = [];
  let conversationSummary = "";
  let clientContext = "";
  let generated = null;

  if (phone) {
    const inbound = await persistInbound({
      kind: "text",
      customerNumber: phone,
      customerName: customerName || null,
      messageId: inboundId,
      message: trimmedMessage,
      messageType: "text",
    });

    if (inbound.ok && inbound.conversationId) {
      conversationId = inbound.conversationId;
      try {
        history = await loadHistory(conversationId, {
          excludeWhatsappMessageId: inboundId,
        });
      } catch (_error) {
        logger.error("History load failed");
        history = [];
      }

      try {
        conversationSummary = await loadConversationSummaryFn(conversationId);
      } catch (_error) {
        logger.error("Conversation summary load failed");
        conversationSummary = "";
      }
    }

    let lookup = null;
    try {
      lookup = await loadClientProfileFn({
        phoneNumber: phone,
        message: trimmedMessage,
        history,
      });
    } catch (_error) {
      logger.error("Client profile lookup failed", { reason: "api_message" });
    }

    try {
      const registration = await applyPhoneRegistrationFn({
        lookup,
        message: trimmedMessage,
        history,
        phone,
        customerName,
        conversationId,
      });
      clientContext = registration.clientContext || "";
      if (registration.reply) {
        generated = {
          ok: registration.ok !== false,
          reply: registration.reply,
        };
      }
    } catch (_error) {
      logger.error("Registration ticket check failed", { reason: "api_message" });
      clientContext =
        lookup && lookup.clientContext ? lookup.clientContext : "";
    }
  }

  if (!generated) {
    generated = await generateReplyFn({
      message: trimmedMessage,
      history,
      clientContext,
      conversationSummary,
    });
  }

  if (conversationId && generated.reply) {
    await persistOutbound({
      conversationId,
      reply: generated.reply,
    });
    try {
      await refreshConversationMemoryFn({
        conversationId,
        recentHistory: history,
        currentMessage: trimmedMessage,
        assistantReply: generated.reply,
      });
    } catch (_error) {
      logger.error("Conversation memory refresh failed");
    }
  }

  return res.status(200).json({
    ok: generated.ok,
    reply: generated.reply,
    conversationId,
    lines: toLines(history, trimmedMessage, generated.reply),
  });
}

module.exports = { createMessage, describeMessageApi, toLines };
