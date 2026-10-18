const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { lookupAccountByPhone } = require("../src/services/ishyigaAccount/repository");
const { resetSchemaCatalog } = require("../src/services/ishyigaAccount/schema");
const { toClientProfile, formatAccountContext } = require("../src/services/ishyigaAccount/format");

const TABLES = {
  global_account_accounts: {
    columns: [
      "GLOBAL_UNIVERSE_ACCOUNT",
      "FULL_NAME",
      "USERNAME",
      "EMAIL",
      "PHONE",
      "LANGUAGE",
      "AUTO_DEPOT",
      "BP_EMPLOYE",
      "AUTHORIZATION",
      "ID_ACCOUNT",
      "PASSWORD",
    ],
    rows: [
      {
        GLOBAL_UNIVERSE_ACCOUNT: "U1",
        FULL_NAME: "Alice Uwase",
        USERNAME: "alice",
        EMAIL: "alice@example.com",
        PHONE: "0788000000",
        LANGUAGE: "rw",
        AUTO_DEPOT: "DEPOT-1",
        BP_EMPLOYE: "Kigali",
        AUTHORIZATION: "SALES,STOCK",
        ID_ACCOUNT: "C1",
        PASSWORD: "hidden",
      },
      {
        GLOBAL_UNIVERSE_ACCOUNT: "U2",
        FULL_NAME: "Bob Habimana",
        USERNAME: "bob",
        EMAIL: "bob@example.com",
        PHONE: "0788111111",
        LANGUAGE: "en",
        AUTO_DEPOT: "DEPOT-2",
        BP_EMPLOYE: "Musanze",
        AUTHORIZATION: "REPORTS",
        ID_ACCOUNT: "C2",
        PASSWORD: "hidden",
      },
    ],
  },
  global_account_access: {
    columns: ["UNIVERSE_ACCOUNT", "CODE_FUNCTION"],
    rows: [
      { UNIVERSE_ACCOUNT: "U1", CODE_FUNCTION: "SALES" },
      { UNIVERSE_ACCOUNT: "U2", CODE_FUNCTION: "ADMIN" },
    ],
  },
  global_account_view_report: {
    columns: ["UNIVERSE_ACCOUNT", "CODE_REPORT"],
    rows: [{ UNIVERSE_ACCOUNT: "U1", CODE_REPORT: "STOCK_REPORT" }],
  },
  PAYMENT_PLAN: {
    columns: ["ID_ACCOUNT", "CONTRACT_TYPE", "CODE_PRODUCT", "AMOUNT", "DISCOUNT", "STATUS", "START_DATE", "DURATION", "PAID_PERIOD"],
    rows: [
      {
        ID_ACCOUNT: "C1",
        CONTRACT_TYPE: "RECURRENT UPDATE",
        CODE_PRODUCT: "ISHYI4225",
        AMOUNT: "100000",
        DISCOUNT: "0",
        STATUS: "PAID",
        START_DATE: "2026-01-01",
        DURATION: "12",
        PAID_PERIOD: "6",
      },
      {
        ID_ACCOUNT: "C2",
        CODE_PRODUCT: "OTHER",
        AMOUNT: "1",
        STATUS: "OPEN",
        START_DATE: "2026-02-01",
        DURATION: "1",
      },
    ],
  },
  PAYMENT_PRODUCT: {
    columns: ["CODE", "NAME"],
    rows: [{ CODE: "ISHYI4225", NAME: "Ishyiga Full Package" }],
  },
  PAYMENT_CLIENT_MRC: {
    columns: ["ID_ACCOUNT", "MRC"],
    rows: [
      { ID_ACCOUNT: "C1", MRC: "MRC-ALICE" },
      { ID_ACCOUNT: "C2", MRC: "MRC-BOB" },
    ],
  },
  PAYMENT_SUPPORTER: {
    columns: ["ID_ACCOUNT", "BRANCH", "VERSION", "COMMENT", "SATISFACTION", "VISIT_DATE"],
    rows: [
      {
        ID_ACCOUNT: "C1",
        BRANCH: "Kigali",
        VERSION: "8.0.0",
        COMMENT: "Updated POS",
        SATISFACTION: "good",
        VISIT_DATE: "2026-03-01",
      },
    ],
  },
  system_credentials: {
    columns: ["MRC", "TIN", "SDC_ID"],
    rows: [{ MRC: "MRC-ALICE", TIN: "100", SDC_ID: "SDC-1" }],
  },
  tasks_performance: {
    columns: ["SDC_ID", "VSDC_VERSION", "DATE"],
    rows: [{ SDC_ID: "SDC-1", VSDC_VERSION: "VSDC R. 8.0.0 KAMALIZA", DATE: "2026-04-01" }],
  },
  USER_VSDC_AFFECTATION: {
    columns: ["UNIVERSE_ACCOUNT", "SDC_ID"],
    rows: [{ UNIVERSE_ACCOUNT: "U1", SDC_ID: "SDC-1" }],
  },
};

function createQuery(extraRows = []) {
  const calls = [];
  const accounts = {
    ...TABLES.global_account_accounts,
    rows: TABLES.global_account_accounts.rows.concat(extraRows),
  };
  const tables = { ...TABLES, global_account_accounts: accounts };

  async function query(sql, params = []) {
    calls.push({ sql, params });
    assert.equal(sql.includes("' OR "), false);
    assert.ok(!params.some((value) => String(value).includes("'")));

    if (sql.includes("information_schema.TABLES")) {
      return Object.keys(tables).map((tableName) => ({ tableName }));
    }
    if (sql.includes("information_schema.COLUMNS")) {
      const tableName = params[1];
      return tables[tableName].columns.map((columnName) => ({ columnName }));
    }

    const from = sql.match(/FROM `([^`]+)`/);
    const tableName = from[1];
    if (tableName === "global_account_accounts") {
      assert.doesNotMatch(sql, /PASSWORD/);
      return tables[tableName].rows;
    }

    const where = sql.match(/WHERE `([^`]+)` IN/);
    const column = where[1];
    return tables[tableName].rows.filter((row) =>
      params.map(String).includes(String(row[column]))
    );
  }

  return { query, calls };
}

