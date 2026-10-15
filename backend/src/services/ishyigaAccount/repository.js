const { toCanonicalWhatsappDigits } = require("../contactRules");
const {
  COLUMN_ROLES,
  quoteIdent,
  pickColumn,
  pickColumns,
  loadSchemaCatalog,
} = require("./schema");

const CHILD_LIMIT = 20;
const SUPPORT_LIMIT = 5;

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function phoneNeedles(phoneNumber) {
  const canonical = toCanonicalWhatsappDigits(phoneNumber);
  const digits = digitsOnly(canonical || phoneNumber);
  const needles = new Set();
  if (!digits) {
    return [];
  }

  needles.add(digits);
  if (digits.startsWith("250") && digits.length >= 11) {
    needles.add(`0${digits.slice(3)}`);
    needles.add(digits.slice(3));
  }
  if (digits.startsWith("0") && digits.length >= 10) {
    needles.add(`250${digits.slice(1)}`);
    needles.add(digits.slice(1));
  }
  if (digits.length > 9) {
    needles.add(digits.slice(-9));
  }
  return [...needles].filter((value) => value.length >= 9);
}

function last9Set(needles) {
  return new Set(needles.map((value) => value.slice(-9)));
}

function rowMatchesPhone(row, phoneColumns, needles) {
  const endings = last9Set(needles);
  return phoneColumns.some((column) => {
    const digits = digitsOnly(row[column]);
    return digits.length >= 9 && endings.has(digits.slice(-9));
  });
}

function cell(row, column) {
  if (!column || !row || row[column] == null) {
    return "";
  }
  const value = row[column];
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return "";
}

function selectList(columns) {
  return columns.map((column) => quoteIdent(column)).join(", ");
}

async function selectWhere(query, table, columns, whereColumn, values, { limit, orderColumn } = {}) {
  if (!table || !whereColumn || !values.length || !columns.length) {
    return [];
  }

  const placeholders = values.map(() => "?").join(", ");
  const order = orderColumn ? ` ORDER BY ${quoteIdent(orderColumn)} DESC` : "";
  const sql = `
    SELECT ${selectList(columns)}
    FROM ${quoteIdent(table.name)}
    WHERE ${quoteIdent(whereColumn)} IN (${placeholders})${order}
    LIMIT ${Number(limit) || CHILD_LIMIT}
  `;
  return query(sql, values);
}

async function findAccounts(query, table, needles) {
  const phoneColumns = pickColumns(table.columns, COLUMN_ROLES.phone);
  if (!phoneColumns.length) {
    return { rows: [], phoneColumns: [], unresolved: "accounts table has no phone column" };
  }

  const placeholders = needles.map(() => "?").join(", ");
  const clauses = phoneColumns.map((column) => {
    const normalized = `RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(${quoteIdent(column)}, ' ', ''), '-', ''), '+', ''), '.', ''), 9)`;
    return `${normalized} IN (${placeholders})`;
  });
  const params = phoneColumns.flatMap(() => needles.map((value) => value.slice(-9)));
  const sql = `
    SELECT ${selectList(table.columns)}
    FROM ${quoteIdent(table.name)}
    WHERE ${clauses.join(" OR ")}
    LIMIT 30
  `;
  const rows = await query(sql, params);
  return {
    rows: rows.filter((row) => rowMatchesPhone(row, phoneColumns, needles)),
    phoneColumns,
    unresolved: null,
  };
}

function accountIdentity(row, table) {
  const idColumn = pickColumn(table.columns, COLUMN_ROLES.accountId);
  return cell(row, idColumn) || cell(row, pickColumn(table.columns, COLUMN_ROLES.username));
}

function displayName(row, table) {
  const full = cell(row, pickColumn(table.columns, COLUMN_ROLES.fullName));
  if (full) {
    return full;
  }
  const combined = [
    cell(row, pickColumn(table.columns, COLUMN_ROLES.firstName)),
    cell(row, pickColumn(table.columns, COLUMN_ROLES.lastName)),
  ]
    .filter(Boolean)
    .join(" ");
  return combined;
}

function buildAccountRecord(row, accounts) {
  return {
    accountId: accountIdentity(row, accounts),
    fullName: displayName(row, accounts),
    username: cell(row, pickColumn(accounts.columns, COLUMN_ROLES.username)),
    email: cell(row, pickColumn(accounts.columns, COLUMN_ROLES.email)),
    phone: cell(row, pickColumn(accounts.columns, COLUMN_ROLES.phone)),
    language: cell(row, pickColumn(accounts.columns, COLUMN_ROLES.language)),
    depot: cell(row, pickColumn(accounts.columns, COLUMN_ROLES.depot)),
    branch: cell(row, pickColumn(accounts.columns, COLUMN_ROLES.branch)),
    rights: cell(row, pickColumn(accounts.columns, COLUMN_ROLES.rights)),
    companyId: cell(row, pickColumn(accounts.columns, COLUMN_ROLES.companyId)),
    companyName: cell(row, pickColumn(accounts.columns, COLUMN_ROLES.companyName)),
    row,
  };
}

