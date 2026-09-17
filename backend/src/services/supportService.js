function toIso(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeAgentName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function toAgentId(name) {
  const slug = normalizeAgentName(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "unknown";
}

function parseAgentId(value) {
  const id = String(value || "")
    .trim()
    .toLowerCase();

  if (!id || id.length > 200 || id.includes("/") || id.includes("\\")) {
    return "";
  }

  return id;
}

function findAgentRow(rows, id) {
  const agentId = parseAgentId(id);
  if (!agentId) {
    return null;
  }

  return (rows || []).find((row) => toAgentId(row.support_agent) === agentId) || null;
}

function toSupportRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sourceRow: row.source_row,
    clientName: row.client_name,
    supportAgent: row.support_agent,
    location: row.location,
    sector: row.sector,
    visitAt: toIso(row.visit_at),
    branches: Number(row.branches) || 0,
    status: row.status,
    approval: row.approval,
    active: Boolean(row.active),
    contact: row.contact,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toAssignedClient(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.client_name,
    location: row.location,
    sector: row.sector,
    visitAt: toIso(row.visit_at),
    branches: Number(row.branches) || 0,
    status: row.status,
    approval: row.approval,
    active: Boolean(row.active),
    contact: row.contact || null,
  };
}

function toAgentSummary(row, clientsCount) {
  if (!row) {
    return null;
  }

  return {
    id: toAgentId(row.support_agent),
    name: row.support_agent,
    clientsCount:
      clientsCount === undefined
        ? Number(row.clients_count) || 0
        : Number(clientsCount) || 0,
  };
}

function toAgentDetail(row, clients = []) {
  const assigned = clients.map(toAssignedClient);
  return {
    ...toAgentSummary(row, assigned.length),
    clients: assigned,
  };
}

function parseBooleanQuery(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "active"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "inactive"].includes(text)) {
    return false;
  }

  return undefined;
}

function toListFilters(query = {}) {
  return {
    client: query.client || query.q || "",
    agent: query.search || query.agent || "",
    location: query.location || "",
    sector: query.sector || "",
    status: query.status || "",
    approval: query.approval || "",
    active: parseBooleanQuery(query.active),
    contact: query.contact || "",
    from: query.from || "",
    to: query.to || "",
  };
}

function toClientListFilters(query = {}) {
  return {
    ...toListFilters(query),
    agent: "",
  };
}

module.exports = {
  toIso,
  normalizeAgentName,
  toAgentId,
  parseAgentId,
  findAgentRow,
  toSupportRecord,
  toAssignedClient,
  toAgentSummary,
  toAgentDetail,
  toListFilters,
  toClientListFilters,
  parseBooleanQuery,
};
