const { pool } = require("../config/db");

async function findByWhatsappNumber(whatsappNumber) {
  const result = await pool.query(
    `
      SELECT id, whatsapp_number, name, created_at, updated_at
      FROM customers
      WHERE whatsapp_number = $1
    `,
    [whatsappNumber]
  );

  return result.rows[0] || null;
}

async function create({ whatsappNumber, name = null }) {
  const result = await pool.query(
    `
      INSERT INTO customers (whatsapp_number, name)
      VALUES ($1, $2)
      RETURNING id, whatsapp_number, name, created_at, updated_at
    `,
    [whatsappNumber, name]
  );

  return result.rows[0];
}

module.exports = {
  findByWhatsappNumber,
  create,
};
