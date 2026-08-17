const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  verifyWebhook,
  isValidSignature,
  processIncomingMessage,
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
