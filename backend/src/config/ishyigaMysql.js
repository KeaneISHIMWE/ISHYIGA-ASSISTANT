const mysql = require("mysql2/promise");
const { env } = require("./env");

let pool = null;

function isIshyigaMysqlConfigured() {
  return Boolean(env.ishyigaMysqlPassword && env.ishyigaMysqlHost && env.ishyigaMysqlDatabase);
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
      connectTimeout: 8_000,
      enableKeepAlive: true,
      ssl,
    });
  }

  return pool;
}

async function queryIshyigaMysql(sql, params = []) {
  const active = getIshyigaMysqlPool();
  if (!active) {
    const error = new Error("Ishyiga MySQL is not configured");
    error.code = "MYSQL_NOT_CONFIGURED";
    throw error;
  }

  const [rows] = await active.query({ sql, timeout: 8_000 }, params);
  return rows;
}

module.exports = {
  isIshyigaMysqlConfigured,
  getIshyigaMysqlPool,
  queryIshyigaMysql,
};
