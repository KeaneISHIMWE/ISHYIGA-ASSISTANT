const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { toCanonicalWhatsappDigits } = require("./contactRules");
const { toAgentId } = require("./supportService");
const supportModel = require("../models/support");
const escalationModel = require("../models/escalation");
const { createTicket } = require("./ticketService");
const { sendTextMessage } = require("./whatsappService");
const {
  ESCALATION_REPLY,
  isGreetingOnly,
  hasIdentityDetails,
} = require("./openaiService");
const {
  classifyIntent,
  INTENTS,
  isActionRequiredIntent,
} = require("./intentService");

const FELLOW_SUPPORT_REPLY =
  "I've sent your request to my fellow support so they can assist you.";
const FELLOW_SUPPORT_REGISTRATION =
  "I've sent your request to my fellow support so they can register and verify your contact.";
const FELLOW_SUPPORT_ALREADY_OPEN =
  "My fellow support is already looking into this. I'll stay with you in the meantime.";
const FELLOW_SUPPORT_FAILED =
  "I couldn't register this request just now. Please try again shortly.";
const AGENT_DONE_ACK =
  "Thank you. I have marked this request as handled.";
const AGENT_DONE_UNKNOWN =
  "I could not match that to an open support request. Please send the customer name or ticket number.";
const CUSTOMER_RESOLVED_REPLY =
  "My fellow support has handled the request. How else can I help you?";

const COMPLETION_PATTERN =
  /\b(done|finished|resolved|fixed|issue solved|customer is okay|i have fixed it|i helped|registration completed|completed)\b/i;

