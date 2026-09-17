const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateRepliesForInboundEvents,
  sendGeneratedReplies,
  processTextEvents,
  IMAGE_UNREADABLE_REPLY,
} = require("../src/controllers/webhookController");
const {
  FALLBACK_REPLY,
  ESCALATION_REPLY,
  GREETING_REPLY,
  UNREGISTERED_IDENTITY_REPLY,
} = require("../src/services/openaiService");

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
            clientContext: "CUSTOMER CONTEXT\n- Company: Demo Shop",
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
      "groq:Hello:1:CUSTOMER CONTEXT\n- Company: Demo Shop",
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

  it("sends every contact through CARE lookup and Groq", async () => {
    const steps = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.1",
          customerNumber: "250788880066",
          message: "Hello",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        loadClientProfileFn: async ({ phoneNumber }) => {
          steps.push(`client:${phoneNumber}`);
          return { clientContext: "CUSTOMER CONTEXT\n- Company: Demo Shop" };
        },
        generateReplyFn: async ({ message, clientContext }) => {
          steps.push(`groq:${message}:${clientContext || ""}`);
          return { ok: true, reply: "We can help." };
        },
        sendTextMessageFn: async ({ to, body }) => {
          steps.push(`send:${to}:${body}`);
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
      }
    );

    assert.deepEqual(steps, [
      "client:250788880066",
      "groq:Hello:CUSTOMER CONTEXT\n- Company: Demo Shop",
      "send:250788880066:We can help.",
    ]);
    assert.equal(results[0].reply, "We can help.");
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

  it("greets the customer when Groq fails on a hello", async () => {
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
        generateReplyFn: async () => ({
          ok: false,
          reply: FALLBACK_REPLY,
          error: "api_error",
        }),
        sendTextMessageFn: async ({ body }) => {
          assert.equal(body, GREETING_REPLY);
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
      }
    );

    assert.equal(results[0].reply, GREETING_REPLY);
  });

  it("sends the fallback on the first Groq failure for a real question", async () => {
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.1",
          customerNumber: "250788000000",
          message: "The invoice failed to post",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        generateReplyFn: async () => ({
          ok: false,
          reply: FALLBACK_REPLY,
          error: "api_error",
        }),
        sendTextMessageFn: async ({ body }) => {
          assert.equal(body, FALLBACK_REPLY);
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
      }
    );

    assert.equal(results[0].reply, FALLBACK_REPLY);
  });

  it("escalates after two fallback replies instead of repeating them", async () => {
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.3",
          customerNumber: "250788000000",
          message: "The invoice failed to post",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [
          { role: "assistant", content: FALLBACK_REPLY },
          { role: "user", content: "The invoice failed to post" },
          { role: "assistant", content: FALLBACK_REPLY },
        ],
        generateReplyFn: async () => ({
          ok: false,
          reply: FALLBACK_REPLY,
          error: "api_error",
        }),
        sendTextMessageFn: async ({ body }) => {
          assert.equal(body, ESCALATION_REPLY);
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
        escalateFn: async () => ({
          ok: true,
          customerReply: ESCALATION_REPLY,
        }),
        findOpenEscalationFn: async () => null,
      }
    );

    assert.equal(results[0].reply, ESCALATION_REPLY);
  });

  it("fires a ticket when the reply is ESCALATION_REPLY", async () => {
    const ticketCalls = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.esc",
          customerNumber: "250788000000",
          message: "The invoice failed to post",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [
          { role: "assistant", content: FALLBACK_REPLY },
          { role: "user", content: "still broken" },
          { role: "assistant", content: FALLBACK_REPLY },
        ],
        loadClientProfileFn: async () => ({ clientContext: "" }),
        generateReplyFn: async () => ({
          ok: false,
          reply: FALLBACK_REPLY,
          error: "api_error",
        }),
        sendTextMessageFn: async () => ({ ok: true, outboundId: "wamid.OUT1" }),
        persistOutbound: async () => ({ ok: true }),
        createTicketFn: async (args) => {
          ticketCalls.push(args);
          return { ok: true, ticketId: "TKT-TEST" };
        },
        escalateFn: async (args) => {
          ticketCalls.push(args);
          return { ok: true, ticketCreated: true, customerReply: ESCALATION_REPLY };
        },
        findOpenEscalationFn: async () => null,
      }
    );

    assert.equal(results[0].reply, ESCALATION_REPLY);
    assert.equal(ticketCalls.length, 1);
    assert.equal(ticketCalls[0].reason, "ai_escalation");
    assert.equal(ticketCalls[0].customerNumber, "250788000000");
  });

  it("does not fire a ticket on a normal successful reply", async () => {
    const ticketCalls = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.ok",
          customerNumber: "250788000000",
          message: "How do I add a new product?",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        loadClientProfileFn: async () => ({ clientContext: "" }),
        generateReplyFn: async () => ({
          ok: true,
          reply: "Go to Products → Add New and fill in the details.",
        }),
        sendTextMessageFn: async () => ({ ok: true, outboundId: "wamid.OUT1" }),
        persistOutbound: async () => ({ ok: true }),
        createTicketFn: async (args) => {
          ticketCalls.push(args);
          return { ok: true };
        },
        escalateFn: async (args) => {
          ticketCalls.push(args);
          return { ok: true };
        },
        findOpenEscalationFn: async () => null,
      }
    );

    assert.equal(results[0].sent, true);
    assert.equal(ticketCalls.length, 0);
  });

  it("does not escalate a greeting from an unregistered number", async () => {
    const ticketCalls = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.hello",
          customerNumber: "250792431896",
          message: "Hello",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        loadClientProfileFn: async () => ({
          clientContext: "CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT",
        }),
        generateReplyFn: async () => ({
          ok: true,
          reply: "",
          escalationRequest: {
            summary: "Unrecognized contact",
            why: "Number is not in CARE",
            reason: "unregistered_contact",
          },
        }),
        sendTextMessageFn: async ({ body }) => {
          assert.equal(body, GREETING_REPLY);
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
        escalateFn: async (args) => {
          ticketCalls.push(args);
          return {
            ok: false,
            customerReply: "I couldn't register this request just now. Please try again shortly.",
          };
        },
        findOpenEscalationFn: async () => null,
      }
    );

    assert.equal(results[0].reply, GREETING_REPLY);
    assert.equal(ticketCalls.length, 0);
  });

  it("greets how-are-you instead of opening a ticket", async () => {
    const ticketCalls = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.how",
          customerNumber: "250792431896",
          message: "How are you",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        loadClientProfileFn: async () => ({
          clientContext: "CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT",
        }),
        generateReplyFn: async () => ({
          ok: true,
          reply: "",
          escalationRequest: { summary: "Unknown number" },
        }),
        sendTextMessageFn: async ({ body }) => {
          assert.equal(body, "I'm doing well, thank you 😊 How can I help you?");
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
        escalateFn: async (args) => {
          ticketCalls.push(args);
          return { ok: false, customerReply: "I couldn't register this request just now. Please try again shortly." };
        },
        findOpenEscalationFn: async () => null,
      }
    );

    assert.equal(results[0].reply, "I'm doing well, thank you 😊 How can I help you?");
    assert.equal(ticketCalls.length, 0);
  });

  it("asks an unregistered contact who they are when the model fails", async () => {
    const ticketCalls = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.pos",
          customerNumber: "250792431896",
          message: "I have issues on pos",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        loadClientProfileFn: async () => ({
          clientContext: "CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT",
        }),
        generateReplyFn: async () => ({
          ok: false,
          reply: FALLBACK_REPLY,
          error: "api_error",
        }),
        sendTextMessageFn: async ({ body }) => {
          assert.equal(body, UNREGISTERED_IDENTITY_REPLY);
          return { ok: true, outboundId: "wamid.OUT1" };
        },
        persistOutbound: async () => ({ ok: true }),
        escalateFn: async (args) => {
          ticketCalls.push(args);
          return { ok: false, customerReply: "I couldn't register this request just now. Please try again shortly." };
        },
        findOpenEscalationFn: async () => null,
      }
    );

    assert.equal(results[0].reply, UNREGISTERED_IDENTITY_REPLY);
    assert.equal(ticketCalls.length, 0);
  });

  it("answers Muraho and Umeze neza without opening a ticket", async () => {
    const ticketCalls = [];
    const replies = [];

    for (const message of ["Muraho", "Amakuru yawe?", "Umeze neza?"]) {
      const results = await processTextEvents(
        [
          {
            kind: "text",
            messageId: `wamid.${message}`,
            customerNumber: "250788000000",
            message,
          },
        ],
        {
          typingMinVisibleMs: 0,
          markReadAndShowTypingFn: async () => ({ ok: true }),
          persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
          loadHistory: async () => [],
          generateReplyFn: async () => ({
            ok: false,
            reply: FALLBACK_REPLY,
            error: "api_error",
          }),
          sendTextMessageFn: async ({ body }) => {
            replies.push(body);
            return { ok: true, outboundId: "wamid.OUT1" };
          },
          persistOutbound: async () => ({ ok: true }),
          escalateFn: async (args) => {
            ticketCalls.push(args);
            return { ok: false, customerReply: "I couldn't register this request just now. Please try again shortly." };
          },
          findOpenEscalationFn: async () => null,
        }
      );
      assert.equal(results[0].sent, true);
    }

    assert.match(replies[0], /Muraho/);
    assert.match(replies[1], /Ni meza neza/);
    assert.match(replies[2], /Yego, meze neza/);
    assert.equal(ticketCalls.length, 0);
  });

  it("does not immediately ticket a POS question", async () => {
    const ticketCalls = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.posq",
          customerNumber: "250788000000",
          message: "I have an issue with my POS",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        loadClientProfileFn: async () => ({
          clientContext: "CONTACT STATUS: KNOWN CUSTOMER\nCompany name: Demo Shop",
        }),
        generateReplyFn: async () => ({
          ok: true,
          reply: "What error do you see on the POS?",
        }),
        sendTextMessageFn: async () => ({ ok: true, outboundId: "wamid.OUT1" }),
        persistOutbound: async () => ({ ok: true }),
        escalateFn: async (args) => {
          ticketCalls.push(args);
          return { ok: true, customerReply: ESCALATION_REPLY };
        },
        findOpenEscalationFn: async () => null,
      }
    );

    assert.equal(results[0].reply, "What error do you see on the POS?");
    assert.equal(ticketCalls.length, 0);
  });

  it("escalates when the customer asks someone to check a down POS", async () => {
    const ticketCalls = [];
    const results = await processTextEvents(
      [
        {
          kind: "text",
          messageId: "wamid.poshelp",
          customerNumber: "250788000000",
          message:
            "My POS is completely not working and I need someone to check it.",
        },
      ],
      {
        typingMinVisibleMs: 0,
        markReadAndShowTypingFn: async () => ({ ok: true }),
        persistInbound: async () => ({ ok: true, conversationId: "conv-1" }),
        loadHistory: async () => [],
        loadClientProfileFn: async () => ({
          clientContext: "CONTACT STATUS: KNOWN CUSTOMER\nCompany name: Demo Shop",
        }),
        generateReplyFn: async () => ({
          ok: true,
          reply: ESCALATION_REPLY,
          escalationRequest: {
            summary: "POS completely down",
            why: "Customer asked someone to check it",
          },
        }),
        sendTextMessageFn: async () => ({ ok: true, outboundId: "wamid.OUT1" }),
        persistOutbound: async () => ({ ok: true }),
        escalateFn: async (args) => {
          ticketCalls.push(args);
          return { ok: true, customerReply: ESCALATION_REPLY, agentName: "keanne ishimwe" };
        },
        findOpenEscalationFn: async () => null,
      }
    );

    assert.equal(results[0].reply, ESCALATION_REPLY);
    assert.equal(ticketCalls.length, 1);
  });
});
