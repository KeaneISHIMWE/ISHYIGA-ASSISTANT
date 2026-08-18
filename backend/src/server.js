const { env } = require("./config/env");
const { app } = require("./app");
const { pool } = require("./config/db");
const { logger } = require("./utils/logger");

const SHUTDOWN_MS = 10_000;
const HOST = "0.0.0.0";

const server = app.listen(env.port, HOST, () => {
  logger.info("Server started", {
    host: HOST,
    port: env.port,
    nodeEnv: env.nodeEnv,
    healthCheck: `/api/health`,
  });
});

server.on("error", (error) => {
  logger.error("Server failed to start", {
    message: error.message,
  });
  process.exit(1);
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info("Shutting down", { signal });

  server.close((closeError) => {
    if (closeError) {
      logger.error("HTTP server close failed", {
        message: closeError.message,
      });
    }

    pool
      .end()
      .catch((error) => {
        logger.error("Database pool close failed", {
          message: error.message,
        });
      })
      .finally(() => {
        process.exit(closeError ? 1 : 0);
      });
  });

  setTimeout(() => {
    logger.error("Shutdown timed out");
    process.exit(1);
  }, SHUTDOWN_MS).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
