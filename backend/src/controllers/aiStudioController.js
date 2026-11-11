const { env } = require("../config/env");
const { findByPhone } = require("../models/customer");
const studioModel = require("../models/studio");
const aiStudio = require("../models/aiStudio");
const { toCanonicalWhatsappDigits } = require("../services/contactRules");
const { sendTextMessage } = require("../services/whatsappService");
const {
  signToken,
  verifyToken,
  readCookie,
  hitRateLimit,
} = require("../services/studioAuth");
const {
  hashOtp,
  createOtpCode,
  assessOtp,
  withinCooldown,
  OTP_TTL_MS,
} = require("../services/aiStudio/otp");
const {
  detectLanguage,
  isSensitive,
  looksPersonal,
  fallbackNormalization,
} = require("../services/aiStudio/language");
const { logger } = require("../utils/logger");

const NEUTRAL =
  "If this WhatsApp number has conversations with the assistant, a verification code was sent. It expires in 5 minutes.";

function pepper() {
  return env.studioJwtSecret || env.conversationsApiKey || "";
}

function learnerFrom(req) {
  const token = readCookie(req.get("cookie"), "ai_studio_token");
  const payload = verifyToken(token, pepper());
  if (!payload || payload.typ !== "learner" || !payload.sub) {
    return null;
  }
  return payload.sub;
}

function requireLearner(req, res) {
  const customerId = learnerFrom(req);
  if (!customerId) {
    res.status(401).json({ error: "Sign in with your WhatsApp number." });
    return null;
  }
  return customerId;
}

async function requireAdmin(req, res) {
  const token = readCookie(req.get("cookie"), "studio_token");
  const payload = verifyToken(token, pepper());
  if (!payload || !payload.sub) {
    res.status(401).json({ error: "Administrator sign-in is required." });
    return null;
  }
  const user = await studioModel.findUserById(payload.sub);
  if (!user || user.role !== "ADMIN") {
    res.status(403).json({ error: "Administrator sign-in is required." });
    return null;
  }
  return user;
}

