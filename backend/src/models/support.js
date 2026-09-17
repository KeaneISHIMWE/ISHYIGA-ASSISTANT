const { pool, isUniqueViolation } = require("../config/db");

const SELECT_COLUMNS = `
  id,
  source_row,
  client_name,
  support_agent,
  location,
  sector,
  visit_at,
  branches,
  status,
  approval,
  active,
  contact,
  created_at,
  updated_at
`;

function buildFilters({
  client,
  agent,
  location,
  sector,
  status,
  approval,
  active,
  contact,
  from,
  to,
} = {}) {
  const clauses = [];
  const values = [];

  const addIlike = (column, value) => {
    if (!value) {
      return;
    }

    values.push(`%${value}%`);
    clauses.push(`${column} ILIKE $${values.length}`);
  };

  addIlike("client_name", client);
  addIlike("support_agent", agent);
  addIlike("location", location);
  addIlike("sector", sector);

  if (status) {
    values.push(status);
    clauses.push(`status ILIKE $${values.length}`);
  }

  if (approval) {
    values.push(approval);
    clauses.push(`approval ILIKE $${values.length}`);
  }

  if (active === true || active === false) {
    values.push(active);
    clauses.push(`active = $${values.length}`);
  }

  if (contact) {
    values.push(`%${String(contact).replace(/\D/g, "") || contact}%`);
    clauses.push(`contact ILIKE $${values.length}`);
  }

  if (from) {
    values.push(from);
    clauses.push(`visit_at >= $${values.length}`);
  }

  if (to) {
    values.push(to);
    clauses.push(`visit_at <= $${values.length}`);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function withNamedAgents(where) {
  const named = "btrim(COALESCE(support_agent, '')) <> ''";
  return where ? `${where} AND ${named}` : `WHERE ${named}`;
}

async function list(filters = {}) {
  const { where, values } = buildFilters(filters);
  const result = await pool.query(
    `
      SELECT ${SELECT_COLUMNS}
      FROM support
      ${where}
      ORDER BY visit_at DESC NULLS LAST, client_name ASC
    `,
    values
  );

  return result.rows;
}

async function listAgents(filters = {}) {
  const { where, values } = buildFilters(filters);
  const result = await pool.query(
    `
      SELECT
        MIN(support_agent) AS support_agent,
        COUNT(*)::int AS clients_count
      FROM support
      ${withNamedAgents(where)}
      GROUP BY lower(btrim(support_agent))
      ORDER BY MIN(support_agent) ASC
    `,
    values
  );

  return result.rows;
}

async function listByAgentKey(agentKey, filters = {}) {
  const key = String(agentKey || "").trim();
  if (!key) {
    return [];
  }

  const { where, values } = buildFilters(filters);
  values.push(key);
  const agentClause = `lower(btrim(support_agent)) = $${values.length}`;
  const fullWhere = where ? `${where} AND ${agentClause}` : `WHERE ${agentClause}`;
  const result = await pool.query(
    `
      SELECT ${SELECT_COLUMNS}
      FROM support
      ${fullWhere}
      ORDER BY visit_at DESC NULLS LAST, client_name ASC
    `,
    values
  );

  return result.rows;
}

async function findById(id) {
  const result = await pool.query(
    `
      SELECT ${SELECT_COLUMNS}
      FROM support
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function upsert(record) {
  const result = await pool.query(
    `
      INSERT INTO support (
        source_row,
        client_name,
        support_agent,
        location,
        sector,
        visit_at,
        branches,
        status,
        approval,
        active,
        contact
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (source_row) DO UPDATE SET
        client_name = EXCLUDED.client_name,
        support_agent = EXCLUDED.support_agent,
        location = EXCLUDED.location,
        sector = EXCLUDED.sector,
        visit_at = EXCLUDED.visit_at,
        branches = EXCLUDED.branches,
        status = EXCLUDED.status,
        approval = EXCLUDED.approval,
        active = EXCLUDED.active,
        contact = EXCLUDED.contact
      RETURNING ${SELECT_COLUMNS},
        (xmax = 0) AS inserted
    `,
    [
      record.sourceRow,
      record.clientName,
      record.supportAgent,
      record.location,
      record.sector,
      record.visitAt,
      record.branches,
      record.status,
      record.approval,
      record.active,
      record.contact,
    ]
  );

  return result.rows[0];
}

async function count() {
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM support");
  return result.rows[0].total;
}

module.exports = {
  list,
  listAgents,
  listByAgentKey,
  findById,
  upsert,
  count,
  buildFilters,
  isUniqueViolation,
};
