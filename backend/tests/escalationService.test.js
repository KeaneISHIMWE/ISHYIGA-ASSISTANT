const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  escalateToSupport,
  resolveByAgent,
  shouldEscalate,
  isCompletionMessage,
  toIssueKey,
  resolvePriority,
  formatAgentNotification,
  parseCompanyFromContext,
  FELLOW_SUPPORT_REPLY,
  FELLOW_SUPPORT_ALREADY_OPEN,
  FELLOW_SUPPORT_FAILED,
} = require("../src/services/escalationService");
const { ESCALATION_REPLY } = require("../src/services/openaiService");
const { env } = require("../src/config/env");

describe("escalation helpers", () => {
  it("reads the company from CARE context", () => {
    assert.equal(
      parseCompanyFromContext("CONTACT STATUS: KNOWN CUSTOMER\nCompany name: TRUSTED PHARMACY LIMITED"),
      "TRUSTED PHARMACY LIMITED"
    );
  });

  it("reuses the same issue key for the same customer problem", () => {
    assert.equal(
      toIssueKey({
        reason: "support_required",
        company: "TRUSTED PHARMACY LIMITED",
        summary: "POS cannot connect to RRA",
      }),
      toIssueKey({
        reason: "support_required",
        company: "TRUSTED PHARMACY LIMITED",
        summary: "POS cannot connect to RRA",
      })
    );
  });

  it("does not mark every ticket high priority", () => {
    assert.equal(resolvePriority("low", "Need a user added"), "low");
    assert.equal(resolvePriority("", "POS is down and we cannot sell"), "high");
  });

  it("recognizes natural completion phrases", () => {
    assert.equal(isCompletionMessage("Done"), true);
    assert.equal(isCompletionMessage("Issue solved"), true);
    assert.equal(isCompletionMessage("Registration completed"), true);
    assert.equal(isCompletionMessage("still checking"), false);
  });

  it("escalates on tool calls and on the fallback reply", () => {
    assert.equal(
      shouldEscalate({
        generated: { ok: true, escalationRequest: { summary: "Need help" } },
      }),
      true
    );
    assert.equal(
      shouldEscalate({ generated: { ok: true, reply: ESCALATION_REPLY } }),
      true
    );
    assert.equal(
      shouldEscalate({ generated: { ok: true, reply: "How can I help?" } }),
      false
    );
    assert.equal(
      shouldEscalate({
        message: "Hello",
        generated: { ok: true, escalationRequest: { summary: "Unknown number" } },
        clientContext: "CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT",
      }),
      false
    );
    assert.equal(
      shouldEscalate({
        message: "Hello",
        generated: { ok: false, reply: "Hello 👋" },
        clientContext: "CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT",
      }),
      false
    );
    assert.equal(
      shouldEscalate({
        message: "How are you",
        generated: { ok: true, escalationRequest: { summary: "Unknown number" } },
        clientContext: "CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT",
      }),
      false
    );
    assert.equal(
      shouldEscalate({
        message: "i want your help",
        generated: { ok: true, escalationRequest: { summary: "Customer asked for help" } },
        clientContext: "CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT",
      }),
      false
    );
    assert.equal(
      shouldEscalate({
        message: "POS is down at keanne pharmacy",
        generated: { ok: true, escalationRequest: { summary: "POS down" } },
        clientContext: "CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT",
      }),
      true
    );
  });
});