function setLearnerCookie(res, customerId) {
  const token = signToken({ sub: customerId, typ: "learner" }, pepper());
  const secure = env.nodeEnv === "production";
  res.setHeader(
    "Set-Cookie",
    [
      `ai_studio_token=${encodeURIComponent(token)}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Lax",
      "Max-Age=604800",
      secure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ")
  );
}

async function requestOtp(req, res) {
  if (!pepper()) {
    return res.status(503).json({ error: "Studio signing is not configured." });
  }
  const phone = toCanonicalWhatsappDigits(req.body && req.body.phone);
  if (!phone || phone.length < 10) {
    return res.status(400).json({ error: "Enter a valid WhatsApp number." });
  }
  if (hitRateLimit(`otp-ip:${req.ip}`, { limit: 10, windowMs: 15 * 60 * 1000 })) {
    return res.status(429).json({ error: "Too many attempts. Wait and try again." });
  }
  if (hitRateLimit(`otp-phone:${phone}`, { limit: 5, windowMs: 15 * 60 * 1000 })) {
    return res.status(429).json({ error: "Too many attempts. Wait and try again." });
  }
  if (!env.whatsappAccessToken || !env.whatsappPhoneNumberId) {
    return res.status(503).json({
      error: "WhatsApp delivery is not configured, so a code cannot be sent.",
    });
  }

  const customer = await findByPhone(phone);
  const eligible = customer ? await aiStudio.customerHasMessages(customer.id) : false;
  if (!eligible) {
    return res.json({ ok: true, message: NEUTRAL });
  }

  const latest = await aiStudio.latestOtp(customer.id);
  if (latest && !latest.verified_at && withinCooldown(latest.created_at)) {
    return res.status(429).json({ error: "Wait a minute before requesting another code." });
  }

  const code = createOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await aiStudio.insertOtp({
    customerId: customer.id,
    otpHash: hashOtp(code, pepper()),
    expiresAt,
  });
  const sent = await sendTextMessage({
    to: customer.whatsapp_number || phone,
    body: `Ishyiga AI Studio code: ${code}. It expires in 5 minutes. Do not share it.`,
  });
  if (!sent.ok) {
    logger.error("AI Studio OTP was not delivered", { reason: sent.error || "send_failed" });
    return res.status(502).json({
      error: "WhatsApp could not deliver the code. Try again later.",
    });
  }
  return res.json({ ok: true, message: NEUTRAL });
}

async function verifyOtp(req, res) {
  const phone = toCanonicalWhatsappDigits(req.body && req.body.phone);
  const code = String((req.body && req.body.code) || "").replace(/\D/g, "");
  if (!phone || code.length !== 6) {
    return res.status(400).json({ error: "Enter the 6-digit code from WhatsApp." });
  }
  const customer = await findByPhone(phone);
  if (!customer) {
    return res.status(401).json({ error: "That code is not valid." });
  }
  const record = await aiStudio.latestOtp(customer.id);
  const decision = assessOtp({ record, code, pepper: pepper() });
  if (!decision.ok) {
    if (decision.increment && record) {
      await aiStudio.incrementOtpAttempts(record.id);
    }
    return res.status(401).json({ error: "That code is not valid." });
  }
  await aiStudio.markOtpVerified(record.id);
  setLearnerCookie(res, customer.id);
  return res.json({
    ok: true,
    user: { id: customer.id, name: customer.name || "", phone: customer.whatsapp_number },
  });
}

function logout(_req, res) {
  res.setHeader(
    "Set-Cookie",
    "ai_studio_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
  );
  return res.json({ ok: true });
}

async function me(req, res) {
  const customerId = requireLearner(req, res);
  if (!customerId) {
    return undefined;
  }
  const { pool } = require("../config/db");
  const result = await pool.query(
    `SELECT id, whatsapp_number, name FROM customers WHERE id = $1`,
    [customerId]
  );
  const row = result.rows[0];
  if (!row) {
    return res.status(401).json({ error: "Sign in with your WhatsApp number." });
  }
  return res.json({
    user: { id: row.id, name: row.name || "", phone: row.whatsapp_number },
  });
}

async function overview(req, res) {
  const customerId = requireLearner(req, res);
  if (!customerId) return undefined;
  return res.json({ stats: await aiStudio.overview(customerId) });
}

async function conversations(req, res) {
  const customerId = requireLearner(req, res);
  if (!customerId) return undefined;
  const q = String(req.query.q || "").trim().slice(0, 80);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const rows = await aiStudio.listConversations(customerId, { q, offset, limit: 30 });
  return res.json({
    conversations: rows.map((row) => ({
      id: row.id,
      title: (row.title || "Conversation").slice(0, 80),
      status: row.status,
      updatedAt: row.last_activity_at || row.updated_at,
      assistantMessages: row.assistant_messages,
    })),
  });
}

async function messages(req, res) {
  const customerId = requireLearner(req, res);
  if (!customerId) return undefined;
  const rows = await aiStudio.listMessages(customerId, req.params.id);
  if (!rows) {
    return res.status(404).json({ error: "Conversation not found." });
  }
  return res.json({
    messages: rows.map((row) => ({
      id: row.id,
      role: row.sender_type === "assistant" ? "assistant" : "user",
      content: row.message,
      createdAt: row.created_at,
    })),
  });
}

async function analyzeCorrection(text) {
  const base = fallbackNormalization(text);
  if (!env.openaiApiKey || base.language !== "rw") {
    return {
      language: base.language,
      normalizedEnglish: base.normalizedEnglish,
      title: base.title,
      category: "General Knowledge",
      personal: looksPersonal(text),
      sensitive: isSensitive(text),
    };
  }
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.openaiModel,
        messages: [
          {
            role: "system",
            content:
              "Interpret a user correction of an Ishyiga software answer. Keep product and menu names unchanged. Reply with JSON only: {\"language\",\"normalizedEnglish\",\"title\",\"category\",\"personal\"}.",
          },
          { role: "user", content: text },
        ],
      }),
    });
    const payload = await response.json();
    const raw = payload.choices && payload.choices[0] && payload.choices[0].message
      ? payload.choices[0].message.content
      : "";
    const parsed = JSON.parse(String(raw).replace(/```json|```/g, "").trim());
    return {
      language: parsed.language || base.language,
      normalizedEnglish: parsed.normalizedEnglish || text,
      title: parsed.title || base.title,
      category: parsed.category || "General Knowledge",
      personal: Boolean(parsed.personal) || looksPersonal(text),
      sensitive: isSensitive(text),
    };
  } catch (error) {
    logger.error("Correction analysis failed", { message: error.message });
    return {
      language: detectLanguage(text),
      normalizedEnglish: text,
      title: base.title,
      category: "General Knowledge",
      personal: looksPersonal(text),
      sensitive: isSensitive(text),
    };
  }
}

async function createCorrection(req, res) {
  const customerId = requireLearner(req, res);
  if (!customerId) return undefined;
  const messageId = req.body && req.body.messageId;
  const correction = String((req.body && req.body.correction) || "").trim();
  const explanation = String((req.body && req.body.explanation) || "").trim();
  if (!messageId || correction.length < 3) {
    return res.status(400).json({ error: "Write the correction before submitting." });
  }
  const message = await aiStudio.assistantMessageForCustomer(customerId, messageId);
  if (!message || message.sender_type !== "assistant") {
    return res.status(404).json({ error: "That assistant reply cannot be corrected." });
  }
  const analysis = await analyzeCorrection(`${correction}\n${explanation}`);
  if (analysis.sensitive) {
    return res.status(400).json({
      error: "Remove passwords, codes, and other private secrets before submitting.",
    });
  }
  const question = await aiStudio.previousCustomerQuestion(
    message.conversation_id,
    message.created_at
  );
  const saved = await aiStudio.insertCorrection({
    customerId,
    conversationId: message.conversation_id,
    messageId: message.id,
    question,
    response: message.message,
    correction,
    normalized: analysis.normalizedEnglish,
    explanation,
    language: analysis.language,
    personal: analysis.personal,
  });
  if (!saved) {
    return res.status(409).json({ error: "This reply already has a correction." });
  }
  if (analysis.personal) {
    await aiStudio.insertMemory({
      customerId,
      memoryType: "correction",
      content: analysis.normalizedEnglish,
      messageId: message.id,
      correctionId: saved.id,
      confidence: 0.6,
    });
  } else {
    await aiStudio.insertKnowledge({
      title: analysis.title,
      description: analysis.normalizedEnglish,
      category: analysis.category,
      original: correction,
      normalized: analysis.normalizedEnglish,
      correctionId: saved.id,
      scope: "global",
      confidence: 0.5,
    });
  }
  return res.status(201).json({ ok: true, correction: saved });
}

async function corrections(req, res) {
  const customerId = requireLearner(req, res);
  if (!customerId) return undefined;
  return res.json({ corrections: await aiStudio.listCorrections(customerId) });
}

async function memories(req, res) {
  const customerId = requireLearner(req, res);
  if (!customerId) return undefined;
  return res.json({ memories: await aiStudio.listMemories(customerId) });
}

async function removeMemory(req, res) {
  const customerId = requireLearner(req, res);
  if (!customerId) return undefined;
  const removed = await aiStudio.deleteMemory(customerId, req.params.id);
  if (!removed) {
    return res.status(404).json({ error: "Memory not found." });
  }
  return res.json({ ok: true });
}

async function pendingReviews(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return undefined;
  return res.json({ reviews: await aiStudio.listPendingKnowledge() });
}

async function decideReview(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return undefined;
  const status = req.body && req.body.status;
  if (!["APPROVED", "REJECTED", "NEEDS_CLARIFICATION"].includes(status)) {
    return res.status(400).json({ error: "Choose a review decision." });
  }
  const row = await aiStudio.reviewKnowledge({
    id: req.params.id,
    status,
    notes: req.body.notes || "",
    reviewerId: admin.id,
  });
  if (!row) {
    return res.status(404).json({ error: "Knowledge not found." });
  }
  return res.json({ knowledge: row });
}

module.exports = {
  requestOtp,
  verifyOtp,
  logout,
  me,
  overview,
  conversations,
  messages,
  createCorrection,
  corrections,
  memories,
  removeMemory,
  pendingReviews,
  decideReview,
};
