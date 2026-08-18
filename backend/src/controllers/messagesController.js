const { env } = require("../config/env");
const { generateReply } = require("../services/openaiService");

async function createMessage(req, res) {
  const message = req.body && req.body.message;

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  if (!env.groqApiKey) {
    return res.status(503).json({ error: "Groq is not configured" });
  }

  const result = await generateReply({ message: message.trim() });
  return res.status(200).json({
    ok: result.ok,
    reply: result.reply,
  });
}

module.exports = { createMessage };
