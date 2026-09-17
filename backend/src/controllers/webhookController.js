const { logger } = require("../utils/logger");
const {
  generateReply,
  FALLBACK_REPLY,
  ESCALATION_REPLY,
  resolveCustomerFacingFailure,
} = require("../services/openaiService");
const {
  classifyIntent,
  conversationalFallback,
  isConversationalIntent,
} = require("../services/intentService");
const { createTicket } = require("../services/ticketService");
const {
  escalateToSupport,
  formatOpenTicketContext,
  isAgentNumber,
  resolveByAgent,
  shouldEscalate,
} = require("../services/escalationService");
const { loadClientPromptContext } = require("../services/clientProfileService");
const escalationModel = require("../models/escalation");
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
      logger.info("OpenAI reply generated", {
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
      logger.error("OpenAI request failed", { reason: "unhandled" });
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
    loadClientProfileFn = loadClientPromptContext,
    createTicketFn = createTicket,
    escalateFn = escalateToSupport,
    resolveByAgentFn = resolveByAgent,
    findOpenEscalationFn = escalationModel.findLatestOpenByCustomer,
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

    if (isAgentNumber(event.customerNumber) && event.kind === "text") {
      const agentResult = await resolveByAgentFn({
        message: event.message,
      });

      if (agentResult.handled) {
        const agentReply =
          agentResult.agentReply ||
          "I could not match that to an open support request.";
        let sent = { ok: false };
        try {
          sent = await sendTextMessageFn({
            to: event.customerNumber,
            body: agentReply,
          });
        } catch (_error) {
          logger.error("WhatsApp send failed", { reason: "unhandled" });
        }

        if (
          agentResult.ok &&
          agentResult.customerNumber &&
          agentResult.customerReply
        ) {
          try {
            await sendTextMessageFn({
              to: agentResult.customerNumber,
              body: agentResult.customerReply,
            });
          } catch (_error) {
            logger.error("Customer resolution notify failed", {
              reason: "unhandled",
            });
          }
        }

        results.push({
          messageId: event.messageId,
          conversationId: null,
          persistedInbound: false,
          reply: agentReply,
          sent: sent.ok,
          skipped: "support_agent",
        });
        continue;
      }
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
    let clientContext = "";

    try {
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
        try {
          const clientLookup = await loadClientProfileFn({
            phoneNumber: event.customerNumber,
          });
          clientContext =
            clientLookup && clientLookup.clientContext
              ? clientLookup.clientContext
              : "";
          try {
            const open = await findOpenEscalationFn(event.customerNumber);
            const openContext = formatOpenTicketContext(open);
            if (openContext) {
              clientContext = clientContext
                ? `${clientContext}\n\n${openContext}`
                : openContext;
            }
          } catch (_error) {
            logger.error("Open escalation lookup failed", { reason: "unhandled" });
          }
        } catch (_error) {
          logger.error("Client profile lookup failed", {
            reason: "unhandled",
          });
        }

        generated = await generateReplyFn({
          message: event.message,
          history,
          image,
          clientContext,
        });
      }
    } catch (_error) {
      logger.error("OpenAI request failed", { reason: "unhandled" });
      generated = {
        ok: false,
        reply: FALLBACK_REPLY,
        error: "unhandled",
      };
    }


    if (!generated.ok && generated.reply === FALLBACK_REPLY) {
      generated = {
        ...generated,
        reply: resolveCustomerFacingFailure({
          message: event.message,
          history,
          hasImage: event.kind === "image",
          reply: generated.reply,
          clientContext,
        }),
      };
    }

    const intent = classifyIntent(event.message);
    const supportRequired = shouldEscalate({
      generated,
      clientContext,
      message: event.message,
    });

    if (event.kind === "text" && isConversationalIntent(intent)) {
      generated = {
        ...generated,
        escalationRequest: null,
      };
      if (
        !generated.ok ||
        !generated.reply ||
        generated.reply === ESCALATION_REPLY ||
        generated.reply === FALLBACK_REPLY
      ) {
        generated = {
          ...generated,
          reply: conversationalFallback(event.message) || generated.reply,
        };
      }
    }

    let escalated = null;
    if (supportRequired) {
      const request = generated.escalationRequest || {};
      try {
        escalated = await escalateFn({
          conversationId: inbound.conversationId,
          customerNumber: event.customerNumber,
          message: event.message,
          clientContext,
          reason:
            request.reason ||
            (generated.reply === ESCALATION_REPLY
              ? "ai_escalation"
              : undefined),
          summary: request.summary,
          why: request.why,
          tried: request.tried,
          priority: request.priority,
          createTicketFn,
        });

        if (escalated && escalated.ok && escalated.customerReply) {
          generated = {
            ...generated,
            reply: escalated.customerReply,
          };
        } else if (
          escalated &&
          !escalated.ok &&
          escalated.customerReply &&
          (!generated.ok || !generated.reply || generated.reply === ESCALATION_REPLY)
        ) {
          generated = {
            ...generated,
            reply: escalated.customerReply,
          };
        }
      } catch (ticketError) {
        logger.error("Escalation threw unexpectedly", {
          error:
            ticketError && ticketError.message
              ? String(ticketError.message).slice(0, 120)
              : "unknown",
        });
      }
    }

    logger.info("Conversation route decided", {
      messageId: event.messageId,
      customer: maskPhoneNumber(event.customerNumber),
      conversationId: inbound.conversationId || null,
      message: String(event.message || "").slice(0, 160),
      detectedIntent: intent,
      conversationState: "open",
      supportRequired,
      supportAgentId:
        (escalated && (escalated.agentId || escalated.agentName)) || null,
      toolCalled: Boolean(generated.escalationRequest),
      toolResult:
        escalated && escalated.ok
          ? "ok"
          : escalated && escalated.error
            ? String(escalated.error).slice(0, 80)
            : null,
      finalResponse: generated.reply
        ? String(generated.reply).slice(0, 160)
        : null,
    });

    logger.info("OpenAI reply generated", {
      ok: generated.ok,
      error: generated.error || null,
      intent,
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
  ESCALATION_REPLY,
};
