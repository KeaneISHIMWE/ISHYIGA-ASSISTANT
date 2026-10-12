const SECRET_COLUMN = /password|passwd|pwd|secret|token|cookie|\bpin\b|\botp\b|hash/i;

const TABLE_ROLES = {
  accounts: ["global_account_accounts"],
  access: ["global_account_access"],
  reports: ["global_account_view_report"],
  paymentPlan: ["PAYMENT PLAN", "PAYMENT_PLAN", "payment_plan"],
  paymentProduct: ["PAYMENT PRODUCT", "PAYMENT_PRODUCT", "payment_product"],
  paymentMrc: ["PAYMENT CLIENT MRC", "PAYMENT_CLIENT_MRC", "payment_client_mrc"],
  paymentSupporter: ["PAYMENT SUPPORTER", "PAYMENT_SUPPORTER", "payment_supporter"],
  systemCredentials: ["system_credentials"],
  tasksPerformance: ["tasks_performance"],
  vsdcAffectation: ["USER_VSDC_AFFECTATION", "user_vsdc_affectation"],
};

const COLUMN_ROLES = {
  accountId: ["GLOBAL_UNIVERSE_ACCOUNT", "UNIVERSE_ACCOUNT", "USERNAME"],
  fullName: ["FULL_NAME", "FULLNAME", "NAME_USER", "NOM_COMPLET", "NAMES"],
  firstName: ["PRENOM", "FIRST_NAME", "FIRSTNAME"],
  lastName: ["NOM", "LAST_NAME", "LASTNAME"],
  username: ["USERNAME", "USER_NAME", "LOGIN"],
  email: ["EMAIL", "E_MAIL", "MAIL"],
  phone: ["PHONE", "TEL", "TELEPHONE", "MOBILE", "GSM", "NUM_TEL", "PHONE_NUMBER"],
  language: ["LANGUAGE", "LANG", "LANGUE"],
  depot: ["AUTO_DEPOT", "DEPOT"],
  branch: ["BP_EMPLOYE", "BRANCH", "AGENCE"],
  rights: ["AUTHORIZATION", "AUTHORISATION"],
  companyId: ["ID_ACCOUNT", "ID_COMPANY", "COMPANY_ID"],
  companyName: ["COMPANY_NAME", "COMPANY", "SOCIETE", "RAISON_SOCIALE"],
  functionCode: ["CODE_FUNCTION", "FUNCTION_CODE", "CODE"],
  reportCode: ["CODE_REPORT", "REPORT_CODE", "REPORT", "REPORT_NAME", "NOM_REPORT", "VIEW_REPORT", "ID_REPORT"],
  productCode: ["CODE_PRODUCT", "PRODUCT_CODE", "CODE", "PRODUCT"],
  productName: ["PRODUCT_NAME", "NAME_PRODUCT", "DESIGNATION", "NAME", "LIBELLE"],
  contractType: ["CONTRACT_TYPE", "TYPE_CONTRACT", "TYPE", "PLAN_TYPE", "CONTRAT"],
  amount: ["AMOUNT", "MONTANT", "CONTRACT_AMOUNT"],
  discount: ["DISCOUNT", "REMISE", "REDUCTION"],
  startDate: ["START_DATE", "DATE_START", "START", "DEBUT"],
  duration: ["DURATION", "DUREE"],
  paidPeriod: ["PAID_PERIOD", "PERIOD_PAID", "PAID_MONTHS", "MOIS_PAYE"],
  contractStatus: ["STATUS", "STATUT", "ETAT", "PAYMENT_STATUS"],
  userKey: ["UNIVERSE_ACCOUNT", "GLOBAL_UNIVERSE_ACCOUNT", "USERNAME", "ID_USER"],
  clientKey: ["ID_ACCOUNT", "ID_CLIENT", "CLIENT", "NUM_CLIENT"],
  mrc: ["MRC", "MRC_ID", "ID_MRC", "NUM_MRC"],
  tin: ["TIN", "TIN_NUMBER"],
  sdc: ["SDC_ID", "SDC", "VSDC_ID"],
  version: ["VSDC_VERSION", "VERSION", "SOFTWARE_VERSION", "VERSION_INSTALLED"],
  comment: ["COMMENT", "COMMENTS", "COMMENTAIRE", "NOTE"],
  satisfaction: ["SATISFACTION", "CLIENT_SATISFACTION", "FEEDBACK"],
  visitDate: ["VISIT_DATE", "DATE_VISIT", "DATE", "CREATED_AT", "HEURE"],
};

function compactName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function quoteIdent(name) {
  const value = String(name || "");
  if (!/^[A-Za-z0-9_ ]+$/.test(value)) {
    throw new Error("Unsafe SQL identifier");
  }
  return `\`${value.replace(/`/g, "")}\``;
}

function pickColumn(columns, candidates) {
  const byCompact = new Map(
    (columns || []).map((column) => [compactName(column), column])
  );
  for (const candidate of candidates) {
    const hit = byCompact.get(compactName(candidate));
    if (hit) {
      return hit;
    }
  }
  return null;
}

function pickColumns(columns, candidates) {
  const byCompact = new Map(
    (columns || []).map((column) => [compactName(column), column])
  );
  const found = [];
  for (const candidate of candidates) {
    const hit = byCompact.get(compactName(candidate));
    if (hit && !found.includes(hit)) {
      found.push(hit);
    }
  }
  return found;
}

function safeColumns(columns) {
  return (columns || []).filter((column) => !SECRET_COLUMN.test(column));
}

function findTable(tableNames, candidates) {
  const byCompact = new Map(
    (tableNames || []).map((name) => [compactName(name), name])
  );
  for (const candidate of candidates) {
    const hit = byCompact.get(compactName(candidate));
    if (hit) {
      return hit;
    }
  }
  return null;
}

let cachedCatalog = null;

function resetSchemaCatalog() {
  cachedCatalog = null;
}

async function loadSchemaCatalog(query, databaseName) {
  if (cachedCatalog && cachedCatalog.database === databaseName) {
    return cachedCatalog;
  }

  const tableRows = await query(
    `
      SELECT TABLE_NAME AS tableName
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
    `,
    [databaseName]
  );
  const tableNames = tableRows.map((row) => row.tableName || row.TABLE_NAME);
  const tables = {};

  for (const [role, candidates] of Object.entries(TABLE_ROLES)) {
    const tableName = findTable(tableNames, candidates);
    if (!tableName) {
      tables[role] = null;
      continue;
    }

    const columnRows = await query(
      `
        SELECT COLUMN_NAME AS columnName
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `,
      [databaseName, tableName]
    );
    const columns = safeColumns(
      columnRows.map((row) => row.columnName || row.COLUMN_NAME)
    );
    tables[role] = { name: tableName, columns };
  }

  cachedCatalog = { database: databaseName, tables };
  return cachedCatalog;
}

module.exports = {
  TABLE_ROLES,
  COLUMN_ROLES,
  quoteIdent,
  pickColumn,
  pickColumns,
  findTable,
  loadSchemaCatalog,
  resetSchemaCatalog,
  safeColumns,
};
