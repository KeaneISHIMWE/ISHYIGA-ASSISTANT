const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateRepliesForInboundEvents,
  sendGeneratedReplies,
  processTextEvents,
  IMAGE_UNREADABLE_REPLY,
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
        generateReplyFn: async ({ message, history, clientContext }) => {
          steps.push(`groq:${message}:${history.length}:${clientContext || ""}`);
          return { ok: true, reply: "We can help." };
        },
        loadClientProfileFn: async ({ phoneNumber }) => {
          steps.push(`client:${phoneNumber}`);
          return {
            ok: true,
            clientContext: "## CURRENT CLIENT RECORD\n- Company: Demo Shop",
          };
        },
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async ({ messageId }) => {
          steps.push(`typing:${messageId}`);
          return { ok: true };
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
      "typing:wamid.1",
      "inbound:wamid.1",
      "history:conv-1",
      "client:250788000000",
      "groq:Hello:1:## CURRENT CLIENT RECORD\n- Company: Demo Shop",
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
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
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

  it("still replies when read/typing fails", async () => {
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.1",
          customerNumber: "250788000000",
          message: "Hello",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => {
          throw new Error("network");
        },
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        generateReplyFn: async () => ({ ok: true, reply: "We can help." }),
        sendTextMessageFn: async () => ({ ok: true, outboundId: "wamid.OUT1" }),
        persistOutbound: async () => ({ ok: true }),
      }
    );

    assert.equal(results[0].sent, true);
    assert.equal(results[0].reply, "We can help.");
  });

  it("holds the reply until typing has been visible", async () => {
    let now = 1_000;
    const sleeps = [];
    const steps = [];

    await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.1",
          customerNumber: "250788000000",
          message: "Hello",
        },
      ],
      {
        typingMinVisibleMs: 2_000,
        nowFn: () => now,
        sleepFn: async (ms) => {
          sleeps.push(ms);
          now += ms;
        },
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        generateReplyFn: async () => {
          now += 200;
          steps.push("groq");
          return { ok: true, reply: "We can help." };
        },
        sendTextMessageFn: async () => {
          steps.push("send");
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
      }
    );

    assert.deepEqual(sleeps, [1_800]);
    assert.deepEqual(steps, ["groq", "send"]);
  });

  it("does not reply to a duplicate inbound message", async () => {
    const steps = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.1",
          customerNumber: "250788000000",
          message: "Hello",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => {
          steps.push("typing");
          return { ok: true };
        },
        persistInbound: async () => ({
          ok: true,
          duplicate: true,
          conversationId: "conv-1",
        }),
        loadHistory: async () => {
          steps.push("history");
          return [];
        },
        generateReplyFn: async () => {
          steps.push("groq");
          return { ok: true, reply: "We can help." };
        },
        sendTextMessageFn: async () => {
          steps.push("send");
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => {
          steps.push("outbound");
          return { ok: true };
        },
      }
    );

    assert.deepEqual(steps, ["typing"]);
    assert.equal(results[0].sent, false);
    assert.equal(results[0].skipped, "duplicate");
  });

  it("downloads a screenshot and replies from the vision model", async () => {
    const steps = [];
    const results = await processTextEvents(
      [
        {
          kind: "image",
          messageId: "wamid.IMG1",
          customerNumber: "250788000000",
          message: "[Screenshot]",
          mediaId: "MEDIA123",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async (event) => {
          steps.push(`inbound:${event.kind}`);
          return { ok: true, conversationId: "conv-1" };
        },
        loadHistory: async () => [],
        downloadMediaFn: async ({ mediaId }) => {
          steps.push(`download:${mediaId}`);
          return { ok: true, dataUrl: "data:image/jpeg;base64,abc" };
        },
        generateReplyFn: async ({ image }) => {
          steps.push(`vision:${Boolean(image && image.dataUrl)}`);
          return { ok: true, reply: "I can see the invoice error." };
        },
        sendTextMessageFn: async () => {
          steps.push("send");
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
      }
    );

    assert.deepEqual(steps, [
      "inbound:image",
      "download:MEDIA123",
      "vision:true",
      "send",
    ]);
    assert.equal(results[0].sent, true);
    assert.equal(results[0].reply, "I can see the invoice error.");
  });

  it("asks the client to resend when the screenshot cannot be opened", async () => {
    const results = await processTextEvents(
      [
        {
          kind: "image",
          messageId: "wamid.IMG1",
          customerNumber: "250788000000",
          message: "[Screenshot]",
          mediaId: "MEDIA123",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        downloadMediaFn: async () => ({ ok: false, error: "api_error" }),
        generateReplyFn: async () => {
          throw new Error("should not generate");
        },
        sendTextMessageFn: async ({ body }) => {
          assert.equal(body, IMAGE_UNREADABLE_REPLY);
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
      }
    );

    assert.equal(results[0].sent, true);
    assert.equal(results[0].reply, IMAGE_UNREADABLE_REPLY);
  });

  it("replies AIMABLE when the special contact sends kimenyi", async () => {
    const steps = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.special",
          customerNumber: "250788880066",
          message: "KIMENYI",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        generateReplyFn: async () => {
          steps.push("groq");
          throw new Error("should not generate");
        },
        sendTextMessageFn: async ({ to, body }) => {
          steps.push(`send:${to}:${body}`);
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
      }
    );

    assert.deepEqual(steps, ["send:250788880066:AIMABLE"]);
    assert.equal(results[0].reply, "AIMABLE");
    assert.equal(results[0].sent, true);
  });

  it("still calls Groq when the client API fails", async () => {
    let receivedContext = "missing";
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.1",
          customerNumber: "250788000000",
          message: "Hello",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        loadClientProfileFn: async () => {
          throw new Error("client api down");
        },
        generateReplyFn: async ({ clientContext }) => {
          receivedContext = clientContext;
          return { ok: true, reply: "We can help." };
        },
        sendTextMessageFn: async () => ({ ok: true, outboundId: "wamid.OUT1" }),
        persistOutbound: async () => ({ ok: true }),
      }
    );

    assert.equal(receivedContext, "");
    assert.equal(results[0].sent, true);
    assert.equal(results[0].reply, "We can help.");
  });
});
