const app = require("./app");
const connectDB = require("./config/db");
const env = require("./config/env");
const { validateRuntimeConfig } = require("./config/runtimeChecks");
const { logger } = require("./utils/logger");
const { setupDiscussionSocket } = require("./services/discussionSocket");
const { startDiscussionRetentionCleanup } = require("./services/discussionRetentionService");

let server;

async function startServer() {
  validateRuntimeConfig();

  server = app.listen(env.port, () => {
    logger.info("server.listening", { port: env.port, nodeEnv: env.nodeEnv });
  });

  setupDiscussionSocket(server);
  startDiscussionRetentionCleanup();

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  connectDB().catch((error) => {
    logger.error("mongodb.initial_connection_failed", {
      error: error.message,
      action: "Server remains online with fallback public content. Fix MONGODB_URI or Atlas network access for admin/database features.",
    });
  });
}

startServer();

process.on("uncaughtException", (error) => {
  logger.error("process.uncaught_exception", { error: error.stack || error.message });
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on("unhandledRejection", (error) => {
  logger.error("process.unhandled_rejection", { error: error?.stack || error?.message || String(error) });
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on("SIGTERM", () => {
  if (server) {
    server.close(() => process.exit(0));
  }
});
