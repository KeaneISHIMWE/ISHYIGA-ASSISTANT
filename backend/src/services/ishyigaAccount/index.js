const { env } = require("../../config/env");
const { queryIshyigaMysql } = require("../../config/ishyigaMysql");
const { logger } = require("../../utils/logger");
const { loadSchemaCatalog } = require("./schema");
const { lookupAccountByPhone } = require("./repository");
const { toClientProfile } = require("./format");

function accountDatabaseName() {
  return env.ishyigaMysqlDatabase;
}

async function lookupVerifiedAccount(phoneNumber, deps = {}) {
  const query = deps.query || queryIshyigaMysql;
  const databaseName = deps.databaseName || accountDatabaseName();
  const result = await lookupAccountByPhone(phoneNumber, {
    query,
    databaseName,
    selectedAccountId: deps.selectedAccountId,
  });
  if (result.status !== "ok") {
    return result;
  }

  return {
    status: "ok",
    profile: toClientProfile(result.profile, phoneNumber),
    unresolved: result.unresolved || [],
  };
}

async function warmIshyigaAccountSchema() {
  try {
    const catalog = await loadSchemaCatalog(queryIshyigaMysql, accountDatabaseName());
    const found = Object.entries(catalog.tables)
      .filter((entry) => entry[1])
      .map(([role, table]) => `${role}:${table.name}`);
    logger.info("Ishyiga account schema ready", {
      source: "ovh-mysql",
      database: accountDatabaseName(),
      tables: found,
    });
    return catalog;
  } catch (error) {
    logger.error("Ishyiga account schema failed", {
      source: "ovh-mysql",
      message: error.message,
      code: error.code,
    });
    return null;
  }
}

module.exports = {
  lookupVerifiedAccount,
  warmIshyigaAccountSchema,
  accountDatabaseName,
};
