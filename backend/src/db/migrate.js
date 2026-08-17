const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");
const { logger } = require("../utils/logger");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedFilenames(client) {
  const result = await client.query(
    "SELECT filename FROM schema_migrations ORDER BY filename ASC"
  );
  return new Set(result.rows.map((row) => row.filename));
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
}

async function migrate() {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedFilenames(client);
    const files = listMigrationFiles();

    for (const filename of files) {
      if (applied.has(filename)) {
        logger.info("Migration already applied", { filename });
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      logger.info("Applying migration", { filename });

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename]
        );
        await client.query("COMMIT");
        logger.info("Migration applied", { filename });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    logger.info("Database migrations complete");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  logger.error("Database migration failed", {
    message: error.message,
  });
  process.exit(1);
});
