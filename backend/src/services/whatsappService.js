const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { safeEqual, sha256HmacHex } = require("../utils/crypto");

const WHATSAPP_OBJECT = "whatsapp_business_account";
const MESSAGES_FIELD = "messages";
const SEND_TIMEOUT_MS = 20_000;

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

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function isOwnBusinessMessage(message, metadata) {
  const from = digitsOnly(message && message.from);
  const display = digitsOnly(metadata && metadata.display_phone_number);
  return Boolean(from && display && from === display);
}

function isStaleInbound(timestamp, nowSec = Math.floor(Date.now() / 1000)) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) {
    return false;
  }

  return nowSec - ts > 10 * 60;
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

        if (isOwnBusinessMessage(message, change.value.metadata)) {
          logger.info("WhatsApp echo ignored", { messageId: message.id });
          continue;
        }

        if (isStaleInbound(message.timestamp)) {
          logger.info("WhatsApp stale message ignored", { messageId: message.id });
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

function getMessagesUrl(apiVersion, phoneNumberId) {
  return `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
}

function isRetryableSendResult(result) {
  if (!result || result.ok) {
    return false;
  }

  if (result.error === "timeout" || result.error === "rate_limit") {
    return true;
  }

  return Number(result.status) >= 500;
}

function classifyWhatsAppSendError(error, status) {
  const name = error && error.name ? error.name : "";
  const message = error && typeof error.message === "string" ? error.message : "";

  if (
    name === "TimeoutError" ||
    name === "AbortError" ||
    /timeout/i.test(message)
  ) {
    return "timeout";
  }

  if (status === 401 || status === 403) {
    return "auth";
  }

  if (status === 429) {
    return "rate_limit";
  }

  return "api_error";
}

async function sendTextMessage({
  to,
  body,
  fetchFn = fetch,
  accessToken = env.whatsappAccessToken,
  phoneNumberId = env.whatsappPhoneNumberId,
  apiVersion = env.whatsappApiVersion,
} = {}) {
  if (typeof to !== "string" || !to.trim() || typeof body !== "string" || !body.trim()) {
    logger.error("WhatsApp send failed", { reason: "invalid_input" });
    return { ok: false, error: "invalid_input" };
  }

  if (!accessToken || !phoneNumberId) {
    logger.error("WhatsApp send failed", { reason: "not_configured" });
    return { ok: false, error: "not_configured" };
  }

  const recipient = to.trim();
  const text = body.trim();
  const url = getMessagesUrl(apiVersion, phoneNumberId);

  async function postOnce(attempt) {
    logger.info(attempt === 1 ? "WhatsApp send started" : "WhatsApp send retry", {
      customer: maskPhoneNumber(recipient),
      attempt,
    });

    try {
      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: {
            preview_url: false,
            body: text,
          },
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        const reason = classifyWhatsAppSendError(null, response.status);
        logger.error("WhatsApp send failed", {
          reason,
          status: response.status,
          attempt,
        });
        return { ok: false, error: reason, status: response.status };
      }

      const data = await response.json();
      const outboundId =
        data && data.messages && data.messages[0] && data.messages[0].id
          ? data.messages[0].id
          : null;

      logger.info("WhatsApp send completed", {
        customer: maskPhoneNumber(recipient),
        hasOutboundId: Boolean(outboundId),
        attempt,
      });

      return { ok: true, outboundId };
    } catch (error) {
      const reason = classifyWhatsAppSendError(error, error.status);
      logger.error("WhatsApp send failed", { reason, attempt });
      return { ok: false, error: reason };
    }
  }

  const first = await postOnce(1);
  if (first.ok || !isRetryableSendResult(first)) {
    return first;
  }

  return postOnce(2);
}

async function readGraphError(response) {
  try {
    const data = await response.json();
    const err = data && data.error ? data.error : {};
    return {
      graphCode: err.code || null,
      graphMessage:
        typeof err.message === "string" ? err.message.slice(0, 180) : null,
    };
  } catch (_error) {
    return {};
  }
}

async function postReadStatus({
  messageId,
  showTyping,
  fetchFn,
  accessToken,
  phoneNumberId,
  apiVersion,
}) {
  const url = getMessagesUrl(apiVersion, phoneNumberId);
  const payload = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  };

  if (showTyping) {
    payload.typing_indicator = { type: "text" };
  }

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const reason = classifyWhatsAppSendError(null, response.status);
      const graphError = await readGraphError(response);
      logger.error("WhatsApp read/typing failed", {
        reason,
        status: response.status,
        showTyping,
        ...graphError,
      });
      return { ok: false, error: reason, status: response.status, ...graphError };
    }

    logger.info(
      showTyping ? "WhatsApp read/typing shown" : "WhatsApp message marked read",
      { messageId }
    );
    return { ok: true, typing: showTyping };
  } catch (error) {
    const reason = classifyWhatsAppSendError(error, error.status);
    logger.error("WhatsApp read/typing failed", { reason, showTyping });
    return { ok: false, error: reason };
  }
}

async function markReadAndShowTyping({
  messageId,
  fetchFn = fetch,
  accessToken = env.whatsappAccessToken,
  phoneNumberId = env.whatsappPhoneNumberId,
  apiVersion = env.whatsappApiVersion,
} = {}) {
  if (typeof messageId !== "string" || !messageId.trim()) {
    logger.error("WhatsApp read/typing failed", { reason: "invalid_input" });
    return { ok: false, error: "invalid_input" };
  }

  if (!accessToken || !phoneNumberId) {
    logger.error("WhatsApp read/typing failed", { reason: "not_configured" });
    return { ok: false, error: "not_configured" };
  }

  const inboundId = messageId.trim();
  const withTyping = await postReadStatus({
    messageId: inboundId,
    showTyping: true,
    fetchFn,
    accessToken,
    phoneNumberId,
    apiVersion,
  });

  if (withTyping.ok || withTyping.status !== 400) {
    return withTyping;
  }

  return postReadStatus({
    messageId: inboundId,
    showTyping: false,
    fetchFn,
    accessToken,
    phoneNumberId,
    apiVersion,
  });
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
  markReadAndShowTyping,
  classifyWhatsAppSendError,
  isRetryableSendResult,
  logProcessedEvents,
  maskPhoneNumber,
  getVerifyToken,
  getAppSecret,
  SEND_TIMEOUT_MS,
  isOwnBusinessMessage,
  isStaleInbound,
};
