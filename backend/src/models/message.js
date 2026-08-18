const { pool, isUniqueViolation } = require("../config/db");

async function create({
  conversationId,
  whatsappMessageId = null,
  senderType,
  message,
  messageType = "text",
}) {
  const result = await pool.query(
    `
      INSERT INTO messages (
        conversation_id,
        whatsapp_message_id,
        sender_type,
        message,
        message_type
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        conversation_id,
        whatsapp_message_id,
        sender_type,
        message,
        message_type,
        created_at
    `,
    [conversationId, whatsappMessageId, senderType, message, messageType]
  );

  return result.rows[0];
}

async function listByConversationId(conversationId) {
  const result = await pool.query(
    `
      SELECT
        id,
        conversation_id,
        whatsapp_message_id,
        sender_type,
        message,
        message_type,
        created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [conversationId]
  );

  return result.rows;
}

async function listRecentByConversationId(conversationId, limit = 20) {
  const result = await pool.query(
    `
      SELECT
        id,
        conversation_id,
        whatsapp_message_id,
        sender_type,
        message,
        message_type,
        created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [conversationId, limit]
  );

  return result.rows.reverse();
}

async function findByWhatsappMessageId(whatsappMessageId) {
  if (!whatsappMessageId) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT
        id,
        conversation_id,
        whatsapp_message_id,
        sender_type,
        message,
        message_type,
        created_at
      FROM messages
      WHERE whatsapp_message_id = $1
    `,
    [whatsappMessageId]
  );

  return result.rows[0] || null;
}

async function createIfNew(input) {
  try {
    return await create(input);
  } catch (error) {
    if (!isUniqueViolation(error) || !input.whatsappMessageId) {
      throw error;
    }

    return findByWhatsappMessageId(input.whatsappMessageId);
  }
}

module.exports = {
  create,
  createIfNew,
  findByWhatsappMessageId,
  listByConversationId,
  listRecentByConversationId,
};
