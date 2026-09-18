const { pool, isUniqueViolation } = require("../config/db");
const {
  phoneLookupCandidates,
  toCanonicalWhatsappDigits,
} = require("../services/contactRules");

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

async function findByPhone(whatsappNumber) {
  const candidates = phoneLookupCandidates(whatsappNumber);
  if (candidates.length === 0) {
    return null;
  }

  const exact = await findByWhatsappNumber(whatsappNumber);
  if (exact) {
    return exact;
  }

  const canonical = toCanonicalWhatsappDigits(whatsappNumber);
  if (canonical && canonical !== whatsappNumber) {
    const byCanonical = await findByWhatsappNumber(canonical);
    if (byCanonical) {
      return byCanonical;
    }
  }

  const result = await pool.query(
    `
      SELECT id, whatsapp_number, name, created_at, updated_at
      FROM customers
      WHERE regexp_replace(whatsapp_number, '\\D', '', 'g') = ANY($1::text[])
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [candidates]
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

async function findOrCreate({ whatsappNumber, name = null }) {
  const storedNumber =
    toCanonicalWhatsappDigits(whatsappNumber) || whatsappNumber;
  const existing = await findByPhone(whatsappNumber);
  if (existing) {
    return existing;
  }

  try {
    return await create({ whatsappNumber: storedNumber, name });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    return findByPhone(whatsappNumber);
  }
}

module.exports = {
  findByWhatsappNumber,
  findByPhone,
  create,
  findOrCreate,
};
