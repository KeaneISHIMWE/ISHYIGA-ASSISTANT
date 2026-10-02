const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const studioModel = require("../models/studio");
const {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  readCookie,
  cookieHeader,
  hitRateLimit,
} = require("../services/studioAuth");
const {
  validateRegistration,
  decideRole,
  validateContribution,
  canEditContribution,
  reviewStatus,
  knowledgeContent,
  STATUSES,
  TYPES,
} = require("../services/studioRules");

function secret() {
  return env.studioJwtSecret || "";
}

function tokenFromRequest(req) {
  const header = req.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return readCookie(req.get("cookie"), "studio_token");
}

function sendAuth(res, user) {
  const key = secret();
  if (!key) {
    return res.status(503).json({
      error: "Studio sign-in is not configured. Set STUDIO_JWT_SECRET.",
    });
  }
  const token = signToken({ sub: user.id, role: user.role }, key);
  res.setHeader(
    "Set-Cookie",
    cookieHeader(token, { secure: env.nodeEnv === "production" })
  );
  return res.json({ user: studioModel.publicUser(user) });
}

async function currentUser(req) {
  const payload = verifyToken(tokenFromRequest(req), secret());
  if (!payload || !payload.sub) {
    return null;
  }
  const user = await studioModel.findUserById(payload.sub);
  return user ? studioModel.publicUser(user) : null;
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  return user;
}

function requireAdmin(user, res) {
  if (!user || user.role !== "ADMIN") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

async function writeAudit(user, action, resourceType, resourceId, metadata) {
  try {
    await studioModel.insertAudit({
      userId: user && user.id,
      action,
      resourceType,
      resourceId,
      metadata,
    });
  } catch (error) {
    logger.error("Studio audit write failed", {
      message: error && error.message ? error.message.slice(0, 160) : "unknown",
    });
  }
}

async function register(req, res) {
  const parsed = validateRegistration(req.body || {});
  if (typeof parsed === "string") {
    return res.status(400).json({ error: parsed });
  }
  if (hitRateLimit(`register:${parsed.email}`)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const existing = await studioModel.findUserByEmail(parsed.email);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const role = decideRole(await studioModel.countUsers());
  const user = await studioModel.insertUser({
    ...parsed,
    passwordHash: hashPassword(parsed.password),
    role,
  });
  await writeAudit(user, "account_created", "user", user.id, { role });
  return sendAuth(res, user);
}

async function login(req, res) {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  const password = (req.body && req.body.password) || "";
  if (hitRateLimit(`login:${email || "unknown"}`)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const user = email ? await studioModel.findUserByEmail(email) : null;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  await writeAudit(user, "login", "user", user.id, {});
  return sendAuth(res, user);
}

function logout(_req, res) {
  res.setHeader(
    "Set-Cookie",
    cookieHeader("", { secure: env.nodeEnv === "production", maxAge: 0 })
  );
  return res.json({ ok: true });
}

async function me(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return undefined;
  }
  return res.json({ user });
}

async function createContribution(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return undefined;
  }
  const parsed = validateContribution(req.body || {});
  if (typeof parsed === "string") {
    return res.status(400).json({ error: parsed });
  }
  const row = await studioModel.insertContribution({
    ...parsed,
    contributorId: user.id,
  });
  await writeAudit(user, "contribution_submitted", "contribution", row.id, {
    type: row.type,
  });
  return res.status(201).json({ contribution: row });
}

async function myContributions(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return undefined;
  }
  const rows = await studioModel.listContributions({
    contributorId: user.role === "ADMIN" ? null : user.id,
    status: STATUSES.includes(req.query.status) ? req.query.status : "",
    type: TYPES.includes(req.query.type) ? req.query.type : "",
    search: String(req.query.q || "").trim().slice(0, 120),
    sort: String(req.query.sort || "newest"),
  });
  const visible =
    user.role === "ADMIN" ? rows : rows.filter((row) => row.contributor_id === user.id);
  return res.json({ contributions: visible });
}

