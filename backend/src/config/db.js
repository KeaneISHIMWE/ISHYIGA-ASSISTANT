const { Pool } = require("pg");
const { env } = require("./env");
const { logger } = require("../utils/logger");
const { resolvePoolSsl } = require("./dbSsl");

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: resolvePoolSsl(env.databaseUrl, env.nodeEnv),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (error) => {
  logger.error("Unexpected database pool error", {
    message: error.message,
  });
});

const REQUIRED_TABLES = ["customers", "conversations", "messages"];

async function checkDatabaseConnection() {
  try {
    await pool.query("SELECT 1 AS ok");
    return { connected: true };
  } catch (error) {
    logger.error("Database connection check failed", {
      message: error.message,
    });
    return { connected: false };
  }
}

async function checkDatabaseSchema() {
  try {
    const result = await pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
      `,
      [REQUIRED_TABLES]
    );

    const existing = new Set(result.rows.map((row) => row.table_name));
    const tables = {};

    for (const tableName of REQUIRED_TABLES) {
      tables[tableName] = existing.has(tableName);
    }

    return {
      ready: REQUIRED_TABLES.every((tableName) => tables[tableName]),
      tables,
    };
  } catch (error) {
    logger.error("Database schema check failed", {
      message: error.message,
    });
    return {
      ready: false,
      tables: {
        customers: false,
        conversations: false,
        messages: false,
      },
    };
  }
}

function isUniqueViolation(error) {
  return Boolean(error && error.code === "23505");
}

module.exports = {
  pool,
  checkDatabaseConnection,
  checkDatabaseSchema,
  isUniqueViolation,
  resolvePoolSsl,
};