function summarizeCandidate(row, accounts) {
  const account = buildAccountRecord(row, accounts);
  return {
    accountId: account.accountId,
    name: account.fullName || account.username || "",
    company: account.companyName || account.companyId || "",
    username: account.username || "",
  };
}

async function loadChildren(query, catalog, account) {
  const unresolved = [];
  const accountId = account.accountId;
  const companyId = account.companyId;
  const tables = catalog.tables;

  async function byUser(role, valueColumnRole) {
    const table = tables[role];
    if (!table) {
      unresolved.push(`${role} table was not found`);
      return [];
    }
    const link = pickColumn(table.columns, COLUMN_ROLES.userKey) ||
      pickColumn(table.columns, COLUMN_ROLES.accountId);
    if (!link || !accountId) {
      unresolved.push(`${role} has no confirmed user link`);
      return [];
    }
    const rows = await selectWhere(query, table, table.columns, link, [accountId], {
      limit: CHILD_LIMIT,
    });
    const valueColumn = pickColumn(table.columns, COLUMN_ROLES[valueColumnRole] || []);
    return rows.map((row) => ({
      code: valueColumn ? cell(row, valueColumn) : "",
      row,
    }));
  }

  const access = await byUser("access", "functionCode");
  const reports = await byUser("reports", "reportCode");

  let contracts = [];
  const plan = tables.paymentPlan;
  if (!plan) {
    unresolved.push("payment plan table was not found");
  } else {
    const link =
      (companyId && pickColumn(plan.columns, COLUMN_ROLES.clientKey)) ||
      (accountId && pickColumn(plan.columns, COLUMN_ROLES.userKey));
    const linkValue = link && pickColumn(plan.columns, COLUMN_ROLES.clientKey) && companyId
      ? companyId
      : accountId;
    if (!link || !linkValue) {
      unresolved.push("payment plan has no confirmed account link");
    } else {
      contracts = await selectWhere(query, plan, plan.columns, link, [linkValue], {
        limit: 10,
        orderColumn: pickColumn(plan.columns, COLUMN_ROLES.visitDate),
      });
    }
  }

  let products = [];
  const productTable = tables.paymentProduct;
  const codeColumn = plan && pickColumn(plan.columns, COLUMN_ROLES.productCode);
  const codes = [
    ...new Set(contracts.map((row) => cell(row, codeColumn)).filter(Boolean)),
  ];
  if (!productTable) {
    unresolved.push("payment product table was not found");
  } else if (codes.length) {
    const productCodeColumn = pickColumn(productTable.columns, COLUMN_ROLES.productCode);
    if (!productCodeColumn) {
      unresolved.push("payment product has no product code column");
    } else {
      products = await selectWhere(
        query,
        productTable,
        productTable.columns,
        productCodeColumn,
        codes,
        { limit: codes.length }
      );
    }
  }

  let mrc = [];
  const mrcTable = tables.paymentMrc;
  if (!mrcTable) {
    unresolved.push("payment MRC table was not found");
  } else {
    const link =
      (companyId && pickColumn(mrcTable.columns, COLUMN_ROLES.clientKey)) ||
      (accountId && pickColumn(mrcTable.columns, COLUMN_ROLES.userKey));
    const linkValue = link && companyId && pickColumn(mrcTable.columns, COLUMN_ROLES.clientKey)
      ? companyId
      : accountId;
    if (!link || !linkValue) {
      unresolved.push("payment MRC has no confirmed account link");
    } else {
      mrc = await selectWhere(query, mrcTable, mrcTable.columns, link, [linkValue], {
        limit: CHILD_LIMIT,
      });
    }
  }

  let support = [];
  const supportTable = tables.paymentSupporter;
  if (!supportTable) {
    unresolved.push("payment supporter table was not found");
  } else {
    const link =
      (companyId && pickColumn(supportTable.columns, COLUMN_ROLES.clientKey)) ||
      (accountId && pickColumn(supportTable.columns, COLUMN_ROLES.userKey));
    const linkValue =
      link && companyId && pickColumn(supportTable.columns, COLUMN_ROLES.clientKey)
        ? companyId
        : accountId;
    if (!link || !linkValue) {
      unresolved.push("payment supporter has no confirmed account link");
    } else {
      support = await selectWhere(
        query,
        supportTable,
        supportTable.columns,
        link,
        [linkValue],
        {
          limit: SUPPORT_LIMIT,
          orderColumn: pickColumn(supportTable.columns, COLUMN_ROLES.visitDate),
        }
      );
    }
  }

  const mrcIds = mrc
    .map((row) => cell(row, pickColumn(mrcTable && mrcTable.columns, COLUMN_ROLES.mrc)))
    .filter(Boolean);
  const tins = mrc
    .map((row) => cell(row, pickColumn(mrcTable && mrcTable.columns, COLUMN_ROLES.tin)))
    .filter(Boolean);

  let credentials = [];
  const credentialTable = tables.systemCredentials;
  if (credentialTable && (mrcIds.length || tins.length)) {
    const mrcColumn = pickColumn(credentialTable.columns, COLUMN_ROLES.mrc);
    const tinColumn = pickColumn(credentialTable.columns, COLUMN_ROLES.tin);
    if (mrcColumn && mrcIds.length) {
      credentials = await selectWhere(
        query,
        credentialTable,
        credentialTable.columns,
        mrcColumn,
        mrcIds,
        { limit: CHILD_LIMIT }
      );
    } else if (tinColumn && tins.length) {
      credentials = await selectWhere(
        query,
        credentialTable,
        credentialTable.columns,
        tinColumn,
        tins,
        { limit: CHILD_LIMIT }
      );
    } else {
      unresolved.push("system credentials has no confirmed MRC or TIN link");
    }
  } else if (!credentialTable) {
    unresolved.push("system credentials table was not found");
  }

  const sdcIds = credentials
    .map((row) => cell(row, pickColumn(credentialTable && credentialTable.columns, COLUMN_ROLES.sdc)))
    .filter(Boolean);

  let heartbeats = [];
  const taskTable = tables.tasksPerformance;
  if (taskTable && sdcIds.length) {
    const sdcColumn = pickColumn(taskTable.columns, COLUMN_ROLES.sdc);
    if (sdcColumn) {
      heartbeats = await selectWhere(query, taskTable, taskTable.columns, sdcColumn, sdcIds, {
        limit: 5,
        orderColumn: pickColumn(taskTable.columns, COLUMN_ROLES.visitDate),
      });
    } else {
      unresolved.push("tasks performance has no confirmed SDC link");
    }
  }

  let affectations = [];
  const affectationTable = tables.vsdcAffectation;
  if (affectationTable && accountId) {
    const link = pickColumn(affectationTable.columns, COLUMN_ROLES.userKey);
    if (link) {
      affectations = await selectWhere(
        query,
        affectationTable,
        affectationTable.columns,
        link,
        [accountId],
        { limit: CHILD_LIMIT }
      );
    } else {
      unresolved.push("VSDC affectation has no confirmed user link");
    }
  }

  return {
    access,
    reports,
    contracts,
    products,
    mrc,
    support,
    credentials,
    heartbeats,
    affectations,
    unresolved,
  };
}

