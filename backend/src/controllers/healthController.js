const {
  checkDatabaseConnection,
  checkDatabaseSchema,
} = require("../config/db");
const { env } = require("../config/env");

async function getHealth(_req, res) {
  const connection = await checkDatabaseConnection();
  const schema = connection.connected
    ? await checkDatabaseSchema()
    : { ready: false, tables: {} };
  const healthy = connection.connected && schema.ready;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    service: "ishyiga-whatsapp-assistant",
    phase: 11,
    timestamp: new Date().toISOString(),
    database: {
      connected: connection.connected,
      schemaReady: schema.ready,
      tables: schema.tables,
    },
    integrations: {
      groqConfigured: Boolean(env.groqApiKey),
      whatsappSendConfigured: Boolean(
        env.whatsappAccessToken && env.whatsappPhoneNumberId
      ),
    },
  });
}

module.exports = { getHealth };
