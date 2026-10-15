const { logger } = require("../../utils/logger");
const { loadSchemaCatalog } = require("./schema");
const { lookupAccountByPhone } = require("./repository");
const { toClientProfile } = require("./format");
const { queryIshyigaReplica, REPLICA_SCHEMA } = require("./replicaQuery");

async function lookupVerifiedAccount(phoneNumber, deps = {}) {
  const query = deps.query || queryIshyigaReplica;
  const databaseName = deps.databaseName || REPLICA_SCHEMA;
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
    const catalog = await loadSchemaCatalog(queryIshyigaReplica, REPLICA_SCHEMA);
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
  REPLICA_SCHEMA,
};
