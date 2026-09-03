function toIso(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function senderLabel(senderType) {
  if (senderType === "customer") {
    return "Client";
  }

  if (senderType === "assistant") {
    return "Assistant";
  }

  return "System";
}

function messagePath(senderType) {
  if (senderType === "customer") {
    return ["Client", "WhatsApp", "Server", "Database"];
  }

  if (senderType === "assistant") {
    return ["OpenAI", "Server", "WhatsApp", "Client"];
  }

  return ["Server"];
}

function toConversationSummary(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    customer: {
      id: row.customer_id,
      name: row.customer_name || null,
      whatsappNumber: row.whatsapp_number,
      createdAt: toIso(row.customer_created_at),
    },
    lastMessage: row.last_message || null,
    lastSender: row.last_sender || null,
    lastMessageType: row.last_message_type || null,
    lastMessageAt: toIso(row.last_message_at),
    counts: {
      messages: Number(row.message_count) || 0,
      inbound: Number(row.inbound_count) || 0,
      outbound: Number(row.outbound_count) || 0,
      images: Number(row.image_count) || 0,
    },
  };
}

function toMessage(row) {
  if (!row) {
    return null;
  }

  const sender = row.sender_type;
  const deliveredToWhatsApp =
    sender === "customer"
      ? true
      : sender === "assistant"
        ? Boolean(row.whatsapp_message_id)
        : false;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    whatsappMessageId: row.whatsapp_message_id || null,
    sender,
    senderLabel: senderLabel(sender),
    text: row.message,
    type: row.message_type,
    createdAt: toIso(row.created_at),
    deliveredToWhatsApp,
    path: messagePath(sender),
  };
}

function toConversationLine(row) {
  if (!row) {
    return null;
  }

  return {
    from: senderLabel(row.sender_type),
    text: row.message,
    at: toIso(row.created_at),
  };
}

function toStats(row) {
  if (!row) {
    return {
      customers: 0,
      conversations: 0,
      openConversations: 0,
      messages: 0,
      inbound: 0,
      outbound: 0,
      images: 0,
    };
  }

  return {
    customers: Number(row.customers) || 0,
    conversations: Number(row.conversations) || 0,
    openConversations: Number(row.open_conversations) || 0,
    messages: Number(row.messages) || 0,
    inbound: Number(row.inbound) || 0,
    outbound: Number(row.outbound) || 0,
    images: Number(row.images) || 0,
  };
}

function toConversationDetail(row, messages, clientProfile) {
  const summary = toConversationSummary({
    ...row,
    last_message: null,
    last_sender: null,
    last_message_type: null,
    last_message_at: null,
    message_count: messages.length,
    inbound_count: messages.filter((item) => item.sender_type === "customer").length,
    outbound_count: messages.filter((item) => item.sender_type === "assistant").length,
    image_count: messages.filter((item) => item.message_type === "image").length,
  });

  return {
    ...summary,
    clientProfile: clientProfile || null,
    messages: messages.map(toMessage),
    lines: messages.map(toConversationLine),
  };
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "") || null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

module.exports = {
  toIso,
  toConversationSummary,
  toConversationDetail,
  toMessage,
  toConversationLine,
  toStats,
  digitsOnly,
  isUuid,
};
