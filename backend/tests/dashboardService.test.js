const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  toConversationSummary,
  toConversationDetail,
  toMessage,
  toStats,
  digitsOnly,
  isUuid,
} = require("../src/services/dashboardService");

describe("dashboardService", () => {
  it("maps a conversation summary for the inbox", () => {
    const summary = toConversationSummary({
      id: "11111111-1111-1111-1111-111111111111",
      status: "open",
      created_at: new Date("2026-08-23T10:00:00.000Z"),
      updated_at: new Date("2026-08-23T10:05:00.000Z"),
      customer_id: "22222222-2222-2222-2222-222222222222",
      whatsapp_number: "250788000000",
      customer_name: "Alex",
      customer_created_at: new Date("2026-08-20T09:00:00.000Z"),
      last_message: "My invoice failed",
      last_sender: "customer",
      last_message_type: "text",
      last_message_at: new Date("2026-08-23T10:05:00.000Z"),
      message_count: 4,
      inbound_count: 2,
      outbound_count: 2,
      image_count: 1,
    });

    assert.equal(summary.customer.name, "Alex");
    assert.equal(summary.customer.whatsappNumber, "250788000000");
    assert.equal(summary.lastSender, "customer");
    assert.equal(summary.counts.inbound, 2);
    assert.equal(summary.counts.images, 1);
  });

  it("maps inbound and outbound send paths", () => {
    const inbound = toMessage({
      id: "m1",
      conversation_id: "c1",
      whatsapp_message_id: "wamid.IN",
      sender_type: "customer",
      message: "Hello",
      message_type: "text",
      created_at: new Date("2026-08-23T10:00:00.000Z"),
    });
    const outbound = toMessage({
      id: "m2",
      conversation_id: "c1",
      whatsapp_message_id: "wamid.OUT",
      sender_type: "assistant",
      message: "I can help.",
      message_type: "text",
      created_at: new Date("2026-08-23T10:00:08.000Z"),
    });

    assert.equal(inbound.senderLabel, "Client");
    assert.deepEqual(inbound.path, ["Client", "WhatsApp", "Server", "Database"]);
    assert.equal(inbound.deliveredToWhatsApp, true);
    assert.equal(outbound.senderLabel, "Assistant");
    assert.deepEqual(outbound.path, ["OpenAI", "Server", "WhatsApp", "Client"]);
    assert.equal(outbound.deliveredToWhatsApp, true);
  });

  it("builds a conversation detail with every message", () => {
    const detail = toConversationDetail(
      {
        id: "c1",
        status: "open",
        created_at: new Date("2026-08-23T10:00:00.000Z"),
        updated_at: new Date("2026-08-23T10:00:00.000Z"),
        customer_id: "cust-1",
        whatsapp_number: "250788000000",
        customer_name: "Alex",
        customer_created_at: new Date("2026-08-20T09:00:00.000Z"),
      },
      [
        {
          id: "m1",
          conversation_id: "c1",
          sender_type: "customer",
          message: "Hello",
          message_type: "text",
          created_at: new Date("2026-08-23T10:00:00.000Z"),
        },
      ],
      { company: "Kigali Mart" }
    );

    assert.equal(detail.counts.messages, 1);
    assert.equal(detail.messages[0].text, "Hello");
    assert.equal(detail.lines[0].from, "Client");
    assert.equal(detail.lines[0].text, "Hello");
    assert.equal(detail.clientProfile.company, "Kigali Mart");
  });

  it("maps dashboard totals", () => {
    const stats = toStats({
      customers: "3",
      conversations: "2",
      open_conversations: "1",
      messages: "9",
      inbound: "5",
      outbound: "4",
      images: "1",
    });

    assert.equal(stats.openConversations, 1);
    assert.equal(stats.inbound, 5);
    assert.equal(stats.outbound, 4);
  });

  it("normalizes phone search and conversation ids", () => {
    assert.equal(digitsOnly("+250 788 000 000"), "250788000000");
    assert.equal(isUuid("11111111-1111-1111-1111-111111111111"), true);
    assert.equal(isUuid("not-a-uuid"), false);
  });
});
