const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { safeEqual, sha256HmacHex } = require("../utils/crypto");

const WHATSAPP_OBJECT = "whatsapp_business_account";
const MESSAGES_FIELD = "messages";

function verifyWebhook({ mode, token, challenge }, expectedToken) {
  if (mode !== "subscribe" || !token || !challenge) {
    return { ok: false, statusCode: 403 };
  }

  if (!safeEqual(token, expectedToken)) {
    return { ok: false, statusCode: 403 };
  }

  return { ok: true, challenge: String(challenge) };
}

function isValidSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) {
    return { checked: false, valid: true };
  }

  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return { checked: true, valid: false };
  }

  const expected = sha256HmacHex(appSecret, rawBody);
  const received = signatureHeader.slice("sha256=".length);

  return { checked: true, valid: safeEqual(expected, received) };
}

function maskPhoneNumber(phoneNumber) {
  const digits = String(phoneNumber || "");
  if (digits.length < 4) {
    return "****";
  }
  return `****${digits.slice(-4)}`;
}

function extractTextFromMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  if (message.type === "text" && message.text && typeof message.text.body === "string") {
    return message.text.body;
  }

  return null;
}

function processIncomingMessage(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, statusCode: 400, error: "Malformed webhook payload" };
  }

  if (payload.object !== WHATSAPP_OBJECT) {
    return { ok: false, statusCode: 404, error: "Unexpected webhook object" };
  }

  if (!Array.isArray(payload.entry)) {
    return { ok: false, statusCode: 400, error: "Malformed webhook payload" };
  }

  const events = [];

  for (const entry of payload.entry) {
    if (!entry || !Array.isArray(entry.changes)) {
      continue;
    }

    for (const change of entry.changes) {
      if (!change || change.field !== MESSAGES_FIELD || !change.value) {
        continue;
      }

      const contacts = Array.isArray(change.value.contacts)
        ? change.value.contacts
        : [];
      const nameByWaId = new Map(
        contacts
          .filter((contact) => contact && contact.wa_id)
          .map((contact) => [
            contact.wa_id,
            contact.profile && contact.profile.name
              ? contact.profile.name
              : null,
          ])
      );

      const inboundMessages = Array.isArray(change.value.messages)
        ? change.value.messages
        : [];

      for (const message of inboundMessages) {
        if (!message || !message.from || !message.id) {
          continue;
        }

        const messageType = message.type || "unknown";
        const text = extractTextFromMessage(message);

        events.push({
          kind: text ? "text" : "unsupported",
          customerNumber: message.from,
          customerName: nameByWaId.get(message.from) || null,
          messageId: message.id,
          timestamp: message.timestamp || null,
          messageType,
          message: text,
        });
      }
    }
  }

  return { ok: true, events };
}

async function sendTextMessage() {
  throw new Error("Sending WhatsApp replies is not enabled yet");
}

function logProcessedEvents(events) {
  for (const event of events) {
    logger.info("WhatsApp message received", {
      messageId: event.messageId,
      messageType: event.messageType,
      kind: event.kind,
      customer: maskPhoneNumber(event.customerNumber),
      hasName: Boolean(event.customerName),
    });
  }
}

function getVerifyToken() {
  return env.whatsappVerifyToken;
}

function getAppSecret() {
  return env.whatsappAppSecret;
}

module.exports = {
  verifyWebhook,
  isValidSignature,
  processIncomingMessage,
  sendTextMessage,
  logProcessedEvents,
  maskPhoneNumber,
  getVerifyToken,
  getAppSecret,
};
