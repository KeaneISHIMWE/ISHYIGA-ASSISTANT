const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  assessPhoneRegistration,
  createPhoneRegistrationTicket,
  resolvePhoneRegistration,
  applyPhoneRegistration,
} = require("../src/services/phoneRegistrationTicket");

const READY_MESSAGE =
  "My name is Jane. Company is Kigali Mart. Please add this number. The registered phone is 0781111111.";

describe("assessPhoneRegistration", () => {
  it("does not treat other support issues as a phone registration", () => {
    const decision = assessPhoneRegistration({
      message: "My stock is wrong and I already paid invoice 12.",
      phone: "250788000000",
      customerName: "Alex",
    });

    assert.equal(decision.intent, false);
    assert.equal(decision.ready, false);
  });

  it("is ready only when the number should be added and the details are present", () => {
    const decision = assessPhoneRegistration({
      message: READY_MESSAGE,
      phone: "250788000000",
    });

    assert.equal(decision.ready, true);
    assert.equal(decision.details.clientName, "Jane");
    assert.equal(decision.details.clientCompany, "Kigali Mart");
    assert.equal(decision.details.registeredPhone, "250781111111");
    assert.equal(decision.details.whatsappPhone, "250788000000");
  });

  it("waits when the company is still missing", () => {
    const decision = assessPhoneRegistration({
      message: "My name is Jane. Please add this number.",
      phone: "250788000000",
    });

    assert.equal(decision.intent, true);
    assert.equal(decision.ready, false);
  });
});

describe("createPhoneRegistrationTicket", () => {
  it("posts only the registration request with the ticket API key", async () => {
    let called = null;
    const result = await createPhoneRegistrationTicket(
      {
        whatsappPhone: "250788000000",
        clientName: "Jane",
        clientCompany: "Kigali Mart",
        registeredPhone: "250781111111",
      },
      {
        apiKey: "test-ticket-key",
        baseUrl: "https://ishyiga.rw/care",
        fetchFn: async (url, options) => {
          called = { url: String(url), options };
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ ticketId: "T-9", success: true }),
          };
        },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.ticketId, "T-9");
    const url = new URL(called.url);
    assert.equal(url.pathname, "/care/api/client-portal/create-ticket");
    assert.match(url.searchParams.get("message"), /register or add/);
    assert.equal(url.searchParams.get("clientName"), "Jane");
    assert.equal(called.options.method, "POST");
    assert.equal(called.options.headers["X-Client-Api-Key"], "test-ticket-key");
  });
});

describe("resolvePhoneRegistration", () => {
  it("does not call the ticket API for a normal question", async () => {
    let created = false;
    const result = await resolvePhoneRegistration({
      message: "My POS will not open.",
      phone: "250788000000",
      conversationId: "conv-1",
      loadTicket: async () => null,
      createTicket: async () => {
        created = true;
        return { ok: true, ticketId: "T-1" };
      },
    });

    assert.equal(created, false);
    assert.equal(result.reply, null);
    assert.match(result.contextNote, /NOT CREATED/);
  });

  it("creates a ticket and says an agent will add the number", async () => {
    const saved = [];
    const result = await resolvePhoneRegistration({
      message: READY_MESSAGE,
      phone: "250788000000",
      conversationId: "conv-1",
      loadTicket: async () => null,
      saveTicket: async (conversationId, ticketId) => {
        saved.push({ conversationId, ticketId });
      },
      createTicket: async () => ({ ok: true, ticketId: "T-9" }),
    });

    assert.deepEqual(saved, [{ conversationId: "conv-1", ticketId: "T-9" }]);
    assert.match(result.reply, /support agent will add it/);
    assert.doesNotMatch(result.reply, /escalated|resolved/i);
  });

  it("does not promise an agent when the ticket API fails", async () => {
    const result = await resolvePhoneRegistration({
      message: READY_MESSAGE,
      phone: "250788000000",
      conversationId: "conv-1",
      loadTicket: async () => null,
      saveTicket: async () => {
        throw new Error("should not save");
      },
      createTicket: async () => ({ ok: false, error: "rejected" }),
    });

    assert.match(result.reply, /could not submit/i);
    assert.doesNotMatch(result.reply, /support agent|escalated|resolved/i);
  });

  it("tells a returning client that human support has not assisted yet", async () => {
    let created = false;
    const result = await resolvePhoneRegistration({
      message: "Any update?",
      history: [{ role: "user", content: READY_MESSAGE }],
      phone: "250788000000",
      conversationId: "conv-1",
      loadTicket: async () => ({ registration_ticket_id: "T-9" }),
      createTicket: async () => {
        created = true;
        return { ok: true, ticketId: "T-10" };
      },
    });

    assert.equal(created, false);
    assert.match(result.reply, /has not assisted you yet/i);
    assert.match(result.reply, /still not registered/i);
    assert.doesNotMatch(result.reply, /escalated|resolved/i);
  });
});

describe("applyPhoneRegistration", () => {
  it("leaves known customers on the normal reply path", async () => {
    let called = false;
    const result = await applyPhoneRegistration({
      lookup: { error: null, clientContext: "CONTACT STATUS: KNOWN CUSTOMER" },
      message: READY_MESSAGE,
      phone: "250788000000",
      resolveFn: async () => {
        called = true;
        return { reply: "should not run" };
      },
    });

    assert.equal(called, false);
    assert.equal(result.reply, null);
    assert.match(result.clientContext, /KNOWN CUSTOMER/);
  });
});
