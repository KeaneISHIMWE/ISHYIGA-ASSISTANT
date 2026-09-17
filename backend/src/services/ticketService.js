const { env } = require("../config/env");
const { logger } = require("../utils/logger");

const DEFAULT_TICKET_API_URL =
  "https://ishyiga.rw/care/api/client-portal/create-ticket";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Ticket reason codes and their human-readable labels.
 * Add new reason codes here as more escalation events are identified.
 */
const TICKET_REASONS = {
  ai_escalation: "AI Escalation — Repeated Failures",
  unregistered_contact: "Unregistered Contact Needs Verification",
  human_requested: "Customer Requested Human Agent",
  support_required: "Support Agent Action Required",
};

/**
 * Maps a reason code to a ticket subject line.
 * @param {string} reason
 * @returns {string}
 */
function buildSubject(reason) {
  return TICKET_REASONS[reason] || `WhatsApp AI Escalation — ${reason}`;
}

function parseCompanyFromContext(clientContext) {
  const text = String(clientContext || "");
  const match = text.match(/(?:Company name|- Company|Company):\s*(.+)/i);
  return match ? match[1].trim() : "";
}

/**
 * Builds the ticket description body from the event context.
 * @param {object} params
 * @param {string} params.reason
 * @param {string} params.customerNumber
 * @param {string} [params.message]
 * @param {string} [params.clientContext]
 * @returns {string}
 */
function buildDescription({
  reason,
  customerNumber,
  message,
  clientContext,
  company,
  customerId,
  agentName,
  agentId,
  summary,
  why,
  tried,
  actionRequired,
} = {}) {
  const resolvedCompany = company || parseCompanyFromContext(clientContext);
  const cleanSummary = (summary || "").trim();
  const cleanMessage = (message || "").trim();
  const reasonLabel = TICKET_REASONS[reason] || reason || "WhatsApp AI Escalation";
  const issueHeadline = cleanSummary || cleanMessage || reasonLabel;
  const headline = `[WhatsApp AI] ${issueHeadline.length > 120 ? issueHeadline.slice(0, 117) + "..." : issueHeadline}`;

  const lines = [
    headline,
    "",
    "--- Ticket Details ---",
    "Source: WhatsApp AI Assistant",
    `Customer: ${resolvedCompany || "unknown"}`,
    `Customer WhatsApp: ${customerNumber || "unknown"}`,
  ];

  if (customerId) {
    lines.push(`Customer ID: ${customerId}`);
  }

  if (agentName) {
    lines.push(`Support agent: ${agentName}`);
  }

  if (agentId) {
    lines.push(`Support agent ID: ${agentId}`);
  }

  lines.push(`Reason: ${reason}`);

  if (summary && summary.trim()) {
    lines.push(`Issue: ${summary.trim()}`);
  }

  if (message && message.trim()) {
    lines.push(`Last message: ${message.trim()}`);
  }

  if (tried && String(tried).trim()) {
    lines.push(`AI troubleshooting: ${String(tried).trim()}`);
  }

  if (why && String(why).trim()) {
    lines.push(`Why support is needed: ${String(why).trim()}`);
  }

  if (actionRequired && String(actionRequired).trim()) {
    lines.push(`Action required: ${String(actionRequired).trim()}`);
  }

  if (clientContext && clientContext.trim()) {
    lines.push("", "--- Customer Context ---", clientContext.trim());
  }

  lines.push("", "This ticket was created automatically by the Ishyiga WhatsApp AI Assistant.");

  return lines.join("\n");
}

/**
 * Builds the full POST payload for the ticket API.
 * @param {object} params
 * @returns {object}
 */
function resolveTicketPriority(reason, priority) {
  const requested = String(priority || "").trim().toLowerCase();
  if (requested === "high" || requested === "medium" || requested === "low") {
    return requested;
  }

  if (reason === "ai_escalation") {
    return "medium";
  }

  return "low";
}

function resolveClientName({ company, customerNumber, clientContext }) {
  const resolvedCompany = company || parseCompanyFromContext(clientContext);
  if (resolvedCompany) {
    return `${resolvedCompany} (via WhatsApp AI)`;
  }
  if (customerNumber && String(customerNumber).trim()) {
    return `${String(customerNumber).trim()} (via WhatsApp AI)`;
  }
  return "Customer (via WhatsApp AI)";
}

function resolveClientCompany({ company, clientContext }) {
  const resolvedCompany = company || parseCompanyFromContext(clientContext);
  if (resolvedCompany) {
    return resolvedCompany;
  }
  return "Ishyiga WhatsApp Customer";
}