const HIGH_PRIORITY_PATTERN =
  /\b(blocked|cannot sell|can't sell|pos (is )?down|rra|ebm down|urgent|not functioning|completely down|invoice (failed|blocked))\b/i;

function parseCompanyFromContext(clientContext) {
  const text = String(clientContext || "");
  const match = text.match(/Company name:\s*(.+)/i);
  return match ? match[1].trim() : "";
}

function isUnregisteredContext(clientContext) {
  return String(clientContext || "").includes(
    "CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT"
  );
}

function toIssueKey({ reason, company, summary }) {
  const raw = [reason || "", company || "", summary || ""]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return raw.slice(0, 120) || reason || "support_required";
}

function resolvePriority(requested, text) {
  const wanted = String(requested || "").trim().toLowerCase();
  if (wanted === "high" || wanted === "medium" || wanted === "low") {
    if (wanted === "high") {
      return HIGH_PRIORITY_PATTERN.test(String(text || "")) ? "high" : wanted;
    }
    return wanted;
  }

  if (HIGH_PRIORITY_PATTERN.test(String(text || ""))) {
    return "high";
  }

  return "medium";
}

function getNotifyNumber() {
  return toCanonicalWhatsappDigits(env.supportNotifyWhatsapp);
}

function isAgentNumber(phoneNumber) {
  const notify = getNotifyNumber();
  const incoming = toCanonicalWhatsappDigits(phoneNumber);
  return Boolean(notify && incoming && notify === incoming);
}

function isCompletionMessage(message) {
  return COMPLETION_PATTERN.test(String(message || ""));
}

function formatOpenTicketContext(row) {
  if (!row) {
    return "";
  }

  return [
    "OPEN SUPPORT REQUEST",
    row.ticket_id ? `Ticket: ${row.ticket_id}` : null,
    `Status: ${row.status}`,
    row.agent_name ? `Assigned agent: ${row.agent_name}` : "Assigned agent: not found",
    row.issue_summary ? `Issue: ${row.issue_summary}` : null,
    "Do not create another ticket for this same unresolved issue. Continue helping with anything else you can safely handle.",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatAgentNotification({
  agentName,
  company,
  summary,
  priority,
  ticketId,
}) {
  const firstName = agentName ? agentName.split(" ")[0] : "";
  const greeting = firstName ? `Hello ${firstName} 👋` : "Hello 👋";
  const clientName = company || "a customer";
  const ticketLine = ticketId ? `VIBE Ticket: ${ticketId}` : "VIBE Ticket: pending reference";
  const priorityLabel = priority === "high" ? "High" : priority === "low" ? "Low" : "Normal";

  return [
    greeting,
    "",
    `You have a support request from ${clientName}.`,
    "",
    `Issue: ${summary || "The client needs assistance I cannot perform directly."}`,
    ticketLine,
    `Priority: ${priorityLabel}`,
    "",
    "Please assist the client and let me know once it is completed.",
  ].join("\n");
}

async function findAssignedAgent({ company, customerNumber }) {
  try {
    return await supportModel.findAssignedAgent({
      client: company,
      contact: customerNumber,
    });
  } catch (error) {
    logger.error("Support agent lookup failed", {
      error: error && error.message ? String(error.message).slice(0, 120) : "unhandled",
    });
    return null;
  }
}

async function escalateToSupport({
  conversationId,
  customerNumber,
  message,
  clientContext,
  reason,
  summary,
  why,
  tried,
  priority,
  createTicketFn = createTicket,
  sendTextMessageFn = sendTextMessage,
  findAssignedAgentFn = findAssignedAgent,
  findOpenByIssueFn = escalationModel.findOpenByIssue,
  createEscalationFn = escalationModel.create,
  updateEscalationFn = escalationModel.update,
} = {}) {
  const company = parseCompanyFromContext(clientContext);
  const resolvedReason =
    reason ||
    (isUnregisteredContext(clientContext)
      ? "unregistered_contact"
      : "support_required");
  const issueSummary =
    (summary && String(summary).trim()) ||
    (message && String(message).trim()) ||
    "Support intervention required";
  const issueKey = toIssueKey({
    reason: resolvedReason,
    company,
    summary: issueSummary,
  });
  const resolvedPriority = resolvePriority(
    priority,
    `${issueSummary} ${message || ""} ${why || ""}`
  );

  const existing = await findOpenByIssueFn({
    customerNumber,
    issueKey,
  });

  if (existing) {
    logger.info("Escalation reused existing ticket", {
      ticketId: existing.ticket_id || "unknown",
      status: existing.status,
    });
    return {
      ok: true,
      reused: true,
      ticketCreated: false,
      notified: false,
      ticketId: existing.ticket_id || null,
      agentName: existing.agent_name || null,
      customerReply: FELLOW_SUPPORT_ALREADY_OPEN,
      escalation: existing,
    };
  }

  const assigned = await findAssignedAgentFn({
    company,
    customerNumber,
  });
  const agentName = assigned && assigned.support_agent ? assigned.support_agent : null;
  const agentId = agentName ? toAgentId(agentName) : null;
  const notifyNumber = getNotifyNumber();

  if (!agentName) {
    logger.warn("No assigned support agent found", {
      company: company || "unknown",
      customer: customerNumber
        ? `${String(customerNumber).slice(0, 3)}***${String(customerNumber).slice(-3)}`
        : "unknown",
    });
  }

  const ticket = await createTicketFn({
    reason: resolvedReason,
    customerNumber,
    message,
    clientContext,
    company,
    agentName,
    agentId,
    summary: issueSummary,
    why,
    tried,
    actionRequired: why || "Support agent should assist the customer.",
    priority: resolvedPriority,
  });

  const ticketOk = Boolean(ticket && ticket.ok);
  if (!ticketOk) {
    logger.error("Escalation ticket creation failed", {
      error: ticket && ticket.error ? ticket.error : "unknown",
    });
  }

  let row;
  try {
    row = await createEscalationFn({
      conversationId,
      customerNumber,
      company,
      issueKey,
      issueSummary,
      reason: resolvedReason,
      priority: resolvedPriority,
      status: ticketOk ? "TICKET_CREATED" : "WAITING_FOR_SUPPORT",
      ticketId: ticketOk ? ticket.ticketId || null : null,
      agentId,
      agentName,
      notifyNumber: notifyNumber || null,
    });
  } catch (error) {
    if (escalationModel.isUniqueViolation(error)) {
      const open = await findOpenByIssueFn({ customerNumber, issueKey });
      return {
        ok: true,
        reused: true,
        ticketCreated: false,
        notified: false,
        ticketId: open && open.ticket_id,
        agentName: open && open.agent_name,
        customerReply: FELLOW_SUPPORT_ALREADY_OPEN,
        escalation: open,
      };
    }

    logger.error("Escalation state save failed", {
      error: error && error.message ? String(error.message).slice(0, 120) : "unhandled",
    });
  }

  let notified = false;
  if (notifyNumber) {
    try {
      const sent = await sendTextMessageFn({
        to: notifyNumber,
        body: formatAgentNotification({
          agentName,
          company,
          summary: issueSummary,
          priority: resolvedPriority,
          ticketId: ticketOk ? ticket.ticketId : null,
        }),
      });
      notified = Boolean(sent && sent.ok);
      if (!notified) {
        logger.error("Support agent WhatsApp notification failed", {
          error: sent && sent.error ? sent.error : "unknown",
          ticketId: ticketOk && ticket.ticketId ? ticket.ticketId : "unknown",
        });
      }
    } catch (error) {
      logger.error("Support agent WhatsApp notification failed", {
        error: error && error.message ? String(error.message).slice(0, 120) : "unhandled",
        ticketId: ticketOk && ticket.ticketId ? ticket.ticketId : "unknown",
      });
    }
  } else if (!notifyNumber) {
    logger.warn("Support agent WhatsApp notification skipped — SUPPORT_NOTIFY_WHATSAPP is not configured");
  }

  if (row && row.id) {
    await updateEscalationFn(row.id, {
      status: notified ? "WAITING_FOR_SUPPORT" : "TICKET_CREATED",
    });
  }

  if (!ticketOk && !notified && !(row && row.id)) {
    return {
      ok: false,
      reused: false,
      ticketCreated: false,
      notified: false,
      error: (ticket && ticket.error) || "ticket_failed",
      customerReply: FELLOW_SUPPORT_FAILED,
    };
  }

  const registration =
    resolvedReason === "unregistered_contact" ||
    /register|verif|contact/i.test(`${resolvedReason} ${issueSummary}`);

  return {
    ok: true,
    reused: false,
    ticketCreated: ticketOk,
    notified,
    ticketId: ticketOk ? ticket.ticketId || null : null,
    agentId,
    agentName,
    customerReply: registration
      ? FELLOW_SUPPORT_REGISTRATION
      : FELLOW_SUPPORT_REPLY,
    escalation: row || null,
  };
}

async function resolveByAgent({
  message,
  findLatestWaitingFn = escalationModel.findLatestWaiting,
  updateEscalationFn = escalationModel.update,
} = {}) {
  if (!isCompletionMessage(message)) {
    return {
      ok: false,
      handled: false,
      error: "not_completion",
    };
  }

  const open = await findLatestWaitingFn();
  if (!open) {
    logger.warn("Support agent completion had no open ticket");
    return {
      ok: false,
      handled: true,
      error: "ticket_not_found",
      agentReply: AGENT_DONE_UNKNOWN,
    };
  }

  const updated = await updateEscalationFn(open.id, {
    status: "RESOLVED",
    details: String(message || "").trim() || "resolved",
  });

  logger.info("Escalation marked resolved", {
    ticketId: open.ticket_id || "unknown",
  });

  return {
    ok: true,
    handled: true,
    ticketId: open.ticket_id || null,
    customerNumber: open.customer_number,
    agentReply: AGENT_DONE_ACK,
    customerReply: CUSTOMER_RESOLVED_REPLY,
    escalation: updated || open,
  };
}

function shouldEscalate({ generated, clientContext, message } = {}) {
  const text = String(message || "").trim();

  if (text) {
    const intent = classifyIntent(text);

    if (isGreetingOnly(text) || !isActionRequiredIntent(intent)) {
      return false;
    }

    if (isUnregisteredContext(clientContext) && !hasIdentityDetails(text)) {
      return false;
    }

    if (isActionRequiredIntent(intent)) {
      return true;
    }

    return false;
  }

  if (generated && generated.escalationRequest) {
    return true;
  }

  if (generated && generated.reply === ESCALATION_REPLY) {
    return true;
  }

  return false;
}

module.exports = {
  FELLOW_SUPPORT_REPLY,
  FELLOW_SUPPORT_REGISTRATION,
  FELLOW_SUPPORT_ALREADY_OPEN,
  FELLOW_SUPPORT_FAILED,
  AGENT_DONE_ACK,
  AGENT_DONE_UNKNOWN,
  CUSTOMER_RESOLVED_REPLY,
  parseCompanyFromContext,
  isUnregisteredContext,
  toIssueKey,
  resolvePriority,
  getNotifyNumber,
  isAgentNumber,
  isCompletionMessage,
  formatOpenTicketContext,
  formatAgentNotification,
  findAssignedAgent,
  escalateToSupport,
  resolveByAgent,
  shouldEscalate,
};
