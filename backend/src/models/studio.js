const { pool } = require("../config/db");

const USER_COLUMNS = `
  id, name, email, password_hash, phone, role, created_at, updated_at
`;

const PUBLIC_USER = `
  id, name, email, phone, role, created_at, updated_at
`;

const CONTRIBUTION_COLUMNS = `
  c.id,
  c.contributor_id,
  c.type,
  c.title,
  c.question,
  c.answer,
  c.system_prompt,
  c.feature,
  c.module,
  c.description,
  c.steps,
  c.symptoms,
  c.cause,
  c.solution,
  c.escalate_when,
  c.priority,
  c.notes,
  c.attachment_note,
  c.status,
  c.admin_notes,
  c.reviewed_by,
  c.reviewed_at,
  c.created_at,
  c.updated_at,
  u.name AS contributor_name,
  u.email AS contributor_email,
  u.role AS contributor_role,
  reviewer.name AS reviewer_name
`;

function publicUser(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.created_at,
  };
}

async function countUsers() {
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM studio_users");
  return result.rows[0].total;
}

async function countAdmins() {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS total FROM studio_users WHERE role = 'ADMIN'"
  );
  return result.rows[0].total;
}

async function findUserByEmail(email) {
  const result = await pool.query(
    `SELECT ${USER_COLUMNS} FROM studio_users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(
    `SELECT ${PUBLIC_USER} FROM studio_users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function insertUser(record) {
  const result = await pool.query(
    `
      INSERT INTO studio_users (name, email, password_hash, phone, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING ${PUBLIC_USER}
    `,
    [record.name, record.email, record.passwordHash, record.phone, record.role]
  );
  return result.rows[0];
}

async function listUsers() {
  const result = await pool.query(
    `
      SELECT ${PUBLIC_USER},
        (
          SELECT COUNT(*)::int FROM studio_contributions
          WHERE contributor_id = studio_users.id
        ) AS contribution_count
      FROM studio_users
      ORDER BY created_at ASC
    `
  );
  return result.rows;
}

async function updateUserRole(id, role) {
  const result = await pool.query(
    `
      UPDATE studio_users
      SET role = $2
      WHERE id = $1
      RETURNING ${PUBLIC_USER}
    `,
    [id, role]
  );
  return result.rows[0] || null;
}

async function insertContribution(record) {
  const result = await pool.query(
    `
      INSERT INTO studio_contributions (
        contributor_id, type, title, question, answer, system_prompt,
        feature, module, description, steps, symptoms, cause, solution,
        escalate_when, priority, notes, attachment_note, status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, 'PENDING'
      )
      RETURNING id
    `,
    [
      record.contributorId,
      record.type,
      record.title,
      record.question,
      record.answer,
      record.systemPrompt,
      record.feature,
      record.module,
      record.description,
      record.steps,
      record.symptoms,
      record.cause,
      record.solution,
      record.escalateWhen,
      record.priority,
      record.notes,
      record.attachmentNote,
    ]
  );
  return findContributionById(result.rows[0].id);
}

async function findContributionById(id) {
  const result = await pool.query(
    `
      SELECT ${CONTRIBUTION_COLUMNS}
      FROM studio_contributions c
      JOIN studio_users u ON u.id = c.contributor_id
      LEFT JOIN studio_users reviewer ON reviewer.id = c.reviewed_by
      WHERE c.id = $1
    `,
    [id]
  );
  return result.rows[0] || null;
}

async function listContributions({
  contributorId = null,
  status = "",
  type = "",
  search = "",
  sort = "newest",
} = {}) {
  const values = [];
  const clauses = [];
  if (contributorId) {
    values.push(contributorId);
    clauses.push(`c.contributor_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    clauses.push(`c.status = $${values.length}`);
  }
  if (type) {
    values.push(type);
    clauses.push(`c.type = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    clauses.push(`(
      c.title ILIKE $${values.length}
      OR COALESCE(c.question, '') ILIKE $${values.length}
      OR COALESCE(c.answer, '') ILIKE $${values.length}
      OR u.name ILIKE $${values.length}
      OR u.email ILIKE $${values.length}
    )`);
  }
  const order =
    sort === "title"
      ? "c.title ASC"
      : sort === "status"
        ? "c.status ASC, c.created_at DESC"
        : "c.created_at DESC";
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await pool.query(
    `
      SELECT ${CONTRIBUTION_COLUMNS}
      FROM studio_contributions c
      JOIN studio_users u ON u.id = c.contributor_id
      LEFT JOIN studio_users reviewer ON reviewer.id = c.reviewed_by
      ${where}
      ORDER BY ${order}
      LIMIT 200
    `,
    values
  );
  return result.rows;
}

async function updateContribution(id, record) {
  await pool.query(
    `
      UPDATE studio_contributions
      SET
        title = $2,
        question = $3,
        answer = $4,
        system_prompt = $5,
        feature = $6,
        module = $7,
        description = $8,
        steps = $9,
        symptoms = $10,
        cause = $11,
        solution = $12,
        escalate_when = $13,
        priority = $14,
        notes = $15,
        attachment_note = $16,
        status = CASE WHEN status = 'NEEDS_REVISION' THEN 'PENDING' ELSE status END
      WHERE id = $1
    `,
    [
      id,
      record.title,
      record.question,
      record.answer,
      record.systemPrompt,
      record.feature,
      record.module,
      record.description,
      record.steps,
      record.symptoms,
      record.cause,
      record.solution,
      record.escalateWhen,
      record.priority,
      record.notes,
      record.attachmentNote,
    ]
  );
  return findContributionById(id);
}

async function reviewContribution(id, { status, notes, reviewerId }) {
  await pool.query(
    `
      UPDATE studio_contributions
      SET status = $2,
          admin_notes = $3,
          reviewed_by = $4,
          reviewed_at = NOW()
      WHERE id = $1
    `,
    [id, status, notes, reviewerId]
  );
  return findContributionById(id);
}

async function markAdded(id, reviewerId) {
  await pool.query(
    `
      UPDATE studio_contributions
      SET status = 'ADDED_TO_AI',
          reviewed_by = $2,
          reviewed_at = NOW()
      WHERE id = $1
    `,
    [id, reviewerId]
  );
  return findContributionById(id);
}

async function deleteContribution(id) {
  const result = await pool.query(
    "DELETE FROM studio_contributions WHERE id = $1 AND status <> 'ADDED_TO_AI' RETURNING id",
    [id]
  );
  return result.rowCount > 0;
}

async function stats() {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM studio_users) AS contributors,
      (SELECT COUNT(*)::int FROM studio_users WHERE role = 'CONTRIBUTOR') AS contributor_accounts,
      (SELECT COUNT(*)::int FROM studio_contributions) AS total,
      (SELECT COUNT(*)::int FROM studio_contributions WHERE status = 'PENDING') AS pending,
      (SELECT COUNT(*)::int FROM studio_contributions WHERE status = 'UNDER_REVIEW') AS under_review,
      (SELECT COUNT(*)::int FROM studio_contributions WHERE status = 'APPROVED') AS approved,
      (SELECT COUNT(*)::int FROM studio_contributions WHERE status = 'REJECTED') AS rejected,
      (SELECT COUNT(*)::int FROM studio_contributions WHERE status = 'NEEDS_REVISION') AS needs_revision,
      (SELECT COUNT(*)::int FROM studio_contributions WHERE status = 'ADDED_TO_AI') AS added,
      (SELECT COUNT(*)::int FROM studio_contributions WHERE created_at::date = CURRENT_DATE) AS today
  `);
  return result.rows[0];
}

async function findKnowledgeByContribution(contributionId) {
  const result = await pool.query(
    "SELECT id FROM studio_knowledge WHERE contribution_id = $1",
    [contributionId]
  );
  return result.rows[0] || null;
}

async function insertKnowledge(record) {
  const result = await pool.query(
    `
      INSERT INTO studio_knowledge (
        contribution_id, title, content, category, version,
        created_by, approved_by, approved_at
      )
      VALUES ($1, $2, $3, $4, 1, $5, $6, NOW())
      RETURNING id, contribution_id, title, content, category, version,
        created_by, approved_by, approved_at, created_at, updated_at
    `,
    [
      record.contributionId,
      record.title,
      record.content,
      record.category,
      record.createdBy,
      record.approvedBy,
    ]
  );
  return result.rows[0];
}

async function listKnowledge() {
  const result = await pool.query(`
    SELECT
      k.id, k.contribution_id, k.title, k.content, k.category, k.version,
      k.approved_at, k.created_at, k.updated_at,
      author.name AS created_by_name,
      approver.name AS approved_by_name
    FROM studio_knowledge k
    LEFT JOIN studio_users author ON author.id = k.created_by
    LEFT JOIN studio_users approver ON approver.id = k.approved_by
    ORDER BY k.approved_at DESC
  `);
  return result.rows;
}

async function nextPromptVersion(name) {
  const result = await pool.query(
    "SELECT COALESCE(MAX(version), 0)::int AS version FROM studio_prompt_versions WHERE name = $1",
    [name]
  );
  return result.rows[0].version + 1;
}

async function archiveCurrentPrompt(name) {
  await pool.query(
    "UPDATE studio_prompt_versions SET status = 'ARCHIVED' WHERE name = $1 AND status = 'CURRENT'",
    [name]
  );
}

async function insertPromptVersion(record) {
  const result = await pool.query(
    `
      INSERT INTO studio_prompt_versions (
        contribution_id, name, content, version, status,
        created_by, approved_by, admin_notes
      )
      VALUES ($1, $2, $3, $4, 'CURRENT', $5, $6, $7)
      RETURNING id, contribution_id, name, content, version, status,
        created_by, approved_by, admin_notes, created_at, updated_at
    `,
    [
      record.contributionId,
      record.name,
      record.content,
      record.version,
      record.createdBy,
      record.approvedBy,
      record.adminNotes,
    ]
  );
  return result.rows[0];
}

async function listPromptVersions() {
  const result = await pool.query(`
    SELECT
      p.id, p.contribution_id, p.name, p.content, p.version, p.status,
      p.admin_notes, p.created_at, p.updated_at,
      author.name AS created_by_name,
      approver.name AS approved_by_name
    FROM studio_prompt_versions p
    LEFT JOIN studio_users author ON author.id = p.created_by
    LEFT JOIN studio_users approver ON approver.id = p.approved_by
    ORDER BY p.name ASC, p.version DESC
  `);
  return result.rows;
}

async function insertAudit(record) {
  await pool.query(
    `
      INSERT INTO studio_audit_logs (user_id, action, resource_type, resource_id, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      record.userId || null,
      record.action,
      record.resourceType,
      record.resourceId || null,
      JSON.stringify(record.metadata || {}),
    ]
  );
}

async function listAudit() {
  const result = await pool.query(`
    SELECT
      a.id, a.action, a.resource_type, a.resource_id, a.metadata, a.created_at,
      u.name AS user_name, u.email AS user_email
    FROM studio_audit_logs a
    LEFT JOIN studio_users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
    LIMIT 300
  `);
  return result.rows;
}

module.exports = {
  publicUser,
  countUsers,
  countAdmins,
  findUserByEmail,
  findUserById,
  insertUser,
  listUsers,
  updateUserRole,
  insertContribution,
  findContributionById,
  listContributions,
  updateContribution,
  reviewContribution,
  markAdded,
  deleteContribution,
  stats,
  findKnowledgeByContribution,
  insertKnowledge,
  listKnowledge,
  nextPromptVersion,
  archiveCurrentPrompt,
  insertPromptVersion,
  listPromptVersions,
  insertAudit,
  listAudit,
};