async function getContribution(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return undefined;
  }
  const row = await studioModel.findContributionById(req.params.id);
  if (!row) {
    return res.status(404).json({ error: "Contribution not found" });
  }
  if (user.role !== "ADMIN" && row.contributor_id !== user.id) {
    return res.status(403).json({ error: "You cannot view this contribution" });
  }
  return res.json({ contribution: row });
}

async function editContribution(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return undefined;
  }
  const existing = await studioModel.findContributionById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Contribution not found" });
  }
  if (!canEditContribution(user, existing)) {
    return res.status(403).json({ error: "This contribution cannot be edited" });
  }
  if (existing.status === "ADDED_TO_AI" && user.role !== "ADMIN") {
    return res.status(403).json({ error: "This contribution cannot be edited" });
  }
  const source = req.body || {};
  const parsed = validateContribution({
    type: existing.type,
    title: source.title ?? existing.title,
    question: source.question ?? existing.question,
    answer: source.answer ?? existing.answer,
    systemPrompt: source.systemPrompt ?? source.system_prompt ?? existing.system_prompt,
    feature: source.feature ?? existing.feature,
    module: source.module ?? existing.module,
    description: source.description ?? existing.description,
    steps: source.steps ?? existing.steps,
    symptoms: source.symptoms ?? existing.symptoms,
    cause: source.cause ?? existing.cause,
    solution: source.solution ?? existing.solution,
    escalateWhen: source.escalateWhen ?? source.escalate_when ?? existing.escalate_when,
    priority: source.priority ?? existing.priority,
    notes: source.notes ?? existing.notes,
    attachmentNote: source.attachmentNote ?? source.attachment_note ?? existing.attachment_note,
  });
  if (typeof parsed === "string") {
    return res.status(400).json({ error: parsed });
  }
  const row = await studioModel.updateContribution(existing.id, {
    ...parsed,
    type: existing.type,
  });
  await writeAudit(user, "contribution_edited", "contribution", row.id, {});
  return res.json({ contribution: row });
}

async function adminStats(req, res) {
  const user = await requireUser(req, res);
  if (!user || !requireAdmin(user, res)) {
    return undefined;
  }
  return res.json({ stats: await studioModel.stats() });
}

async function adminList(req, res) {
  const user = await requireUser(req, res);
  if (!user || !requireAdmin(user, res)) {
    return undefined;
  }
  const contributions = await studioModel.listContributions({
    status: STATUSES.includes(req.query.status) ? req.query.status : "",
    type: TYPES.includes(req.query.type) ? req.query.type : "",
    search: String(req.query.q || "").trim().slice(0, 120),
    sort: String(req.query.sort || "newest"),
  });
  return res.json({ contributions });
}

async function review(req, res) {
  const user = await requireUser(req, res);
  if (!user || !requireAdmin(user, res)) {
    return undefined;
  }
  const status = reviewStatus(req.body && req.body.action);
  if (!status) {
    return res.status(400).json({ error: "Unknown review action" });
  }
  const existing = await studioModel.findContributionById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Contribution not found" });
  }
  if (existing.contributor_id === user.id) {
    return res.status(403).json({ error: "You cannot review your own contribution" });
  }
  if (existing.status === "ADDED_TO_AI") {
    return res.status(409).json({ error: "This contribution is already in the knowledge base" });
  }
  const notes = String((req.body && req.body.notes) || "").trim().slice(0, 4000);
  const row = await studioModel.reviewContribution(existing.id, {
    status,
    notes,
    reviewerId: user.id,
  });
  await writeAudit(user, `contribution_${status.toLowerCase()}`, "contribution", row.id, {
    notes,
  });
  return res.json({ contribution: row });
}

