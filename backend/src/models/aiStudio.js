const { pool } = require("../config/db");

async function latestOtp(customerId) {
  const result = await pool.query(
    `
      SELECT id, customer_id, otp_hash, expires_at, attempts, verified_at, created_at
      FROM ai_studio_otps
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [customerId]
  );
  return result.rows[0] || null;
}

async function insertOtp({ customerId, otpHash, expiresAt }) {
  const result = await pool.query(
    `
      INSERT INTO ai_studio_otps (customer_id, otp_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, expires_at, created_at
    `,
    [customerId, otpHash, expiresAt]
  );
  return result.rows[0];
}

async function incrementOtpAttempts(id) {
  await pool.query(
    `UPDATE ai_studio_otps SET attempts = attempts + 1 WHERE id = $1`,
    [id]
  );
}

async function markOtpVerified(id) {
  await pool.query(
    `UPDATE ai_studio_otps SET verified_at = NOW() WHERE id = $1 AND verified_at IS NULL`,
    [id]
  );
}

async function customerHasMessages(customerId) {
  const result = await pool.query(
    `
      SELECT 1
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.customer_id = $1
      LIMIT 1
    `,
    [customerId]
  );
  return result.rowCount > 0;
}

async function listConversations(customerId, { q = "", limit = 30, offset = 0 } = {}) {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.status,
        c.created_at,
        c.updated_at,
        c.last_activity_at,
        (
          SELECT m.message
          FROM messages m
          WHERE m.conversation_id = c.id AND m.sender_type = 'customer'
          ORDER BY m.created_at ASC
          LIMIT 1
        ) AS title,
        (
          SELECT COUNT(*)::int
          FROM messages m
          WHERE m.conversation_id = c.id AND m.sender_type = 'assistant'
        ) AS assistant_messages
      FROM conversations c
      WHERE c.customer_id = $1
        AND (
          $2 = ''
          OR EXISTS (
            SELECT 1 FROM messages m
            WHERE m.conversation_id = c.id
              AND m.message ILIKE '%' || $2 || '%'
          )
        )
      ORDER BY COALESCE(c.last_activity_at, c.updated_at) DESC
      LIMIT $3 OFFSET $4
    `,
    [customerId, q, limit, offset]
  );
  return result.rows;
}

async function conversationOwned(customerId, conversationId) {
  const result = await pool.query(
    `SELECT id FROM conversations WHERE id = $1 AND customer_id = $2`,
    [conversationId, customerId]
  );
  return result.rows[0] || null;
}

async function listMessages(customerId, conversationId) {
  const owned = await conversationOwned(customerId, conversationId);
  if (!owned) {
    return null;
  }
  const result = await pool.query(
    `
      SELECT id, conversation_id, sender_type, message, message_type, created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [conversationId]
  );
  return result.rows;
}

async function assistantMessageForCustomer(customerId, messageId) {
  const result = await pool.query(
    `
      SELECT m.id, m.conversation_id, m.sender_type, m.message, m.created_at, c.customer_id
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = $1 AND c.customer_id = $2
    `,
    [messageId, customerId]
  );
  return result.rows[0] || null;
}

async function previousCustomerQuestion(conversationId, before) {
  const result = await pool.query(
    `
      SELECT message
      FROM messages
      WHERE conversation_id = $1
        AND sender_type = 'customer'
        AND created_at <= $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [conversationId, before]
  );
  return result.rows[0] ? result.rows[0].message : "";
}

async function insertCorrection(row) {
  const result = await pool.query(
    `
      INSERT INTO ai_studio_corrections (
        customer_id, conversation_id, message_id,
        original_user_question, original_ai_response,
        original_correction, normalized_correction, explanation,
        source_language, status, personal
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING_REVIEW',$10)
      ON CONFLICT (customer_id, message_id) DO NOTHING
      RETURNING id, status, created_at
    `,
    [
      row.customerId,
      row.conversationId,
      row.messageId,
      row.question,
      row.response,
      row.correction,
      row.normalized,
      row.explanation,
      row.language,
      row.personal,
    ]
  );
  return result.rows[0] || null;
}

async function listCorrections(customerId) {
  const result = await pool.query(
    `
      SELECT id, message_id, original_user_question, original_ai_response,
             original_correction, normalized_correction, source_language,
             status, personal, created_at
      FROM ai_studio_corrections
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [customerId]
  );
  return result.rows;
}

async function insertMemory(row) {
  const result = await pool.query(
    `
      INSERT INTO ai_studio_memories (
        customer_id, memory_type, memory_content, source_message_id, source_correction_id, confidence
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, memory_type, memory_content, created_at, updated_at
    `,
    [
      row.customerId,
      row.memoryType,
      row.content,
      row.messageId,
      row.correctionId,
      row.confidence,
    ]
  );
  return result.rows[0];
}

async function listMemories(customerId) {
  const result = await pool.query(
    `
      SELECT id, memory_type, memory_content, confidence, created_at, updated_at
      FROM ai_studio_memories
      WHERE customer_id = $1
      ORDER BY updated_at DESC
      LIMIT 50
    `,
    [customerId]
  );
  return result.rows;
}

async function deleteMemory(customerId, memoryId) {
  const result = await pool.query(
    `DELETE FROM ai_studio_memories WHERE id = $1 AND customer_id = $2 RETURNING id`,
    [memoryId, customerId]
  );
  return result.rows[0] || null;
}

async function insertKnowledge(row) {
  const result = await pool.query(
    `
      INSERT INTO ai_studio_knowledge (
        title, description, category, original_content, normalized_content,
        source_correction_id, knowledge_scope, confidence, verification_status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING_REVIEW')
      RETURNING id, verification_status
    `,
    [
      row.title,
      row.description,
      row.category,
      row.original,
      row.normalized,
      row.correctionId,
      row.scope,
      row.confidence,
    ]
  );
  return result.rows[0];
}

async function searchApprovedKnowledge(question, limit = 3) {
  const term = String(question || "").trim().slice(0, 80);
  if (term.length < 3) {
    return [];
  }
  const result = await pool.query(
    `
      SELECT id, title, normalized_content, category, knowledge_scope
      FROM ai_studio_knowledge
      WHERE verification_status = 'APPROVED'
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (
          normalized_content ILIKE '%' || $1 || '%'
          OR title ILIKE '%' || $1 || '%'
          OR original_content ILIKE '%' || $1 || '%'
        )
      ORDER BY updated_at DESC
      LIMIT $2
    `,
    [term, limit]
  );
  return result.rows;
}

async function overview(customerId) {
  const result = await pool.query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM conversations WHERE customer_id = $1) AS conversations,
        (SELECT COUNT(*)::int FROM messages m JOIN conversations c ON c.id = m.conversation_id
          WHERE c.customer_id = $1 AND m.sender_type = 'assistant') AS ai_responses,
        (SELECT COUNT(*)::int FROM ai_studio_corrections WHERE customer_id = $1) AS corrections,
        (SELECT COUNT(*)::int FROM ai_studio_corrections WHERE customer_id = $1 AND status = 'APPROVED') AS approved,
        (SELECT COUNT(*)::int FROM ai_studio_corrections WHERE customer_id = $1 AND status = 'PENDING_REVIEW') AS pending
    `,
    [customerId]
  );
  return result.rows[0];
}

async function listPendingKnowledge() {
  const result = await pool.query(
    `
      SELECT id, title, description, category, original_content, normalized_content,
             confidence, verification_status, created_at
      FROM ai_studio_knowledge
      WHERE verification_status = 'PENDING_REVIEW'
      ORDER BY created_at ASC
      LIMIT 100
    `
  );
  return result.rows;
}

async function reviewKnowledge({ id, status, notes, reviewerId }) {
  const current = await pool.query(
    `SELECT id, verification_status FROM ai_studio_knowledge WHERE id = $1`,
    [id]
  );
  const row = current.rows[0];
  if (!row) {
    return null;
  }
  const updated = await pool.query(
    `
      UPDATE ai_studio_knowledge
      SET verification_status = $2
      WHERE id = $1
      RETURNING id, title, verification_status
    `,
    [id, status]
  );
  await pool.query(
    `
      INSERT INTO ai_studio_reviews (knowledge_id, reviewer_id, decision, review_notes)
      VALUES ($1, $2, $3, $4)
    `,
    [id, reviewerId, status, notes || ""]
  );
  await pool.query(
    `
      INSERT INTO ai_studio_audit_logs (action, actor_id, entity_type, entity_id, previous_value, new_value)
      VALUES ('review', $1, 'knowledge', $2, $3, $4)
    `,
    [reviewerId, id, row.verification_status, status]
  );
  if (status === "APPROVED" || status === "REJECTED") {
    await pool.query(
      `
        UPDATE ai_studio_corrections
        SET status = $2
        WHERE id = (
          SELECT source_correction_id FROM ai_studio_knowledge WHERE id = $1
        )
      `,
      [id, status]
    );
  }
  return updated.rows[0];
}

module.exports = {
  latestOtp,
  insertOtp,
  incrementOtpAttempts,
  markOtpVerified,
  customerHasMessages,
  listConversations,
  listMessages,
  assistantMessageForCustomer,
  previousCustomerQuestion,
  insertCorrection,
  listCorrections,
  insertMemory,
  listMemories,
  deleteMemory,
  insertKnowledge,
  searchApprovedKnowledge,
  overview,
  listPendingKnowledge,
  reviewKnowledge,
};
