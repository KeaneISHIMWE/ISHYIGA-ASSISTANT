const { pool, isUniqueViolation } = require("../config/db");

const SELECT_COLUMNS = `
  id,
  conversation_id,
  customer_number,
  company,
  issue_key,
  issue_summary,
  reason,
  priority,
  status,
  ticket_id,
  agent_id,
  agent_name,
  notify_number,
  details,
  created_at,
  updated_at
`;

async function findOpenByIssue({ customerNumber, issueKey }) {
  const result = await pool.query(
    `
      SELECT ${SELECT_COLUMNS}
      FROM escalations
      WHERE customer_number = $1
        AND issue_key = $2
        AND status <> 'RESOLVED'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [customerNumber, issueKey]
  );

  return result.rows[0] || null;
}

async function findLatestOpenByCustomer(customerNumber) {
  const result = await pool.query(
    `
      SELECT ${SELECT_COLUMNS}
      FROM escalations
      WHERE customer_number = $1
        AND status <> 'RESOLVED'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [customerNumber]
  );

  return result.rows[0] || null;
}

async function findLatestWaiting() {
  const result = await pool.query(
    `
      SELECT ${SELECT_COLUMNS}
      FROM escalations
      WHERE status IN ('TICKET_CREATED', 'SUPPORT_NOTIFIED', 'WAITING_FOR_SUPPORT')
      ORDER BY created_at DESC
      LIMIT 1
    `
  );

  return result.rows[0] || null;
}

async function create(record) {
  const result = await pool.query(
    `
      INSERT INTO escalations (
        conversation_id,
        customer_number,
        company,
        issue_key,
        issue_summary,
        reason,
        priority,
        status,
        ticket_id,
        agent_id,
        agent_name,
        notify_number,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING ${SELECT_COLUMNS}
    `,
    [
      record.conversationId || null,
      record.customerNumber,
      record.company || null,
      record.issueKey,
      record.issueSummary,
      record.reason,
      record.priority,
      record.status,
      record.ticketId || null,
      record.agentId || null,
      record.agentName || null,
      record.notifyNumber || null,
      record.details || null,
    ]
  );

  return result.rows[0];
}

async function update(id, fields) {
  const result = await pool.query(
    `
      UPDATE escalations
      SET
        status = COALESCE($2, status),
        ticket_id = COALESCE($3, ticket_id),
        agent_id = COALESCE($4, agent_id),
        agent_name = COALESCE($5, agent_name),
        notify_number = COALESCE($6, notify_number),
        details = COALESCE($7, details)
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}
    `,
    [
      id,
      fields.status,
      fields.ticketId,
      fields.agentId,
      fields.agentName,
      fields.notifyNumber,
      fields.details,
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  findOpenByIssue,
  findLatestOpenByCustomer,
  findLatestWaiting,
  create,
  update,
  isUniqueViolation,
};
