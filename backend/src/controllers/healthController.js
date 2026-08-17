const {
  checkDatabaseConnection,
  checkDatabaseSchema,
} = require("../config/db");

async function getHealth(_req, res) {
  const connection = await checkDatabaseConnection();
  const schema = connection.connected
    ? await checkDatabaseSchema()
    : { ready: false, tables: {} };
  const healthy = connection.connected && schema.ready;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    service: "ishyiga-whatsapp-assistant",
    phase: 6,
    timestamp: new Date().toISOString(),
    database: {
      connected: connection.connected,
      schemaReady: schema.ready,
      tables: schema.tables,
    },
  });
}

module.exports = { getHealth };
