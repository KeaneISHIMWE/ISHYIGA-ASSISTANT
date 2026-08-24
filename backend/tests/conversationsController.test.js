const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  listConversations,
  getConversation,
  getOverview,
} = require("../src/controllers/conversationsController");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("conversationsController", () => {
  it("lists conversations for the inbox", async () => {
    const res = mockRes();
    await listConversations(
      { query: { phone: "+250 788 000 000" } },
      res,
      {
        listSummaries: async ({ phoneDigits }) => {
          assert.equal(phoneDigits, "250788000000");
          return [
            {
              id: "11111111-1111-1111-1111-111111111111",
              status: "open",
              created_at: new Date("2026-08-23T10:00:00.000Z"),
              updated_at: new Date("2026-08-23T10:00:00.000Z"),
              customer_id: "22222222-2222-2222-2222-222222222222",
              whatsapp_number: "250788000000",
              customer_name: "Alex",
              customer_created_at: new Date("2026-08-20T09:00:00.000Z"),
              last_message: "Hello",
              last_sender: "customer",
              last_message_type: "text",
              last_message_at: new Date("2026-08-23T10:00:00.000Z"),
              message_count: 1,
              inbound_count: 1,
              outbound_count: 0,
              image_count: 0,
            },
          ];
        },
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.conversations.length, 1);
    assert.equal(res.body.conversations[0].customer.name, "Alex");
  });

  it("returns a conversation with every stored message", async () => {
    const res = mockRes();
    await getConversation(
      { params: { id: "11111111-1111-1111-1111-111111111111" } },
      res,
      {
        findByIdWithCustomer: async () => ({
          id: "11111111-1111-1111-1111-111111111111",
          status: "open",
          created_at: new Date("2026-08-23T10:00:00.000Z"),
          updated_at: new Date("2026-08-23T10:00:00.000Z"),
          customer_id: "cust-1",
          whatsapp_number: "250788000000",
          customer_name: "Alex",
          customer_created_at: new Date("2026-08-20T09:00:00.000Z"),
        }),
        listMessages: async () => [
          {
            id: "m1",
            conversation_id: "11111111-1111-1111-1111-111111111111",
            sender_type: "customer",
            message: "Hello",
            message_type: "text",
            created_at: new Date("2026-08-23T10:00:00.000Z"),
          },
        ],
        loadClientProfileFn: async () => ({
          profile: { company: "Kigali Mart" },
        }),
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.conversation.messages[0].text, "Hello");
    assert.equal(res.body.conversation.clientProfile.company, "Kigali Mart");
  });

  it("rejects an invalid conversation id", async () => {
    const res = mockRes();
    await getConversation({ params: { id: "bad" } }, res, {
      findByIdWithCustomer: async () => {
        throw new Error("should not query");
      },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "Invalid conversation id");
  });

  it("returns dashboard totals", async () => {
    const res = mockRes();
    await getOverview({}, res, {
      getStats: async () => ({
        customers: 2,
        conversations: 2,
        open_conversations: 1,
        messages: 6,
        inbound: 3,
        outbound: 3,
        images: 1,
      }),
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.stats.messages, 6);
    assert.equal(res.body.stats.openConversations, 1);
  });
});
