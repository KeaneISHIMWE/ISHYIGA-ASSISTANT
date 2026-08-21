const { logger } = require("../utils/logger");
const { generateReply, FALLBACK_REPLY } = require("../services/openaiService");
const { matchSpecialContactReply } = require("../services/contactRules");
const {
  persistInboundEvent,
  persistOutboundReply,
  loadRecentHistory,
} = require("../services/conversationService");
const {
  verifyWebhook,
  isValidSignature,
  processIncomingMessage,
  sendTextMessage,
  markReadAndShowTyping,
  downloadWhatsAppMedia,
  logProcessedEvents,
  maskPhoneNumber,
  getVerifyToken,
  getAppSecret,
} = require("../services/whatsappService");

const TYPING_MIN_VISIBLE_MS = 2_000;
const IMAGE_UNREADABLE_REPLY =
  "I received your screenshot, but I could not open it. Please send it again, or describe the error you see.";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForTypingWindow(startedAt, minMs, nowFn, sleepFn) {
  const remaining = minMs - (nowFn() - startedAt);
  if (remaining > 0) {
    await sleepFn(remaining);
  }
}

async function generateRepliesForInboundEvents(
  events,
  generateReplyFn = generateReply
) {
  const replies = [];

  for (const event of events) {
    if (!event || event.kind !== "text" || !event.message) {
      continue;
    }

    try {
      const result = await generateReplyFn({ message: event.message });
      logger.info("Groq reply generated", {
        ok: result.ok,
        error: result.error || null,
      });
      replies.push({
        messageId: event.messageId,
        customerNumber: event.customerNumber,
        ok: result.ok,
        reply: result.reply,
        error: result.error || null,
      });
    } catch (_error) {
      logger.error("Groq request failed", { reason: "unhandled" });
      replies.push({
        messageId: event.messageId,
        customerNumber: event.customerNumber,
        ok: false,
        reply: FALLBACK_REPLY,
        error: "unhandled",
      });
    }
  }

  return replies;
}

async function sendGeneratedReplies(
  replies,
  sendTextMessageFn = sendTextMessage
) {
  const results = [];

  for (const item of replies) {
    if (!item || !item.customerNumber || !item.reply) {
      continue;
    }

    try {
      const sent = await sendTextMessageFn({
        to: item.customerNumber,
        body: item.reply,
      });
      logger.info("WhatsApp reply sent", {
        messageId: item.messageId,
        ok: sent.ok,
        error: sent.error || null,
        customer: maskPhoneNumber(item.customerNumber),
      });
      results.push({
        messageId: item.messageId,
        ok: sent.ok,
        outboundId: sent.outboundId || null,
        error: sent.error || null,
      });
    } catch (_error) {
      logger.error("WhatsApp send failed", { reason: "unhandled" });
      results.push({
        messageId: item.messageId,
        ok: false,
        outboundId: null,
        error: "unhandled",
      });
    }
  }

  return results;
}

