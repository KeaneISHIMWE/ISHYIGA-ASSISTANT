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
    agent: query.agent || "",
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

module.exports = {
  toSupportRecord,
  toListFilters,
  parseBooleanQuery,
};
