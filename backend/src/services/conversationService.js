const { logger } = require("../utils/logger");
const { maskPhoneNumber } = require("./whatsappService");
const customerModel = require("../models/customer");
const conversationModel = require("../models/conversation");
const messageModel = require("../models/message");

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
    listMessages = messageModel.listByConversationId,
  } = {}
) {
  if (!conversationId) {
    return [];
  }

  try {
    const rows = await listMessages(conversationId);
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
    findOrCreateOpenConversation = conversationModel.findOrCreateOpen,
    createMessage = messageModel.createIfNew,
  } = {}
) {
  if (!event || event.kind !== "text" || !event.customerNumber || !event.message) {
    return { ok: false, error: "invalid_event" };
  }

  try {
    const customer = await findOrCreateCustomer({
      whatsappNumber: event.customerNumber,
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

    logger.info("Inbound message persisted", {
      customer: maskPhoneNumber(event.customerNumber),
      hasConversation: true,
      hasMessage: Boolean(inbound && inbound.id),
    });

    return {
      ok: true,
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
  { createMessage = messageModel.createIfNew } = {}
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
};
