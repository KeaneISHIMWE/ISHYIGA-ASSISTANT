const { pool } = require("../../config/db");

const REPLICA_SCHEMA = "ishyiga_account";

function toPostgresSql(sql) {
  let index = 0;
  return String(sql)
    .replace(/`([^`]+)`/g, '"$1"')
    .replace(/\?/g, () => {
      index += 1;
      return `$${index}`;
    });
}

async function queryIshyigaReplica(sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path TO ishyiga_account");
    const result = await client.query(toPostgresSql(sql), params);
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  REPLICA_SCHEMA,
  toPostgresSql,
  queryIshyigaReplica,
};