async function lookupAccountByPhone(phoneNumber, { query, databaseName, selectedAccountId } = {}) {
  const needles = phoneNeedles(phoneNumber);
  if (!needles.length) {
    return { status: "not_found", profile: null, unresolved: [] };
  }

  const catalog = await loadSchemaCatalog(query, databaseName);
  const accounts = catalog.tables.accounts;
  if (!accounts) {
    const error = new Error("Account table was not found");
    error.code = "SCHEMA";
    throw error;
  }

  const found = await findAccounts(query, accounts, needles);
  if (found.unresolved) {
    const error = new Error(found.unresolved);
    error.code = "SCHEMA";
    throw error;
  }
  if (!found.rows.length) {
    return { status: "not_found", profile: null, unresolved: [] };
  }

  const rowsById = new Map();
  for (const row of found.rows) {
    const id = accountIdentity(row, accounts);
    if (id && !rowsById.has(id)) {
      rowsById.set(id, row);
    }
  }
  const identities = [...rowsById.keys()];
  const selected = String(selectedAccountId || "").trim();
  if (identities.length > 1 && !(selected && rowsById.has(selected))) {
    return {
      status: "ambiguous",
      profile: null,
      candidates: [...rowsById.values()].map((row) => summarizeCandidate(row, accounts)),
      unresolved: [],
    };
  }

  const row = identities.length > 1 ? rowsById.get(selected) : found.rows[0];
  const account = buildAccountRecord(row, accounts);

  const children = await loadChildren(query, catalog, account);
  return {
    status: "ok",
    profile: { account, ...children, phoneColumns: found.phoneColumns },
    unresolved: children.unresolved,
  };
}

module.exports = {
  phoneNeedles,
  rowMatchesPhone,
  lookupAccountByPhone,
};