describe("Ishyiga account lookup", () => {
  beforeEach(() => {
    resetSchemaCatalog();
  });

  it("returns only the verified sender account, access, contract, MRC, and support", async () => {
    const { query } = createQuery();
    const result = await lookupAccountByPhone("250788000000", {
      query,
      databaseName: "ishyigahigh",
    });
    const profile = toClientProfile(result.profile, "250788000000");
    const labels = Object.fromEntries(profile.fields.map((field) => [field.label, field.value]));

    assert.equal(result.status, "ok");
    assert.equal(profile.name, "Alice Uwase");
    assert.equal(profile.company, "");
    assert.equal(labels["Company id"], "C1");
    const prompt = formatAccountContext(profile);
    assert.match(prompt, /Company name: unavailable/);
    assert.match(prompt, /greet with Hello only/);
    assert.doesNotMatch(prompt, /Hello, "C1"/);
    assert.doesNotMatch(prompt, /Hello, "alice"/);
    assert.equal(labels["Authorized functions"], "SALES");
    assert.equal(labels["Authorized reports"], "STOCK_REPORT");
    assert.match(labels.Contracts, /RECURRENT UPDATE/);
    assert.match(labels.Contracts, /ISHYI4225 — Ishyiga Full Package/);
    assert.match(labels.Contracts, /discount 0/);
    assert.match(labels.Contracts, /paid period 6/);
    assert.match(labels.Contracts, /status PAID/);
    assert.equal(labels["MRC machines"], "MRC-ALICE");
    assert.match(labels["Support history"], /recorded version 8.0.0/);
    assert.match(labels["Latest recorded VSDC heartbeat"], /KAMALIZA/);
    assert.equal(labels["SDC assignments"], "SDC-1");
    assert.equal(labels.Username, "alice");
    assert.doesNotMatch(JSON.stringify(profile), /hidden|Bob|MRC-BOB|ADMIN/);
  });

  it("returns not found for an unregistered number", async () => {
    const { query } = createQuery();
    const result = await lookupAccountByPhone("250799999999", {
      query,
      databaseName: "ishyigahigh",
    });
    assert.equal(result.status, "not_found");
    assert.equal(result.profile, null);
  });

  it("does not pick an account when the number matches more than one", async () => {
    const { query } = createQuery([
      {
        GLOBAL_UNIVERSE_ACCOUNT: "U3",
        FULL_NAME: "Second Alice",
        USERNAME: "alice2",
        EMAIL: "a2@example.com",
        PHONE: "+250788000000",
        LANGUAGE: "en",
        AUTO_DEPOT: "DEPOT-9",
        BP_EMPLOYE: "Huye",
        AUTHORIZATION: "ALL",
        ID_ACCOUNT: "C9",
        PASSWORD: "hidden",
      },
    ]);
    const result = await lookupAccountByPhone("0788000000", {
      query,
      databaseName: "ishyigahigh",
    });
    assert.equal(result.status, "ambiguous");
    assert.equal(result.profile, null);
    assert.deepEqual(
      result.candidates.map((candidate) => [candidate.name, candidate.company]),
      [
        ["Alice Uwase", "C1"],
        ["Second Alice", "C9"],
      ]
    );
    assert.doesNotMatch(JSON.stringify(result.candidates), /hidden|alice@example.com|a2@example.com/);
  });

  it("loads only the company the sender chose from the matching accounts", async () => {
    const { query } = createQuery([
      {
        GLOBAL_UNIVERSE_ACCOUNT: "U3",
        FULL_NAME: "Second Alice",
        USERNAME: "alice2",
        EMAIL: "a2@example.com",
        PHONE: "+250788000000",
        LANGUAGE: "en",
        AUTO_DEPOT: "DEPOT-9",
        BP_EMPLOYE: "Huye",
        AUTHORIZATION: "ALL",
        ID_ACCOUNT: "C9",
        PASSWORD: "hidden",
      },
    ]);
    const result = await lookupAccountByPhone("0788000000", {
      query,
      databaseName: "ishyigahigh",
      selectedAccountId: "U3",
    });
    const profile = toClientProfile(result.profile, "0788000000");

    assert.equal(result.status, "ok");
    assert.equal(profile.name, "Second Alice");
    assert.equal(profile.company, "");
    assert.equal(
      profile.fields.find((field) => field.label === "Company id").value,
      "C9"
    );
    assert.doesNotMatch(JSON.stringify(profile), /Alice Uwase|hidden|MRC-ALICE/);
  });

  it("keeps injection text out of the SQL statement", async () => {
    const { query, calls } = createQuery();
    await lookupAccountByPhone("0788000000' OR 1=1 --", {
      query,
      databaseName: "ishyigahigh",
    });
    const accountCall = calls.find((call) => call.sql.includes("global_account_accounts") && call.sql.includes("SELECT"));
    assert.ok(accountCall);
    assert.doesNotMatch(accountCall.sql, /OR 1=1/);
    assert.ok(accountCall.params.every((value) => /^\d+$/.test(String(value))));
  });
});
