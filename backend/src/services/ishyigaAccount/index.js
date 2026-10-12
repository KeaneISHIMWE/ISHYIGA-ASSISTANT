const { env } = require("../../config/env");
const { queryIshyigaMysql, isIshyigaMysqlConfigured } = require("../../config/ishyigaMysql");
const { logger } = require("../../utils/logger");
const { loadSchemaCatalog } = require("./schema");
const { lookupAccountByPhone } = require("./repository");
const { toClientProfile } = require("./format");

async function lookupVerifiedAccount(phoneNumber, deps = {}) {
  const query = deps.query || queryIshyigaMysql;
  const databaseName = deps.databaseName || env.ishyigaMysqlDatabase;
  const result = await lookupAccountByPhone(phoneNumber, { query, databaseName });
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
  if (!isIshyigaMysqlConfigured()) {
    logger.info("Ishyiga account database is not configured");
    return null;
  }

  try {
    const catalog = await loadSchemaCatalog(queryIshyigaMysql, env.ishyigaMysqlDatabase);
    const found = Object.entries(catalog.tables)
      .filter((entry) => entry[1])
      .map(([role, table]) => `${role}:${table.name}`);
    logger.info("Ishyiga account schema ready", { tables: found });
    return catalog;
  } catch (error) {
    logger.error("Ishyiga account schema failed", { message: error.message });
    return null;
  }
}

module.exports = {
  lookupVerifiedAccount,
  warmIshyigaAccountSchema,
  isIshyigaMysqlConfigured,
};
