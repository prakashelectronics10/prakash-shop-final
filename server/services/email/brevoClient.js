const env = require("../../config/env");
const AppError = require("../../utils/AppError");

function isBrevoConfigured() {
  return Boolean(env.brevo.enabled && env.brevo.apiKey && env.brevo.from);
}

function assertBrevoConfigured() {
  if (!env.brevo.enabled) {
    throw new AppError("Brevo email delivery is disabled", 503);
  }
  if (!env.brevo.apiKey || !env.brevo.from) {
    throw new AppError("Brevo email settings are not configured", 500);
  }
}

module.exports = {
  assertBrevoConfigured,
  isBrevoConfigured,
};