async function addToKnowledge(req, res) {
  const user = await requireUser(req, res);
  if (!user || !requireAdmin(user, res)) {
    return undefined;
  }
  const existing = await studioModel.findContributionById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Contribution not found" });
  }
  if (existing.contributor_id === user.id) {
    return res.status(403).json({ error: "You cannot approve your own contribution" });
  }
  if (existing.status === "REJECTED") {
    return res.status(409).json({ error: "Rejected contributions cannot be added" });
  }
  const already = await studioModel.findKnowledgeByContribution(existing.id);
  if (already) {
    return res.json({ knowledge: already, contribution: existing });
  }

  const content = knowledgeContent(existing);
  if (!content) {
    return res.status(400).json({ error: "This contribution has no knowledge to add" });
  }
  const knowledge = await studioModel.insertKnowledge({
    contributionId: existing.id,
    title: existing.title,
    content,
    category: existing.type,
    createdBy: existing.contributor_id,
    approvedBy: user.id,
  });

  if (existing.type === "SYSTEM_PROMPT" && existing.system_prompt) {
    const name = existing.title;
    const version = await studioModel.nextPromptVersion(name);
    await studioModel.archiveCurrentPrompt(name);
    await studioModel.insertPromptVersion({
      contributionId: existing.id,
      name,
      content: existing.system_prompt,
      version,
      createdBy: existing.contributor_id,
      approvedBy: user.id,
      adminNotes: existing.admin_notes,
    });
  }

  const contribution = await studioModel.markAdded(existing.id, user.id);
  await writeAudit(user, "knowledge_added", "knowledge", knowledge.id, {
    contributionId: existing.id,
  });
  return res.json({ knowledge, contribution });
}

async function removeContribution(req, res) {
  const user = await requireUser(req, res);
  if (!user || !requireAdmin(user, res)) {
    return undefined;
  }
  const existing = await studioModel.findContributionById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Contribution not found" });
  }
  if (existing.status === "ADDED_TO_AI") {
    return res.status(409).json({ error: "Approved knowledge cannot be deleted here" });
  }
  const removed = await studioModel.deleteContribution(existing.id);
  if (!removed) {
    return res.status(409).json({ error: "Contribution was not deleted" });
  }
  await writeAudit(user, "contribution_deleted", "contribution", existing.id, {});
  return res.json({ ok: true });
}

async function knowledge(_req, res) {
  return res.json({ items: await studioModel.listKnowledge() });
}

async function prompts(req, res) {
  const user = await requireUser(req, res);
  if (!user || !requireAdmin(user, res)) {
    return undefined;
  }
  return res.json({ prompts: await studioModel.listPromptVersions() });
}

async function users(req, res) {
  const user = await requireUser(req, res);
  if (!user || !requireAdmin(user, res)) {
    return undefined;
  }
  return res.json({ users: await studioModel.listUsers() });
}

async function changeRole(req, res) {
  const user = await requireUser(req, res);
  if (!user || !requireAdmin(user, res)) {
    return undefined;
  }
  const role = String((req.body && req.body.role) || "");
  if (role !== "ADMIN" && role !== "CONTRIBUTOR") {
    return res.status(400).json({ error: "Role must be ADMIN or CONTRIBUTOR" });
  }
  if (req.params.id === user.id && role !== "ADMIN") {
    const admins = await studioModel.countAdmins();
    if (admins <= 1) {
      return res.status(409).json({ error: "The last admin cannot be demoted" });
    }
  }
  const updated = await studioModel.updateUserRole(req.params.id, role);
  if (!updated) {
    return res.status(404).json({ error: "User not found" });
  }
  await writeAudit(user, "role_changed", "user", updated.id, { role });
  return res.json({ user: studioModel.publicUser(updated) });
}

async function audit(req, res) {
  const user = await requireUser(req, res);
  if (!user || !requireAdmin(user, res)) {
    return undefined;
  }
  return res.json({ events: await studioModel.listAudit() });
}

async function guardKnowledge(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return undefined;
  }
  return knowledge(req, res);
}

module.exports = {
  register,
  login,
  logout,
  me,
  createContribution,
  myContributions,
  getContribution,
  editContribution,
  adminStats,
  adminList,
  review,
  addToKnowledge,
  removeContribution,
  guardKnowledge,
  prompts,
  users,
  changeRole,
  audit,
};
