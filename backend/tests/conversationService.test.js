const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  persistInboundEvent,
  persistOutboundReply,
  toChatHistory,
  loadRecentHistory,
} = require("../src/services/conversationService");

describe("persistInboundEvent", () => {
  it("creates a customer, open conversation, and inbound message", async () => {
    const calls = [];
    const result = await persistInboundEvent(
      {
        kind: "text",
        customerNumber: "250788000000",
        customerName: "Alex",
        messageId: "wamid.1",
        message: "Hello",
        messageType: "text",
      },
      {
        findOrCreateCustomer: async (input) => {
          calls.push(["customer", input]);
          return { id: "cust-1" };
        },
        findOrCreateOpenConversation: async (input) => {
          calls.push(["conversation", input]);
          return { id: "conv-1" };
        },
        createMessage: async (input) => {
          calls.push(["message", input]);
          return { id: "msg-1" };
        },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.customerId, "cust-1");
    assert.equal(result.conversationId, "conv-1");
    assert.equal(calls[2][1].senderType, "customer");
    assert.equal(calls[2][1].message, "Hello");
  });

  it("returns persist_failed without throwing when storage fails", async () => {
    const result = await persistInboundEvent(
      {
        kind: "text",
        customerNumber: "250788000000",
        messageId: "wamid.1",
        message: "Hello",
      },
      {
        findOrCreateCustomer: async () => {
          throw new Error("db down");
        },
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.error, "persist_failed");
  });
});

describe("persistOutboundReply", () => {
  it("stores an assistant message", async () => {
    const calls = [];
    const result = await persistOutboundReply(
      {
        conversationId: "conv-1",
        reply: "We can help with the company's services.",
        outboundId: "wamid.OUT1",
      },
      {
        createMessage: async (input) => {
          calls.push(input);
          return { id: "msg-2" };
        },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(calls[0].senderType, "assistant");
    assert.equal(calls[0].whatsappMessageId, "wamid.OUT1");
  });
});

describe("toChatHistory", () => {
  it("maps customer and assistant rows and skips the current inbound id", () => {
    const history = toChatHistory(
      [
        {
          sender_type: "customer",
          message: "Hello",
          whatsapp_message_id: "wamid.1",
        },
        {
          sender_type: "assistant",
          message: "Hi. How can I help?",
          whatsapp_message_id: "wamid.OUT1",
        },
        {
          sender_type: "customer",
          message: "What services do you offer?",
          whatsapp_message_id: "wamid.2",
        },
      ],
      { excludeWhatsappMessageId: "wamid.2" }
    );

    assert.deepEqual(history, [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi. How can I help?" },
    ]);
  });

  it("keeps the full conversation instead of the last ten turns", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      sender_type: index % 2 === 0 ? "customer" : "assistant",
      message: `turn ${index + 1}`,
      whatsapp_message_id: `wamid.${index + 1}`,
    }));

    const history = toChatHistory(rows);

    assert.equal(history.length, 12);
    assert.equal(history[0].content, "turn 1");
    assert.equal(history[11].content, "turn 12");
  });
});

describe("loadRecentHistory", () => {
  it("returns an empty list when history cannot be loaded", async () => {
    const history = await loadRecentHistory("conv-1", {
      listMessages: async () => {
        throw new Error("db down");
      },
    });

    assert.deepEqual(history, []);
  });
});