async function processTextEvents(
  events,
  {
    persistInbound = persistInboundEvent,
    loadHistory = loadRecentHistory,
    generateReplyFn = generateReply,
    sendTextMessageFn = sendTextMessage,
    markReadAndShowTypingFn = markReadAndShowTyping,
    downloadMediaFn = downloadWhatsAppMedia,
    persistOutbound = persistOutboundReply,
    typingMinVisibleMs = TYPING_MIN_VISIBLE_MS,
    nowFn = Date.now,
    sleepFn = sleep,
  } = {}
) {
  const results = [];

  for (const event of events) {
    if (
      !event ||
      (event.kind !== "text" && event.kind !== "image") ||
      !event.message
    ) {
      continue;
    }

    const typingStartedAt = nowFn();

    try {
      await markReadAndShowTypingFn({ messageId: event.messageId });
    } catch (_error) {
      logger.error("WhatsApp read/typing failed", { reason: "unhandled" });
    }

    const inbound = await persistInbound(event);

    if (inbound.duplicate) {
      logger.info("Duplicate WhatsApp message skipped", {
        messageId: event.messageId,
        customer: maskPhoneNumber(event.customerNumber),
      });
      results.push({
        messageId: event.messageId,
        conversationId: inbound.conversationId || null,
        persistedInbound: true,
        reply: null,
        sent: false,
        skipped: "duplicate",
      });
      continue;
    }

    let history = [];
    if (inbound.ok && inbound.conversationId) {
      try {
        history = await loadHistory(inbound.conversationId, {
          excludeWhatsappMessageId: event.messageId,
        });
      } catch (_error) {
        logger.error("History load failed");
        history = [];
      }
    }

    let generated;
    const specialReply = matchSpecialContactReply({
      customerNumber: event.customerNumber,
      message: event.message,
    });

    try {
      if (specialReply) {
        generated = { ok: true, reply: specialReply, error: null };
      } else {
        let image = null;
        if (event.kind === "image") {
          const media = await downloadMediaFn({ mediaId: event.mediaId });
          if (!media || !media.ok || !media.dataUrl) {
            generated = {
              ok: false,
              reply: IMAGE_UNREADABLE_REPLY,
              error: (media && media.error) || "media_failed",
            };
          } else {
            image = { dataUrl: media.dataUrl };
          }
        }

        if (!generated) {
          generated = await generateReplyFn({
            message: event.message,
            history,
            image,
          });
        }
      }
    } catch (_error) {
      logger.error("Groq request failed", { reason: "unhandled" });
      generated = {
        ok: false,
        reply: FALLBACK_REPLY,
        error: "unhandled",
      };
    }

    logger.info("Groq reply generated", {
      ok: generated.ok,
      error: generated.error || null,
    });

    await waitForTypingWindow(typingStartedAt, typingMinVisibleMs, nowFn, sleepFn);

    let sent;
    try {
      sent = await sendTextMessageFn({
        to: event.customerNumber,
        body: generated.reply,
      });
    } catch (_error) {
      logger.error("WhatsApp send failed", { reason: "unhandled" });
      sent = { ok: false, outboundId: null, error: "unhandled" };
    }

    logger.info("WhatsApp reply sent", {
      messageId: event.messageId,
      ok: sent.ok,
      error: sent.error || null,
      customer: maskPhoneNumber(event.customerNumber),
    });

    if (inbound.ok && inbound.conversationId && generated.reply && sent.ok) {
      await persistOutbound({
        conversationId: inbound.conversationId,
        reply: generated.reply,
        outboundId: sent.outboundId || null,
      });
    }

    results.push({
      messageId: event.messageId,
      conversationId: inbound.conversationId || null,
      persistedInbound: inbound.ok,
      reply: generated.reply,
      sent: sent.ok,
    });
  }

  return results;
}

function verify(req, res) {
  const result = verifyWebhook(
    {
      mode: req.query["hub.mode"],
      token: req.query["hub.verify_token"],
      challenge: req.query["hub.challenge"],
    },
    getVerifyToken()
  );

  if (!result.ok) {
    logger.warn("WhatsApp webhook verification failed");
    return res.status(result.statusCode).send("Forbidden");
  }

  logger.info("WhatsApp webhook verified");
  return res.status(200).type("text/plain").send(result.challenge);
}

async function receive(req, res) {
  logger.info("Incoming webhook received", {
    path: req.originalUrl,
  });

  const signature = isValidSignature(
    req.rawBody || Buffer.from(""),
    req.get("x-hub-signature-256"),
    getAppSecret()
  );

  if (signature.checked && !signature.valid) {
    logger.warn("WhatsApp webhook signature rejected");
    return res.status(403).json({ error: "Invalid signature" });
  }

  const result = processIncomingMessage(req.body);

  if (!result.ok) {
    logger.warn("WhatsApp webhook payload rejected", {
      error: result.error,
    });
    return res.status(result.statusCode).json({ error: result.error });
  }

  logProcessedEvents(result.events);
  res.status(200).json({ status: "received" });
  await processTextEvents(result.events);
}

module.exports = {
  verify,
  receive,
  generateRepliesForInboundEvents,
  sendGeneratedReplies,
  processTextEvents,
  TYPING_MIN_VISIBLE_MS,
  IMAGE_UNREADABLE_REPLY,
};
