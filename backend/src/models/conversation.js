const { pool } = require("../config/db");

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

module.exports = {
  findOpenByCustomerId,
  create,
};
