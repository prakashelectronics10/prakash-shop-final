const env = require("../config/env");
const { logger } = require("../utils/logger");

function notFound(req, _res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  const isProd = env.nodeEnv === "production";

  if (!isProd || statusCode >= 500) {
    logger.error("api.error", {
      statusCode,
      message: error.message,
      stack: isProd ? undefined : error.stack,
    });
  }

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && isProd ? "Server error" : error.message,
    details: error.details,
  });
}

module.exports = { notFound, errorHandler };
