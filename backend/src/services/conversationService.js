const { logger } = require("../utils/logger");
const { maskPhoneNumber } = require("./whatsappService");
const { isUniqueViolation } = require("../config/db");
const { toCanonicalWhatsappDigits } = require("./contactRules");
const customerModel = require("../models/customer");
const conversationModel = require("../models/conversation");
const messageModel = require("../models/message");

const HISTORY_LOAD_LIMIT = 40;
const CONVERSATION_IDLE_MS = 12 * 60 * 60 * 1000;

function isConversationIdle(
  conversation,
  now = Date.now(),
  idleMs = CONVERSATION_IDLE_MS
) {
  if (!conversation) {
    return false;
  }

  const last =
    conversation.last_activity_at ||
    conversation.updated_at ||
    conversation.created_at;
  if (!last) {
    return false;
  }

  const at = last instanceof Date ? last.getTime() : Date.parse(last);
  if (Number.isNaN(at)) {
    return false;
  }

  return now - at >= idleMs;
}

async function findOrCreateActiveConversation(
  { customerId },
  {
    findOpenByCustomerId = conversationModel.findOpenByCustomerId,
    findLatestByCustomerId = conversationModel.findLatestByCustomerId,
    reopenConversation = conversationModel.reopen,
    findOrCreateOpen = conversationModel.findOrCreateOpen,
  } = {}
) {
  const existing = await findOpenByCustomerId(customerId);
  if (existing) {
    return existing;
  }

  const latest = findLatestByCustomerId
    ? await findLatestByCustomerId(customerId)
    : null;
  if (latest && latest.status === "closed") {
    try {
      const reopened = await reopenConversation(latest.id);
      if (reopened) {
        return reopened;
      }
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const open = await findOpenByCustomerId(customerId);
      if (open) {
        return open;
      }
    }
  }

  return findOrCreateOpen({ customerId });
}

function toChatHistory(messages, { excludeWhatsappMessageId } = {}) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((row) => {
      if (!row || typeof row.message !== "string" || !row.message.trim()) {
        return false;
      }

      if (
        excludeWhatsappMessageId &&
        row.whatsapp_message_id === excludeWhatsappMessageId
      ) {
        return false;
      }

      return row.sender_type === "customer" || row.sender_type === "assistant";
    })
    .map((row) => ({
      role: row.sender_type === "customer" ? "user" : "assistant",
      content: row.message.trim(),
    }));
}

async function loadRecentHistory(
  conversationId,
  {
    excludeWhatsappMessageId,
    limit = HISTORY_LOAD_LIMIT,
    listMessages = messageModel.listRecentByConversationId,
  } = {}
) {
  if (!conversationId) {
    return [];
  }

  try {
    const rows = await listMessages(conversationId, limit);
    return toChatHistory(rows, { excludeWhatsappMessageId });
  } catch (_error) {
    logger.error("History load failed");
    return [];
  }
}

async function persistInboundEvent(
  event,
  {
    findOrCreateCustomer = customerModel.findOrCreate,
    findOrCreateOpenConversation = findOrCreateActiveConversation,
    createMessage = messageModel.createIfNew,
    touchConversation = conversationModel.touch,
  } = {}
) {
  if (
    !event ||
    (event.kind !== "text" && event.kind !== "image") ||
    !event.customerNumber ||
    !event.message
  ) {
    return { ok: false, error: "invalid_event" };
  }

  try {
    const customer = await findOrCreateCustomer({
      whatsappNumber:
        toCanonicalWhatsappDigits(event.customerNumber) ||
        event.customerNumber,
      name: event.customerName || null,
    });

    if (!customer || !customer.id) {
      throw new Error("Customer was not saved");
    }

    const conversation = await findOrCreateOpenConversation({
      customerId: customer.id,
    });

    if (!conversation || !conversation.id) {
      throw new Error("Conversation was not saved");
    }

    const inbound = await createMessage({
      conversationId: conversation.id,
      whatsappMessageId: event.messageId || null,
      senderType: "customer",
      message: event.message,
      messageType: event.messageType || "text",
    });

    try {
      await touchConversation(conversation.id);
    } catch (_error) {
      logger.error("Conversation activity update failed");
    }

    logger.info("Inbound message persisted", {
      customer: maskPhoneNumber(event.customerNumber),
      hasConversation: true,
      hasMessage: Boolean(inbound && inbound.id),
    });

    return {
      ok: true,
      duplicate: inbound ? inbound.created === false : false,
      customerId: customer.id,
      conversationId: conversation.id,
      messageId: inbound && inbound.id ? inbound.id : null,
    };
  } catch (error) {
    logger.error("Inbound persist failed", {
      customer: maskPhoneNumber(event.customerNumber),
    });
    return { ok: false, error: "persist_failed" };
  }
}

async function persistOutboundReply(
  { conversationId, reply, outboundId = null },
  {
    createMessage = messageModel.createIfNew,
    touchConversation = conversationModel.touch,
  } = {}
) {
  if (!conversationId || typeof reply !== "string" || !reply.trim()) {
    return { ok: false, error: "invalid_reply" };
  }

  try {
    const outbound = await createMessage({
      conversationId,
      whatsappMessageId: outboundId || null,
      senderType: "assistant",
      message: reply.trim(),
      messageType: "text",
    });

    try {
      await touchConversation(conversationId);
    } catch (_error) {
      logger.error("Conversation activity update failed");
    }

    logger.info("Outbound message persisted", {
      hasMessage: Boolean(outbound && outbound.id),
    });

    return {
      ok: true,
      messageId: outbound && outbound.id ? outbound.id : null,
    };
  } catch (_error) {
    logger.error("Outbound persist failed");
    return { ok: false, error: "persist_failed" };
  }
}

module.exports = {
  persistInboundEvent,
  persistOutboundReply,
  loadRecentHistory,
  toChatHistory,
  findOrCreateActiveConversation,
  isConversationIdle,
  HISTORY_LOAD_LIMIT,
  CONVERSATION_IDLE_MS,
};
