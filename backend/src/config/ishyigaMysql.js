const mysql = require("mysql2/promise");
const { env } = require("./env");

let pool = null;

function isIshyigaMysqlConfigured() {
  if (env.ishyigaOvhQueryUrl && env.ishyigaOvhQueryKey) {
    return true;
  }
  return Boolean(env.ishyigaMysqlPassword && env.ishyigaMysqlHost && env.ishyigaMysqlDatabase);
}

async function queryViaOvhBridge(sql, params = []) {
  const response = await fetch(env.ishyigaOvhQueryUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Assistant-Key": env.ishyigaOvhQueryKey,
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(20_000),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    const error = new Error("OVH account read did not return JSON");
    error.code = "OVH_BRIDGE_BAD_RESPONSE";
    throw error;
  }
  if (!response.ok || !payload || payload.ok !== true || !Array.isArray(payload.rows)) {
    const error = new Error(
      (payload && payload.error) || `OVH account read failed (${response.status})`
    );
    error.code = "OVH_BRIDGE_QUERY_FAILED";
    throw error;
  }
  return payload.rows;
}

function getIshyigaMysqlPool() {
  if (!isIshyigaMysqlConfigured()) {
    return null;
  }

  if (!pool) {
    const ssl =
      String(process.env.ISHYIGA_MYSQL_SSL || "").toLowerCase() === "true"
        ? { rejectUnauthorized: true }
        : undefined;
    pool = mysql.createPool({
      host: env.ishyigaMysqlHost,
      port: env.ishyigaMysqlPort,
      user: env.ishyigaMysqlUser,
      password: env.ishyigaMysqlPassword,
      database: env.ishyigaMysqlDatabase,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 20_000,
      enableKeepAlive: true,
      ssl,
    });
  }

  return pool;
}

async function queryIshyigaMysql(sql, params = []) {
  if (env.ishyigaOvhQueryUrl && env.ishyigaOvhQueryKey) {
    return queryViaOvhBridge(sql, params);
  }

  const active = getIshyigaMysqlPool();
  if (!active) {
    const error = new Error("Ishyiga MySQL is not configured");
    error.code = "MYSQL_NOT_CONFIGURED";
    throw error;
  }

  const [rows] = await active.query({ sql, timeout: 20_000 }, params);
  return rows;
}

module.exports = {
  isIshyigaMysqlConfigured,
  getIshyigaMysqlPool,
  queryIshyigaMysql,
};
