const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  verifyWebhook,
  isValidSignature,
  processIncomingMessage,
  sendTextMessage,
  markReadAndShowTyping,
  classifyWhatsAppSendError,
  isRetryableSendResult,
} = require("../src/services/whatsappService");

const VERIFY_TOKEN = "test-verify-token";

function textPayload({ from = "250788000000", body = "Hello", type = "text" } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [
                {
                  profile: { name: "Alex" },
                  wa_id: from,
                },
              ],
              messages: [
                {
                  from,
                  id: "wamid.TEST123",
                  timestamp: "1710000000",
                  type,
                  text: type === "text" ? { body } : undefined,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("verifyWebhook", () => {
  it("accepts a matching subscribe challenge", () => {
    const result = verifyWebhook(
      {
        mode: "subscribe",
        token: VERIFY_TOKEN,
        challenge: "1158201444",
      },
      VERIFY_TOKEN
    );

    assert.equal(result.ok, true);
    assert.equal(result.challenge, "1158201444");
  });

  it("rejects a wrong verify token", () => {
    const result = verifyWebhook(
      {
        mode: "subscribe",
        token: "wrong-token",
        challenge: "1158201444",
      },
      VERIFY_TOKEN
    );

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 403);
  });

  it("rejects a missing challenge", () => {
    const result = verifyWebhook(
      {
        mode: "subscribe",
        token: VERIFY_TOKEN,
        challenge: "",
      },
      VERIFY_TOKEN
    );

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 403);
  });
});

describe("isValidSignature", () => {
  it("accepts a matching HMAC signature", () => {
    const body = Buffer.from('{"object":"whatsapp_business_account"}');
    const secret = "app-secret";
    const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");

    const result = isValidSignature(body, `sha256=${digest}`, secret);
    assert.equal(result.checked, true);
    assert.equal(result.valid, true);
  });

  it("rejects a bad signature when a secret is configured", () => {
    const result = isValidSignature(
      Buffer.from("{}"),
      "sha256=deadbeef",
      "app-secret"
    );

    assert.equal(result.checked, true);
    assert.equal(result.valid, false);
  });
});

describe("processIncomingMessage", () => {
  it("extracts a text message", () => {
    const result = processIncomingMessage(textPayload());

    assert.equal(result.ok, true);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].kind, "text");
    assert.equal(result.events[0].customerNumber, "250788000000");
    assert.equal(result.events[0].customerName, "Alex");
    assert.equal(result.events[0].messageId, "wamid.TEST123");
    assert.equal(result.events[0].message, "Hello");
    assert.equal(result.events[0].messageType, "text");
  });

  it("marks non-text messages as unsupported", () => {
    const result = processIncomingMessage(textPayload({ type: "image" }));

    assert.equal(result.ok, true);
    assert.equal(result.events[0].kind, "unsupported");
    assert.equal(result.events[0].message, null);
  });

  it("rejects a malformed payload", () => {
    const result = processIncomingMessage(null);
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 400);
  });

  it("rejects an unexpected object type", () => {
    const result = processIncomingMessage({ object: "page", entry: [] });
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 404);
  });
});

describe("classifyWhatsAppSendError", () => {
  it("classifies timeouts", () => {
    assert.equal(
      classifyWhatsAppSendError({ name: "TimeoutError" }, undefined),
      "timeout"
    );
  });

  it("classifies auth failures", () => {
    assert.equal(classifyWhatsAppSendError(null, 401), "auth");
  });

  it("classifies other API errors", () => {
    assert.equal(classifyWhatsAppSendError(null, 500), "api_error");
  });
});

describe("isRetryableSendResult", () => {
  it("retries timeouts and Meta server errors only", () => {
    assert.equal(isRetryableSendResult({ ok: false, error: "timeout" }), true);
    assert.equal(
      isRetryableSendResult({ ok: false, error: "api_error", status: 500 }),
      true
    );
    assert.equal(isRetryableSendResult({ ok: false, error: "auth" }), false);
  });
});

describe("sendTextMessage", () => {
  it("posts a text payload to the Cloud API", async () => {
    const calls = [];
    const result = await sendTextMessage({
      to: "250788000000",
      body: "We can help with the company's services.",
      accessToken: "test-token",
      phoneNumberId: "123456789",
      apiVersion: "v21.0",
      fetchFn: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: "wamid.OUT1" }] }),
        };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.outboundId, "wamid.OUT1");
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://graph.facebook.com/v21.0/123456789/messages"
    );
    assert.equal(calls[0].options.method, "POST");

    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.messaging_product, "whatsapp");
    assert.equal(payload.to, "250788000000");
    assert.equal(payload.type, "text");
    assert.equal(payload.text.body, "We can help with the company's services.");
  });

  it("returns a fallback error when Meta is not configured", async () => {
    const result = await sendTextMessage({
      to: "250788000000",
      body: "Hello",
      accessToken: "",
      phoneNumberId: "",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "not_configured");
  });

  it("returns a fallback error on auth failure without throwing", async () => {
    const result = await sendTextMessage({
      to: "250788000000",
      body: "Hello",
      accessToken: "test-token",
      phoneNumberId: "123456789",
      fetchFn: async () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "auth");
  });

  it("rejects a missing message body", async () => {
    const result = await sendTextMessage({
      to: "250788000000",
      body: "   ",
      accessToken: "test-token",
      phoneNumberId: "123456789",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid_input");
  });

  it("retries once after a Meta server error", async () => {
    let attempts = 0;
    const result = await sendTextMessage({
      to: "250788000000",
      body: "Hello",
      accessToken: "test-token",
      phoneNumberId: "123456789",
      fetchFn: async () => {
        attempts += 1;
        if (attempts === 1) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: "wamid.RETRY" }] }),
        };
      },
    });

    assert.equal(attempts, 2);
    assert.equal(result.ok, true);
    assert.equal(result.outboundId, "wamid.RETRY");
  });

  it("does not retry auth failures", async () => {
    let attempts = 0;
    const result = await sendTextMessage({
      to: "250788000000",
      body: "Hello",
      accessToken: "test-token",
      phoneNumberId: "123456789",
      fetchFn: async () => {
        attempts += 1;
        return { ok: false, status: 401, json: async () => ({}) };
      },
    });

    assert.equal(attempts, 1);
    assert.equal(result.ok, false);
    assert.equal(result.error, "auth");
  });
});

describe("markReadAndShowTyping", () => {
  it("marks the inbound message read and shows typing", async () => {
    const calls = [];
    const result = await markReadAndShowTyping({
      messageId: "wamid.TEST123",
      accessToken: "test-token",
      phoneNumberId: "123456789",
      apiVersion: "v21.0",
      fetchFn: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://graph.facebook.com/v21.0/123456789/messages"
    );

    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.messaging_product, "whatsapp");
    assert.equal(payload.status, "read");
    assert.equal(payload.message_id, "wamid.TEST123");
    assert.equal(payload.typing_indicator.type, "text");
  });

  it("returns a fallback error when Meta is not configured", async () => {
    const result = await markReadAndShowTyping({
      messageId: "wamid.TEST123",
      accessToken: "",
      phoneNumberId: "",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "not_configured");
  });

  it("keeps the process up when Meta rejects the request", async () => {
    const result = await markReadAndShowTyping({
      messageId: "wamid.TEST123",
      accessToken: "test-token",
      phoneNumberId: "123456789",
      fetchFn: async () => ({
        ok: false,
        status: 400,
        json: async () => ({}),
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "api_error");
  });
});
