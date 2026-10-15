const fs = require("fs");
const { pool } = require("../src/config/db");

const SECRET_COLUMN = /password|passwd|pwd|secret|token|cookie|\bpin\b|\botp\b|hash/i;
const SCHEMA = "ishyiga_account";

function quoteIdent(name) {
  const value = String(name || "");
  if (!/^[A-Za-z0-9_ ]+$/.test(value)) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
  return `"${value.replace(/"/g, "")}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((record) => record.some((value) => value !== ""));
}

function loadCsvText(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    const value = parsed.result ? parsed.result.value : parsed;
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof value.csv === "string") {
      return value.csv;
    }
    throw new Error("JSON file does not contain CSV text");
  }
  return raw;
}

async function importTable(tableName, csvText) {
  const records = parseCsv(csvText);
  if (!records.length) {
    throw new Error(`No rows in ${tableName}`);
  }

  const headers = records[0];
  const kept = headers
    .map((header, index) => ({ header, index }))
    .filter((column) => column.header && !SECRET_COLUMN.test(column.header));
  const skipped = headers.filter((header) => SECRET_COLUMN.test(header));
  const data = records.slice(1);
  const client = await pool.connect();

  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(SCHEMA)}`);
    await client.query("BEGIN");
    await client.query(
      `DROP TABLE IF EXISTS ${quoteIdent(SCHEMA)}.${quoteIdent(tableName)}`
    );
    const columnSql = kept
      .map((column) => `${quoteIdent(column.header)} TEXT`)
      .join(", ");
    await client.query(
      `CREATE TABLE ${quoteIdent(SCHEMA)}.${quoteIdent(tableName)} (${columnSql})`
    );

    const insertColumns = kept.map((column) => quoteIdent(column.header)).join(", ");
    const batchSize = 400;
    for (let offset = 0; offset < data.length; offset += batchSize) {
      const batch = data.slice(offset, offset + batchSize);
      const values = [];
      const tuples = batch.map((record, rowIndex) => {
        const placeholders = kept.map((column, columnIndex) => {
          const value = record[column.index] ?? "";
          values.push(value === "" ? null : value);
          return `$${rowIndex * kept.length + columnIndex + 1}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      await client.query(
        `INSERT INTO ${quoteIdent(SCHEMA)}.${quoteIdent(tableName)} (${insertColumns}) VALUES ${tuples.join(", ")}`,
        values
      );
    }

    await client.query("COMMIT");
    return {
      table: tableName,
      inserted: data.length,
      columns: kept.map((column) => column.header),
      skippedSecretColumns: skipped,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const tableName = process.argv[2];
  const filePath = process.argv[3];
  if (!tableName || !filePath) {
    throw new Error("Usage: node scripts/importIshyigaReplica.js <table> <csv-or-json>");
  }
  const summary = await importTable(tableName, loadCsvText(filePath));
  console.log(
    JSON.stringify({
      table: summary.table,
      inserted: summary.inserted,
      columnCount: summary.columns.length,
      skippedSecretColumns: summary.skippedSecretColumns,
    })
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = { importTable, parseCsv };