function buildTicketPayload({
  reason,
  customerNumber,
  message,
  clientContext,
  company,
  customerId,
  agentName,
  agentId,
  summary,
  why,
  tried,
  actionRequired,
  priority,
} = {}) {
  const fullDescription = buildDescription({
    reason,
    customerNumber,
    message,
    clientContext,
    company,
    customerId,
    agentName,
    agentId,
    summary,
    why,
    tried,
    actionRequired,
  });

  const resolvedCompany = company || parseCompanyFromContext(clientContext);
  const clientName = resolveClientName({ company: resolvedCompany, customerNumber, clientContext });
  const clientCompany = resolveClientCompany({ company: resolvedCompany, clientContext });
  const resolvedPriority = resolveTicketPriority(reason, priority);

  return {
    message: fullDescription,
    initialMessage: fullDescription,
    clientName,
    clientCompany,
    priority: resolvedPriority,
    subject: buildSubject(reason),
    description: fullDescription,
    phone: customerNumber || undefined,
    source: "whatsapp_ai",
    ticketSource: "WHATSAPP_AI",
  };
}

/**
 * Returns the configured API URL, falling back to the default CARE endpoint.
 * @returns {string}
 */
function getTicketApiUrl() {
  return (env.careTicketApiUrl || DEFAULT_TICKET_API_URL).trim();
}

/**
 * Returns the configured API key for the ticket endpoint.
 * @returns {string}
 */
function getTicketApiKey() {
  return env.careTicketApiKey || "";
}

/**
 * Sends a POST request to the CARE create-ticket endpoint.
 *
 * This function is intentionally fire-and-forget friendly:
 * it never throws — all failures are logged internally.
 *
 * @param {object} params
 * @param {string} params.reason        - Reason code (see TICKET_REASONS)
 * @param {string} params.customerNumber - Customer WhatsApp number
 * @param {string} [params.message]     - Last inbound message from the customer
 * @param {string} [params.clientContext] - CARE customer context string
 * @param {Function} [params.fetchFn]   - Injectable fetch (for testing)
 * @returns {Promise<{ ok: boolean, ticketId?: string|null, error?: string }>}
 */
async function createTicket({
  reason,
  customerNumber,
  message,
  clientContext,
  company,
  customerId,
  agentName,
  agentId,
  summary,
  why,
  tried,
  actionRequired,
  priority,
  fetchFn = fetch,
} = {}) {
  const apiUrl = getTicketApiUrl();
  const apiKey = getTicketApiKey();

  if (!apiKey) {
    logger.warn("Ticket creation skipped — CARE_TICKET_API_KEY not configured");
    return { ok: false, error: "not_configured" };
  }

  const payload = buildTicketPayload({
    reason,
    customerNumber,
    message,
    clientContext,
    company,
    customerId,
    agentName,
    agentId,
    summary,
    why,
    tried,
    actionRequired,
    priority,
  });

  logger.info("Ticket creation started", {
    reason,
    customer: customerNumber
      ? `${String(customerNumber).slice(0, 3)}***${String(customerNumber).slice(-3)}`
      : "unknown",
  });

  try {
    const response = await fetchFn(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-Client-Api-Key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    let body = null;
    try {
      body = await response.json();
    } catch (_parseError) {
      // Non-JSON body — not fatal
    }

    if (!response.ok) {
      logger.error("Ticket creation failed", {
        reason,
        status: response.status,
        errorCode: body && body.errorCode ? body.errorCode : null,
        message: body && body.message ? String(body.message).slice(0, 120) : null,
      });
      return {
        ok: false,
        error: body && body.errorCode ? body.errorCode : `http_${response.status}`,
      };
    }

    const ticketNumber =
      body && (body.ticketNumber || body.ticket_number || null);
    const rawTicketId =
      body && (body.ticketId || body.id || body.ticket_id || null);
    const ticketId = ticketNumber || rawTicketId || null;

    logger.info("Ticket created", {
      reason,
      ticketId: ticketId || "unknown",
      ticketNumber: ticketNumber || null,
    });

    return { ok: true, ticketId, ticketNumber: ticketNumber || ticketId };
  } catch (error) {
    const timedOut =
      error && (error.name === "TimeoutError" || error.name === "AbortError");

    logger.error("Ticket creation failed", {
      reason,
      error: timedOut ? "timeout" : "unhandled",
    });

    return { ok: false, error: timedOut ? "timeout" : "unhandled" };
  }
}

module.exports = {
  createTicket,
  buildTicketPayload,
  buildSubject,
  buildDescription,
  TICKET_REASONS,
  DEFAULT_TICKET_API_URL,
  REQUEST_TIMEOUT_MS,
};
