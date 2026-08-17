const { pool } = require("../config/db");

const DEFAULT_HISTORY_LIMIT = 20;

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

async function listRecentByConversationId(
  conversationId,
  limit = DEFAULT_HISTORY_LIMIT
) {
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
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [conversationId, limit]
  );

  return result.rows.reverse();
}

module.exports = {
  create,
  listRecentByConversationId,
};
