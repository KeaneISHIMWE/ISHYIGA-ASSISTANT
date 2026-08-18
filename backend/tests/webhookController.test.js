const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateRepliesForInboundEvents,
  sendGeneratedReplies,
  processTextEvents,
} = require("../src/controllers/webhookController");
const { FALLBACK_REPLY } = require("../src/services/openaiService");

describe("generateRepliesForInboundEvents", () => {
  it("sends text events to Groq and keeps unsupported events out", async () => {
    const calls = [];
    const replies = await generateRepliesForInboundEvents(
      [
        {
          kind: "text",
          messageId: "wamid.1",
          customerNumber: "250788000000",
          message: "Hello, what services do you offer?",
        },
        {
          kind: "unsupported",
          messageId: "wamid.2",
          message: null,
        },
      ],
      async ({ message }) => {
        calls.push(message);
        return { ok: true, reply: "We can help with the company's services." };
      }
    );

    assert.deepEqual(calls, ["Hello, what services do you offer?"]);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].ok, true);
    assert.equal(replies[0].customerNumber, "250788000000");
    assert.match(replies[0].reply, /services/);
  });

  it("uses the fallback when Groq reports insufficient quota", async () => {
    const replies = await generateRepliesForInboundEvents(
      [
        {
          kind: "text",
          messageId: "wamid.quota",
          message: "Hello",
        },
      ],
      async () => ({
        ok: false,
        reply: FALLBACK_REPLY,
        error: "insufficient_quota",
      })
    );

    assert.equal(replies[0].ok, false);
    assert.equal(replies[0].reply, FALLBACK_REPLY);
    assert.equal(replies[0].error, "insufficient_quota");
  });
});

describe("sendGeneratedReplies", () => {
  it("sends generated text to WhatsApp and skips empty items", async () => {
    const calls = [];
    const results = await sendGeneratedReplies(
      [
        {
          messageId: "wamid.1",
          customerNumber: "250788000000",
          reply: "We can help with the company's services.",
        },
        {
          messageId: "wamid.2",
          customerNumber: "250788000000",
          reply: "",
        },
      ],
      async ({ to, body }) => {
        calls.push({ to, body });
        return { ok: true, outboundId: "wamid.OUT1" };
      }
    );

    assert.deepEqual(calls, [
      {
        to: "250788000000",
        body: "We can help with the company's services.",
      },
    ]);
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, true);
  });

  it("keeps the process up when Meta send reports auth failure", async () => {
    const results = await sendGeneratedReplies(
      [
        {
          messageId: "wamid.auth",
          customerNumber: "250788000000",
          reply: "Hello",
        },
      ],
      async () => ({ ok: false, error: "auth" })
    );

    assert.equal(results[0].ok, false);
    assert.equal(results[0].error, "auth");
  });
});

describe("processTextEvents", () => {
  it("persists inbound and outbound around generate and send", async () => {
    const steps = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.1",
          customerNumber: "250788000000",
          message: "Hello",
        },
        {
          kind: "unsupported",
          messageId: "wamid.2",
          message: null,
        },
      ],
      {
        persistInbound: async (event) => {
          steps.push(`inbound:${event.messageId}`);
          return { ok: true, conversationId: "conv-1" };
        },
        loadHistory: async (conversationId) => {
          steps.push(`history:${conversationId}`);
          return [{ role: "user", content: "Earlier hello" }];
        },
        generateReplyFn: async ({ message, history }) => {
          steps.push(`groq:${message}:${history.length}`);
          return { ok: true, reply: "We can help." };
        },
        sendTextMessageFn: async ({ to }) => {
          steps.push(`send:${to}`);
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async (input) => {
          steps.push(`outbound:${input.outboundId}`);
          return { ok: true };
        },
      }
    );

    assert.deepEqual(steps, [
      "inbound:wamid.1",
      "history:conv-1",
      "groq:Hello:1",
      "send:250788000000",
      "outbound:wamid.OUT1",
    ]);
    assert.equal(results.length, 1);
    assert.equal(results[0].persistedInbound, true);
    assert.equal(results[0].sent, true);
  });

  it("does not persist an assistant reply that WhatsApp did not deliver", async () => {
    const outboundCalls = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.fail",
          customerNumber: "250788000000",
          message: "Hello",
        },
      ],
      {
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        generateReplyFn: async () => ({ ok: true, reply: "We can help." }),
        sendTextMessageFn: async () => ({ ok: false, error: "auth" }),
        persistOutbound: async (input) => {
          outboundCalls.push(input);
          return { ok: true };
        },
      }
    );

    assert.equal(results[0].sent, false);
    assert.equal(outboundCalls.length, 0);
  });
});
