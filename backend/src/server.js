const { env } = require("./config/env");
const { app } = require("./app");
const { logger } = require("./utils/logger");

const server = app.listen(env.port, () => {
  logger.info("Server started", {
    port: env.port,
    nodeEnv: env.nodeEnv,
    healthCheck: `http://localhost:${env.port}/api/health`,
  });
});

server.on("error", (error) => {
  logger.error("Server failed to start", {
    message: error.message,
  });
  process.exit(1);
});
