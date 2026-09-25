const { pool, isUniqueViolation } = require("../config/db");

const CONVERSATION_COLUMNS = `
  id,
  customer_id,
  status,
  summary,
  summary_updated_at,
  last_activity_at,
  created_at,
  updated_at
`;

async function findById(conversationId) {
  if (!conversationId) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT ${CONVERSATION_COLUMNS}
      FROM conversations
      WHERE id = $1
    `,
    [conversationId]
  );

  return result.rows[0] || null;
}

async function findOpenByCustomerId(customerId) {
  const result = await pool.query(
    `
      SELECT ${CONVERSATION_COLUMNS}
      FROM conversations
      WHERE customer_id = $1 AND status = 'open'
    `,
    [customerId]
  );

  return result.rows[0] || null;
}

async function findLatestByCustomerId(customerId) {
  if (!customerId) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT ${CONVERSATION_COLUMNS}
      FROM conversations
      WHERE customer_id = $1
      ORDER BY COALESCE(last_activity_at, updated_at, created_at) DESC,
               created_at DESC
      LIMIT 1
    `,
    [customerId]
  );

  return result.rows[0] || null;
}

async function reopen(conversationId) {
  if (!conversationId) {
    return null;
  }

  const result = await pool.query(
    `
      UPDATE conversations
      SET status = 'open',
          last_activity_at = NOW()
      WHERE id = $1
      RETURNING ${CONVERSATION_COLUMNS}
    `,
    [conversationId]
  );

  return result.rows[0] || null;
}

async function create({ customerId, status = "open", summary = null }) {
  const result = await pool.query(
    `
      INSERT INTO conversations (
        customer_id,
        status,
        summary,
        summary_updated_at,
        last_activity_at
      )
      VALUES (
        $1,
        $2,
        $3,
        CASE WHEN $3 IS NOT NULL AND BTRIM($3) <> '' THEN NOW() ELSE NULL END,
        NOW()
      )
      RETURNING ${CONVERSATION_COLUMNS}
    `,
    [customerId, status, summary]
  );

  return result.rows[0];
}

async function close(conversationId) {
  if (!conversationId) {
    return null;
  }

  const result = await pool.query(
    `
      UPDATE conversations
      SET status = 'closed'
      WHERE id = $1 AND status = 'open'
      RETURNING ${CONVERSATION_COLUMNS}
    `,
    [conversationId]
  );

  return result.rows[0] || null;
}

async function touch(conversationId) {
  if (!conversationId) {
    return null;
  }

  const result = await pool.query(
    `
      UPDATE conversations
      SET last_activity_at = NOW()
      WHERE id = $1
      RETURNING ${CONVERSATION_COLUMNS}
    `,
    [conversationId]
  );

  return result.rows[0] || null;
}

async function updateSummary(conversationId, summary) {
  if (!conversationId) {
    return null;
  }

  const result = await pool.query(
    `
      UPDATE conversations
      SET summary = $2,
          summary_updated_at = NOW(),
          last_activity_at = NOW()
      WHERE id = $1
      RETURNING ${CONVERSATION_COLUMNS}
    `,
    [conversationId, summary]
  );

  return result.rows[0] || null;
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

async function findLatestByPhoneDigits(phoneDigitsList) {
  if (!Array.isArray(phoneDigitsList) || phoneDigitsList.length === 0) {
    return null;
  }

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
      LEFT JOIN LATERAL (
        SELECT created_at
        FROM messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) last ON true
      WHERE regexp_replace(cu.whatsapp_number, '\\D', '', 'g') = ANY($1::text[])
      ORDER BY COALESCE(last.created_at, c.updated_at) DESC, c.created_at DESC
      LIMIT 1
    `,
    [phoneDigitsList]
  );

  return result.rows[0] || null;
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
  findById,
  findOpenByCustomerId,
  findLatestByCustomerId,
  reopen,
  create,
  close,
  touch,
  updateSummary,
  findOrCreateOpen,
  listSummaries,
  findLatestByPhoneDigits,
  findByIdWithCustomer,
  getStats,
};
