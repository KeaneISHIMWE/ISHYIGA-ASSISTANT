const { randomUUID } = require("node:crypto");
const { env } = require("../config/env");
const { generateReply } = require("../services/openaiService");
const { loadClientPromptContext } = require("../services/clientProfileService");
const { toCanonicalWhatsappDigits } = require("../services/contactRules");
const {
  persistInboundEvent,
  persistOutboundReply,
  loadRecentHistory,
} = require("../services/conversationService");
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
    generateReplyFn = generateReply,
    persistOutbound = persistOutboundReply,
    loadClientProfileFn = loadClientPromptContext,
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

  if (!env.groqApiKey && generateReplyFn === generateReply) {
    return res.status(503).json({ error: "Groq is not configured" });
  }

  const trimmedMessage = message.trim();
  const inboundId = `api.${randomUUID()}`;
  let conversationId = null;
  let history = [];
  let clientContext = "";

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
    }

    try {
      const lookup = await loadClientProfileFn({ phoneNumber: phone });
      clientContext =
        lookup && lookup.clientContext ? lookup.clientContext : "";
    } catch (_error) {
      logger.error("Client profile lookup failed", { reason: "api_message" });
    }
  }

  const generated = await generateReplyFn({
    message: trimmedMessage,
    history,
    clientContext,
  });

  if (conversationId && generated.reply) {
    await persistOutbound({
      conversationId,
      reply: generated.reply,
    });
  }

  return res.status(200).json({
    ok: generated.ok,
    reply: generated.reply,
    conversationId,
    lines: toLines(history, trimmedMessage, generated.reply),
  });
}

module.exports = { createMessage, describeMessageApi, toLines };