describe("escalateToSupport", () => {
  it("creates a ticket, notifies the agent, and uses fellow-support wording", async () => {
    const tickets = [];
    const messages = [];
    const previousNotify = env.supportNotifyWhatsapp;
    env.supportNotifyWhatsapp = "+250798687932";
    let result;
    try {
    result = await escalateToSupport({
      conversationId: "conv-1",
      customerNumber: "250788000000",
      message: "POS cannot connect to RRA",
      clientContext: "CONTACT STATUS: KNOWN CUSTOMER\nCompany name: TRUSTED PHARMACY LIMITED",
      summary: "POS cannot connect to RRA",
      why: "Needs configuration help",
      createTicketFn: async (payload) => {
        tickets.push(payload);
        return { ok: true, ticketId: "TKT-22" };
      },
      sendTextMessageFn: async (payload) => {
        messages.push(payload);
        return { ok: true, outboundId: "wamid.1" };
      },
      findAssignedAgentFn: async () => ({
        support_agent: "Uwimanikunda lucie",
        clients_count: 44,
      }),
      findOpenByIssueFn: async () => null,
      createEscalationFn: async (row) => ({ id: "esc-1", ...row }),
      updateEscalationFn: async () => ({ id: "esc-1" }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.ticketCreated, true);
    assert.equal(result.customerReply, FELLOW_SUPPORT_REPLY);
    assert.equal(tickets[0].company, "TRUSTED PHARMACY LIMITED");
    assert.equal(tickets[0].agentName, "Uwimanikunda lucie");
    assert.match(messages[0].body, /TRUSTED PHARMACY LIMITED/);
    assert.match(messages[0].body, /TKT-22/);
    } finally {
      env.supportNotifyWhatsapp = previousNotify;
    }
  });

  it("reuses an open ticket instead of creating another", async () => {
    const result = await escalateToSupport({
      customerNumber: "250788000000",
      message: "still broken",
      summary: "POS cannot connect to RRA",
      clientContext: "Company name: TRUSTED PHARMACY LIMITED",
      createTicketFn: async () => {
        throw new Error("should not create");
      },
      findOpenByIssueFn: async () => ({
        ticket_id: "TKT-22",
        status: "WAITING_FOR_SUPPORT",
        agent_name: "Uwimanikunda lucie",
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.reused, true);
    assert.equal(result.customerReply, FELLOW_SUPPORT_ALREADY_OPEN);
  });

  it("still notifies the agent when VIBE ticket creation fails", async () => {
    const previousNotify = env.supportNotifyWhatsapp;
    env.supportNotifyWhatsapp = "+250792431896";
    const messages = [];
    let result;
    try {
      result = await escalateToSupport({
        customerNumber: "250788000000",
        message: "Need help",
        findOpenByIssueFn: async () => null,
        findAssignedAgentFn: async () => ({ support_agent: "keanne ishimwe" }),
        createTicketFn: async () => ({ ok: false, error: "not_configured" }),
        createEscalationFn: async (row) => ({ id: "esc-2", ...row }),
        updateEscalationFn: async () => ({ id: "esc-2" }),
        sendTextMessageFn: async (payload) => {
          messages.push(payload);
          return { ok: true, outboundId: "wamid.1" };
        },
      });
    } finally {
      env.supportNotifyWhatsapp = previousNotify;
    }

    assert.equal(result.ok, true);
    assert.equal(result.ticketCreated, false);
    assert.equal(result.notified, true);
    assert.equal(result.customerReply, FELLOW_SUPPORT_REPLY);
    assert.equal(messages.length, 1);
  });
});

describe("resolveByAgent", () => {
  it("marks the open ticket resolved on a Done message", async () => {
    const result = await resolveByAgent({
      message: "Done",
      findLatestWaitingFn: async () => ({
        id: "esc-1",
        ticket_id: "TKT-22",
        customer_number: "250788000000",
      }),
      updateEscalationFn: async (id, fields) => {
        assert.equal(id, "esc-1");
        assert.equal(fields.status, "RESOLVED");
        return { id, status: "RESOLVED" };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.ticketId, "TKT-22");
  });

  it("asks for context when no open ticket exists", async () => {
    const result = await resolveByAgent({
      message: "Resolved",
      findLatestWaitingFn: async () => null,
    });
    assert.equal(result.ok, false);
    assert.match(result.agentReply, /could not match/i);
  });
});

describe("formatAgentNotification", () => {
  it("keeps the WhatsApp note short", () => {
    const body = formatAgentNotification({
      agentName: "Uwimanikunda lucie",
      company: "TRUSTED PHARMACY LIMITED",
      summary: "POS cannot connect to RRA",
      priority: "high",
      ticketId: "1234",
    });
    assert.match(body, /Hello Uwimanikunda/);
    assert.match(body, /Priority: high/);
    assert.doesNotMatch(body, /human support/i);
  });
});
