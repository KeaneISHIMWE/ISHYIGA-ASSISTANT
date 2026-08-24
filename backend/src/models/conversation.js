const { pool, isUniqueViolation } = require("../config/db");

async function findOpenByCustomerId(customerId) {
  const result = await pool.query(
    `
      SELECT id, customer_id, status, created_at, updated_at
      FROM conversations
      WHERE customer_id = $1 AND status = 'open'
    `,
    [customerId]
  );

  return result.rows[0] || null;
}

async function create({ customerId, status = "open" }) {
  const result = await pool.query(
    `
      INSERT INTO conversations (customer_id, status)
      VALUES ($1, $2)
      RETURNING id, customer_id, status, created_at, updated_at
    `,
    [customerId, status]
  );

  return result.rows[0];
}

async function findOrCreateOpen({ customerId }) {
  const existing = await findOpenByCustomerId(customerId);
  if (existing) {
    return existing;
  }

  try {
    return await create({ customerId, status: "open" });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    return findOpenByCustomerId(customerId);
  }
}

async function listSummaries({ phoneDigits = null } = {}) {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.status,
        c.created_at,
        c.updated_at,
        cu.id AS customer_id,
        cu.whatsapp_number,
        cu.name AS customer_name,
        cu.created_at AS customer_created_at,
        last.message AS last_message,
        last.sender_type AS last_sender,
        last.message_type AS last_message_type,
        last.created_at AS last_message_at,
        counts.message_count,
        counts.inbound_count,
        counts.outbound_count,
        counts.image_count
      FROM conversations c
      JOIN customers cu ON cu.id = c.customer_id
      LEFT JOIN LATERAL (
        SELECT message, sender_type, message_type, created_at
        FROM messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) last ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS message_count,
          COUNT(*) FILTER (WHERE sender_type = 'customer')::int AS inbound_count,
          COUNT(*) FILTER (WHERE sender_type = 'assistant')::int AS outbound_count,
          COUNT(*) FILTER (WHERE message_type = 'image')::int AS image_count
        FROM messages
        WHERE conversation_id = c.id
      ) counts ON true
      WHERE ($1::text IS NULL OR regexp_replace(cu.whatsapp_number, '\\D', '', 'g') = $1)
      ORDER BY COALESCE(last.created_at, c.updated_at) DESC, c.created_at DESC
    `,
    [phoneDigits]
  );

  return result.rows;
}

async function findByIdWithCustomer(conversationId) {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.status,
        c.created_at,
        c.updated_at,
        cu.id AS customer_id,
        cu.whatsapp_number,
        cu.name AS customer_name,
        cu.created_at AS customer_created_at
      FROM conversations c
      JOIN customers cu ON cu.id = c.customer_id
      WHERE c.id = $1
    `,
    [conversationId]
  );

  return result.rows[0] || null;
}

async function getStats() {
  const result = await pool.query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM customers) AS customers,
        (SELECT COUNT(*)::int FROM conversations) AS conversations,
        (SELECT COUNT(*)::int FROM conversations WHERE status = 'open') AS open_conversations,
        (SELECT COUNT(*)::int FROM messages) AS messages,
        (SELECT COUNT(*)::int FROM messages WHERE sender_type = 'customer') AS inbound,
        (SELECT COUNT(*)::int FROM messages WHERE sender_type = 'assistant') AS outbound,
        (SELECT COUNT(*)::int FROM messages WHERE message_type = 'image') AS images
    `
  );

  return result.rows[0];
}

module.exports = {
  findOpenByCustomerId,
  create,
  findOrCreateOpen,
  listSummaries,
  findByIdWithCustomer,
  getStats,
};
