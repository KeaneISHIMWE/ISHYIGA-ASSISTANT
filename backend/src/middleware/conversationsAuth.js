const { env } = require("../config/env");
const { safeEqual } = require("../utils/crypto");

function readProvidedKey(req) {
  const authorization = req.get("authorization") || "";
  if (/^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, "").trim();
  }

  return String(req.get("x-api-key") || "").trim();
}

function requireConversationsAuth(req, res, next) {
  const expected = env.conversationsApiKey;
  if (!expected) {
    return res.status(503).json({
      error: "Conversations API is locked. CONVERSATIONS_API_KEY is not configured.",
    });
  }

  const provided = readProvidedKey(req);
  if (!provided || !safeEqual(provided, expected)) {
    return res.status(401).json({
      error: "Unauthorized. Send Authorization: Bearer <CONVERSATIONS_API_KEY>.",
    });
  }

  return next();
}

module.exports = {
  requireConversationsAuth,
  readProvidedKey,
};
