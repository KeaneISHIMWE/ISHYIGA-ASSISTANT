const MISSING_MARKERS = new Set(["", "—", "-", "n/a", "na", "null", "none"]);
const NO_DATE_MARKERS = new Set(["no date set", "n/a", "na", "none", "null"]);

function isMissingCell(value) {
  if (value === null || value === undefined) {
    return true;
  }

  const text = String(value).trim();
  if (!text) {
    return true;
  }

  if ([...text].every((char) => char === "\uFFFD" || char === "?")) {
    return true;
  }

  return MISSING_MARKERS.has(text.toLowerCase());
}

function toOptionalText(value) {
  if (isMissingCell(value)) {
    return null;
  }

  return String(value).trim();
}

function toRequiredText(value) {
  const text = toOptionalText(value);
  return text || "";
}

function toBooleanActive(value) {
  if (isMissingCell(value)) {
    return { ok: true, value: true, missing: true };
  }

  const text = String(value).trim().toLowerCase();
  if (["active", "true", "yes", "1"].includes(text)) {
    return { ok: true, value: true, missing: false };
  }

  if (["inactive", "false", "no", "0"].includes(text)) {
    return { ok: true, value: false, missing: false };
  }

  return { ok: false, value: null, error: "invalid_active" };
}

function toIntegerBranches(value) {
  if (isMissingCell(value)) {
    return { ok: true, value: 0, missing: true };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, value: Math.trunc(value), missing: false };
  }

  const text = String(value).trim();
  if (/^-?\d+$/.test(text)) {
    return { ok: true, value: Number(text), missing: false };
  }

  return { ok: false, value: null, error: "invalid_branches" };
}

function toVisitAt(value) {
  if (isMissingCell(value)) {
    return { ok: true, value: null, missing: true };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { ok: true, value, missing: false };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + value * 86400000);
    if (!Number.isNaN(parsed.getTime())) {
      return { ok: true, value: parsed, missing: false };
    }
  }

  const text = String(value).trim();
  if (NO_DATE_MARKERS.has(text.toLowerCase())) {
    return { ok: true, value: null, missing: true };
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return { ok: true, value: parsed, missing: false };
  }

  return { ok: false, value: null, error: "invalid_visit_date" };
}

function toContact(value) {
  if (isMissingCell(value)) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  const text = String(value).trim();
  return text || null;
}

function toSourceRow(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const text = String(value || "").trim();
  if (/^-?\d+$/.test(text)) {
    return Number(text);
  }

  return null;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findHeaderRow(rows) {
  for (let index = 0; index < rows.length; index += 1) {
    const mapped = (rows[index] || []).map(normalizeHeader);
    if (mapped.includes("client name") && mapped.includes("support agent")) {
      return { headerRowIndex: index, headers: rows[index] };
    }
  }

  return null;
}

function columnIndex(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const found = normalized.indexOf(alias);
    if (found !== -1) {
      return found;
    }
  }

  return -1;
}

function readCell(row, index) {
  if (index < 0) {
    return null;
  }

  return row[index];
}

function mapExcelRow(row, columns, excelRowNumber) {
  const issues = [];
  const clientName = toRequiredText(readCell(row, columns.clientName));
  if (!clientName) {
    return {
      ok: false,
      excelRowNumber,
      error: "missing_client_name",
      record: null,
    };
  }

  const sourceRow = toSourceRow(readCell(row, columns.sourceRow));
  if (sourceRow === null) {
    return {
      ok: false,
      excelRowNumber,
      error: "missing_source_row",
      record: null,
    };
  }

  const visit = toVisitAt(readCell(row, columns.visitDate));
  if (!visit.ok) {
    return {
      ok: false,
      excelRowNumber,
      error: visit.error,
      record: null,
    };
  }

  const branches = toIntegerBranches(readCell(row, columns.branches));
  if (!branches.ok) {
    return {
      ok: false,
      excelRowNumber,
      error: branches.error,
      record: null,
    };
  }

  const active = toBooleanActive(readCell(row, columns.active));
  if (!active.ok) {
    return {
      ok: false,
      excelRowNumber,
      error: active.error,
      record: null,
    };
  }

  const location = toOptionalText(readCell(row, columns.location));
  const sector = toOptionalText(readCell(row, columns.sector));
  const supportAgent = toOptionalText(readCell(row, columns.supportAgent));
  const contact = toContact(readCell(row, columns.contact));
  const status = toRequiredText(readCell(row, columns.status)) || "Pending";
  const approval = toRequiredText(readCell(row, columns.approval)) || "pending";

  if (!supportAgent) issues.push("missing_support_agent");
  if (!location) issues.push("missing_location");
  if (!sector) issues.push("missing_sector");
  if (visit.missing) issues.push("missing_visit_date");
  if (!contact) issues.push("missing_contact");

  return {
    ok: true,
    excelRowNumber,
    issues,
    record: {
      sourceRow,
      clientName,
      supportAgent,
      location,
      sector,
      visitAt: visit.value,
      branches: branches.value,
      status,
      approval,
      active: active.value,
      contact,
    },
  };
}

function parseSupportWorkbook(rows) {
  const header = findHeaderRow(rows);
  if (!header) {
    return {
      ok: false,
      error: "header_not_found",
      records: [],
      invalid: [],
      warnings: [],
    };
  }

  const columns = {
    sourceRow: columnIndex(header.headers, ["#", "no", "row"]),
    clientName: columnIndex(header.headers, ["client name"]),
    supportAgent: columnIndex(header.headers, ["support agent"]),
    location: columnIndex(header.headers, ["location"]),
    sector: columnIndex(header.headers, ["sector"]),
    visitDate: columnIndex(header.headers, ["visit date"]),
    branches: columnIndex(header.headers, ["branches"]),
    status: columnIndex(header.headers, ["status"]),
    approval: columnIndex(header.headers, ["approval"]),
    active: columnIndex(header.headers, ["active"]),
    contact: columnIndex(header.headers, ["contact"]),
  };

  const records = [];
  const invalid = [];
  const warnings = [];
  const seenKeys = new Map();

  for (let index = header.headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const excelRowNumber = index + 1;
    const empty = row.every((value) => isMissingCell(value));
    if (empty) {
      continue;
    }

    const mapped = mapExcelRow(row, columns, excelRowNumber);
    if (!mapped.ok) {
      invalid.push({
        excelRowNumber,
        error: mapped.error,
      });
      continue;
    }

    const dedupeKey = [
      mapped.record.clientName.toLowerCase(),
      (mapped.record.supportAgent || "").toLowerCase(),
      mapped.record.visitAt ? mapped.record.visitAt.toISOString() : "no-date",
    ].join("|");

    if (seenKeys.has(dedupeKey)) {
      invalid.push({
        excelRowNumber,
        error: "duplicate_in_file",
        duplicateOf: seenKeys.get(dedupeKey),
      });
      continue;
    }

    seenKeys.set(dedupeKey, excelRowNumber);
    if (mapped.issues.length) {
      warnings.push({
        excelRowNumber,
        sourceRow: mapped.record.sourceRow,
        issues: mapped.issues,
      });
    }

    records.push(mapped.record);
  }

  return {
    ok: true,
    records,
    invalid,
    warnings,
    headerRow: header.headerRowIndex + 1,
  };
}

module.exports = {
  parseSupportWorkbook,
  mapExcelRow,
  toVisitAt,
  toBooleanActive,
  toIntegerBranches,
  toContact,
  toOptionalText,
  isMissingCell,
};
