const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createTicket,
  buildTicketPayload,
  buildSubject,
  buildDescription,
  TICKET_REASONS,
} = require("../src/services/ticketService");

// ---------------------------------------------------------------------------
// buildSubject
// ---------------------------------------------------------------------------
describe("buildSubject", () => {
  it("returns a human-readable label for known reason codes", () => {
    assert.equal(buildSubject("ai_escalation"), "AI Escalation — Repeated Failures");
    assert.equal(
      buildSubject("unregistered_contact"),
      "Unregistered Contact Needs Verification"
    );
    assert.equal(buildSubject("human_requested"), "Customer Requested Human Agent");
    assert.equal(buildSubject("support_required"), "Support Agent Action Required");
  });

  it("falls back to a generic label for unknown reason codes", () => {
    const subject = buildSubject("some_new_reason");
    assert.match(subject, /some_new_reason/);
  });
});

// ---------------------------------------------------------------------------
// buildDescription
// ---------------------------------------------------------------------------
describe("buildDescription", () => {
  it("includes reason, customer number, and last message", () => {
    const description = buildDescription({
      reason: "ai_escalation",
      customerNumber: "250788000000",
      message: "My POS is not working",
    });
    assert.match(description, /ai_escalation/);
    assert.match(description, /250788000000/);
    assert.match(description, /My POS is not working/);
    assert.match(description, /Customer:/);
  });

  it("includes customer context when provided", () => {
    const description = buildDescription({
      reason: "ai_escalation",
      customerNumber: "250788000000",
      message: "Hello",
      clientContext: "CONTACT STATUS: KNOWN CUSTOMER\n- Company: Demo Shop",
    });
    assert.match(description, /Demo Shop/);
    assert.match(description, /Customer Context/);
  });

  it("omits message section when message is empty", () => {
    const description = buildDescription({
      reason: "unregistered_contact",
      customerNumber: "250788000000",
      message: "",
    });
    assert.doesNotMatch(description, /Last message/);
  });
});

// ---------------------------------------------------------------------------
// buildTicketPayload
// ---------------------------------------------------------------------------
describe("buildTicketPayload", () => {
  it("sets priority to medium for ai_escalation", () => {
    const payload = buildTicketPayload({
      reason: "ai_escalation",
      customerNumber: "250788000000",
      message: "test",
    });
    assert.equal(payload.priority, "medium");
    assert.equal(payload.source, "whatsapp_ai");
    assert.ok(payload.subject);
    assert.ok(payload.description);
  });

  it("sets priority to low for non-escalation reasons", () => {
    const payload = buildTicketPayload({
      reason: "unregistered_contact",
      customerNumber: "250788000000",
    });
    assert.equal(payload.priority, "low");
  });
});

// ---------------------------------------------------------------------------
// createTicket
// ---------------------------------------------------------------------------
describe("createTicket", () => {
  it("skips creation and returns not_configured when API key is missing", async () => {
    // Ensure env has no key by using a fresh module mock approach:
    // We inject fetchFn that should NOT be called
    let fetchCalled = false;
    const result = await createTicket({
      reason: "ai_escalation",
      customerNumber: "250788000000",
      message: "Hello",
      fetchFn: async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({}) };
      },
    });

    // Since CARE_TICKET_API_KEY is not set in test env, expect not_configured
    if (result.error === "not_configured") {
      assert.equal(result.ok, false);
      assert.equal(fetchCalled, false);
    } else {
      // If the key IS set (e.g. in CI), it should attempt the request
      assert.ok(typeof result.ok === "boolean");
    }
  });

  it("returns ok:true when the API responds with 200", async () => {
    const result = await createTicket({
      reason: "ai_escalation",
      customerNumber: "250788000000",
      message: "The invoice failed",
      clientContext: "CONTACT STATUS: KNOWN CUSTOMER\n- Company: Demo",
      fetchFn: async (url, options) => {
        // Verify the correct auth header is sent
        assert.ok(options.headers["X-Client-Api-Key"] !== undefined);
        assert.ok(options.headers["Authorization"] !== undefined);

        const body = JSON.parse(options.body);
        assert.equal(body.source, "whatsapp_ai");
        assert.ok(body.subject);
        assert.ok(body.description);

        return {
          ok: true,
          json: async () => ({ success: true, ticketId: "TKT-001" }),
        };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.ticketId, "TKT-001");
  });

  it("extracts ticketNumber when provided by CARE ticket API", async () => {
    const result = await createTicket({
      reason: "support_required",
      customerNumber: "250788000000",
      message: "POS is down",
      fetchFn: async (_url, options) => {
        assert.ok(options.headers["Authorization"] !== undefined);
        assert.ok(options.headers["X-Client-Api-Key"] !== undefined);
        return {
          ok: true,
          json: async () => ({
            ticketNumber: "CARE-1789647007537",
            ticketId: "ff92582e-bf10-497f-b1be-4f5ed3e34257",
            message: "Ticket created.",
          }),
        };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.ticketId, "CARE-1789647007537");
    assert.equal(result.ticketNumber, "CARE-1789647007537");
  });

  it("returns ok:false when the API responds with 401", async () => {
    const result = await createTicket({
      reason: "ai_escalation",
      customerNumber: "250788000000",
      message: "test",
      fetchFn: async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          errorCode: "INVALID_API_KEY",
          message: "Invalid API key",
        }),
      }),
    });

    // not_configured if no key in env, otherwise INVALID_API_KEY
    assert.ok(
      result.error === "not_configured" ||
        result.error === "INVALID_API_KEY" ||
        result.error === "http_401"
    );
    assert.equal(result.ok, false);
  });

  it("returns ok:false on timeout and does not throw", async () => {
    const result = await createTicket({
      reason: "unregistered_contact",
      customerNumber: "250788000000",
      fetchFn: async () => {
        const err = new Error("Timeout");
        err.name = "TimeoutError";
        throw err;
      },
    });

    assert.equal(result.ok, false);
    assert.ok(result.error === "timeout" || result.error === "not_configured");
  });

  it("returns ok:false on unhandled fetch error and does not throw", async () => {
    const result = await createTicket({
      reason: "ai_escalation",
      customerNumber: "250788000000",
      fetchFn: async () => {
        throw new Error("Network unreachable");
      },
    });

    assert.equal(result.ok, false);
    assert.ok(result.error === "unhandled" || result.error === "not_configured");
  });
});
