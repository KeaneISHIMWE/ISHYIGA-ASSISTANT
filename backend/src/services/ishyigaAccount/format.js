const { COLUMN_ROLES, pickColumn } = require("./schema");

function text(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function rowValue(row, columns, role) {
  const column = pickColumn(columns, COLUMN_ROLES[role] || []);
  if (!column || !row || row[column] == null) {
    return "";
  }
  const value = row[column];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return text(value);
}

function addField(fields, label, value) {
  const clean = text(value);
  if (!clean) {
    return;
  }
  fields.push({ key: label, label, value: clean });
}

function productLabel(contract, planColumns, products, productColumns) {
  const code = rowValue(contract, planColumns, "productCode");
  const productCodeColumn = pickColumn(productColumns, COLUMN_ROLES.productCode);
  const match = products.find(
    (product) => productCodeColumn && text(product[productCodeColumn]) === code
  );
  const name = match ? rowValue(match, productColumns, "productName") : "";
  if (code && name) {
    return `${code} — ${name}`;
  }
  return name || code;
}

function toClientProfile(bundle, phoneNumber) {
  const account = bundle.account || {};
  const fields = [];
  addField(fields, "Full name", account.fullName);
  addField(fields, "Username", account.username);
  addField(fields, "Email", account.email);
  addField(fields, "Phone", account.phone);
  addField(fields, "Language", account.language);
  addField(fields, "Depot", account.depot);
  addField(fields, "Branch", account.branch);
  addField(fields, "Account page rights", account.rights);
  addField(fields, "Company", account.companyName);
  addField(fields, "Company id", account.companyId);

  const functions = (bundle.access || []).map((item) => item.code).filter(Boolean);
  addField(fields, "Authorized functions", functions.join(", "));

  const reports = (bundle.reports || []).map((item) => item.code).filter(Boolean);
  addField(fields, "Authorized reports", reports.join(", "));

  const planColumns =
    bundle.contracts && bundle.contracts.length ? Object.keys(bundle.contracts[0]) : [];
  const productColumns =
    bundle.products && bundle.products.length ? Object.keys(bundle.products[0]) : [];

  const contractLines = (bundle.contracts || []).map((row) => {
    const parts = [
      rowValue(row, planColumns, "contractType"),
      productLabel(row, planColumns, bundle.products || [], productColumns),
    ].filter(Boolean);
    for (const [role, label] of [
      ["amount", "amount"],
      ["discount", "discount"],
      ["startDate", "start"],
      ["duration", "duration"],
      ["paidPeriod", "paid period"],
      ["contractStatus", "status"],
    ]) {
      const value = rowValue(row, planColumns, role);
      if (value) {
        parts.push(`${label} ${value}`);
      }
    }
    return parts.join("; ");
  }).filter(Boolean);
  addField(fields, "Contracts", contractLines.join(" | "));

  const mrcColumn = pickColumn(
    bundle.mrc && bundle.mrc[0] ? Object.keys(bundle.mrc[0]) : [],
    COLUMN_ROLES.mrc
  );
  const mrcIds = (bundle.mrc || []).map((row) => (mrcColumn ? text(row[mrcColumn]) : "")).filter(Boolean);
  addField(fields, "MRC machines", mrcIds.join(", "));

  const supportLines = (bundle.support || []).map((row) => {
    const columns = Object.keys(row);
    return [
      rowValue(row, columns, "visitDate"),
      rowValue(row, columns, "branch"),
      rowValue(row, columns, "version") ? `recorded version ${rowValue(row, columns, "version")}` : "",
      rowValue(row, columns, "functionCode"),
      rowValue(row, columns, "comment"),
      rowValue(row, columns, "satisfaction"),
    ]
      .filter(Boolean)
      .join("; ");
  }).filter(Boolean);
  addField(fields, "Support history", supportLines.join(" | "));

  const assignments = (bundle.affectations || [])
    .map((row) => rowValue(row, Object.keys(row), "sdc"))
    .filter(Boolean);
  addField(fields, "SDC assignments", assignments.join(", "));

  const heartbeat = (bundle.heartbeats || [])[0];
  if (heartbeat) {
    const columns = Object.keys(heartbeat);
    addField(
      fields,
      "Latest recorded VSDC heartbeat",
      [rowValue(heartbeat, columns, "version"), rowValue(heartbeat, columns, "sdc")]
        .filter(Boolean)
        .join(" ")
    );
  }

  return {
    name: account.fullName || account.username || "",
    company: account.companyName || account.companyId || "",
    email: account.email || "",
    phoneNumber,
    fields,
    accountId: account.accountId || "",
  };
}

function formatAccountContext(profile) {
  const rows = (profile.fields || [])
    .map((field) => `- ${field.label}: ${field.value}`)
    .join("\n");

  return `CUSTOMER CONTEXT

CONTACT STATUS: KNOWN CUSTOMER
Company name: ${profile.company || "unavailable"}
WhatsApp contact: ${profile.phoneNumber}. Use only this contact's record.

${rows}

ACCOUNT DATA RULES:
- These values belong only to the verified WhatsApp sender.
- If a requested detail is not listed, say it is unavailable. Do not invent it.
- Authorized functions are recorded assignments, not proof that every operation is allowed.
- Support visits and recorded software versions are historical. Do not call a recorded version the current installation unless this context says it is current.
- Do not mention database tables, SQL, or internal system names.
- Do not disclose another client's records.`;
}

module.exports = {
  toClientProfile,
  formatAccountContext,
};
