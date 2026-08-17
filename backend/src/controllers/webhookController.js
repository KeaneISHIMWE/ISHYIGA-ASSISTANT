const { logger } = require("../utils/logger");
const {
  verifyWebhook,
  isValidSignature,
  processIncomingMessage,
  logProcessedEvents,
  getVerifyToken,
  getAppSecret,
} = require("../services/whatsappService");

function verify(req, res) {
  const result = verifyWebhook(
    {
      mode: req.query["hub.mode"],
      token: req.query["hub.verify_token"],
      challenge: req.query["hub.challenge"],
    },
    getVerifyToken()
  );

  if (!result.ok) {
    logger.warn("WhatsApp webhook verification failed");
    return res.status(result.statusCode).send("Forbidden");
  }

  logger.info("WhatsApp webhook verified");
  return res.status(200).type("text/plain").send(result.challenge);
}

function receive(req, res) {
  logger.info("Incoming webhook received", {
    path: req.originalUrl,
  });

  const signature = isValidSignature(
    req.rawBody || Buffer.from(""),
    req.get("x-hub-signature-256"),
    getAppSecret()
  );

  if (signature.checked && !signature.valid) {
    logger.warn("WhatsApp webhook signature rejected");
    return res.status(403).json({ error: "Invalid signature" });
  }

  const result = processIncomingMessage(req.body);

  if (!result.ok) {
    logger.warn("WhatsApp webhook payload rejected", {
      error: result.error,
    });
    return res.status(result.statusCode).json({ error: result.error });
  }

  logProcessedEvents(result.events);
  return res.status(200).json({ status: "received" });
}

module.exports = { verify, receive };
