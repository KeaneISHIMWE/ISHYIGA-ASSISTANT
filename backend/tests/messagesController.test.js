const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createMessage,
  describeMessageApi,
} = require("../src/controllers/messagesController");

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

describe("describeMessageApi", () => {
  it("tells the client to POST a JSON body", () => {
    const res = mockRes();
    describeMessageApi({}, res);
    assert.equal(res.statusCode, 405);
    assert.match(res.body.error, /POST \/api\/messages/);
    assert.equal(res.body.example.message.includes("Hello"), true);
  });
});

describe("createMessage", () => {
  it("rejects a missing message", async () => {
    const res = mockRes();
    await createMessage({ body: {} }, res, {
      generateReplyFn: async () => {
        throw new Error("should not generate");
      },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "message is required");
  });

  it("returns an assistant reply for a client message", async () => {
    const res = mockRes();
    await createMessage(
      { body: { message: "Hello, what services do you offer?" } },
      res,
      {
        generateReplyFn: async ({ message, history }) => {
          assert.equal(message, "Hello, what services do you offer?");
          assert.deepEqual(history, []);
          return { ok: true, reply: "We can help with the company's services." };
        },
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.match(res.body.reply, /services/);
    assert.equal(res.body.conversationId, null);
    assert.equal(res.body.lines[0].from, "Client");
    assert.equal(res.body.lines[1].from, "Assistant");
  });

  it("saves the chat when a phone number is sent", async () => {
    const steps = [];
    const res = mockRes();
    await createMessage(
      {
        body: {
          message: "Hello",
          phone: "0788000000",
          name: "Alex",
        },
      },
      res,
      {
        persistInbound: async (event) => {
          steps.push(`inbound:${event.customerNumber}:${event.message}`);
          return { ok: true, conversationId: "conv-1" };
        },
        loadHistory: async (conversationId) => {
          steps.push(`history:${conversationId}`);
          return [{ role: "assistant", content: "Welcome back." }];
        },
        loadClientProfileFn: async ({ phoneNumber }) => {
          steps.push(`client:${phoneNumber}`);
          return { clientContext: "CUSTOMER CONTEXT\n- Company: Demo Shop" };
        },
        generateReplyFn: async ({ history, clientContext }) => {
          steps.push(`groq:${history.length}:${clientContext}`);
          return { ok: true, reply: "Hello Alex." };
        },
        persistOutbound: async (input) => {
          steps.push(`outbound:${input.conversationId}:${input.reply}`);
          return { ok: true };
        },
      }
    );

    assert.deepEqual(steps, [
      "inbound:250788000000:Hello",
      "history:conv-1",
      "client:250788000000",
      "groq:1:CUSTOMER CONTEXT\n- Company: Demo Shop",
      "outbound:conv-1:Hello Alex.",
    ]);
    assert.equal(res.body.conversationId, "conv-1");
    assert.deepEqual(res.body.lines, [
      { from: "Assistant", text: "Welcome back." },
      { from: "Client", text: "Hello" },
      { from: "Assistant", text: "Hello Alex." },
    ]);
  });
});
