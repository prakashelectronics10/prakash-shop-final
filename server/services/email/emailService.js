const env = require("../../config/env");
const AppError = require("../../utils/AppError");
const { logger } = require("../../utils/logger");
const { assertBrevoConfigured, isBrevoConfigured } = require("./brevoClient");
const { isSmtpConfigured, sendSmtpEmail } = require("./smtpClient");
const { renderOtpEmail } = require("./templates/otpTemplate");

const DEFAULT_EMAIL_TIMEOUT_MS = 12000;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 1200, 4000];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatFromAddress(value) {
  const from = String(value || "").trim();
  if (!from) return "";
  if (from.includes("<") && from.includes(">")) return from;
  const displayName = String(env.mail?.fromName || env.brevo.fromName || "Prakash Electronics").trim();
  return `${displayName} <${from}>`;
}

function parseEmailAddress(value, fallbackName = "") {
  const raw = String(value || "").trim();
  const match = raw.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, "").trim() || fallbackName || undefined,
      email: match[2].trim(),
    };
  }
  return {
    name: fallbackName || undefined,
    email: raw,
  };
}

function normalizeRecipients(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  const item = String(value || "").trim();
  return item ? [item] : [];
}

function normalizeHeaders(headers = {}) {
  if (!headers || typeof headers !== "object") return undefined;
  const entries = Object.entries(headers).filter(([key, value]) => key && value);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function serializeAttachments(attachments = []) {
  return attachments
    .filter((item) => item && (item.path || item.content))
    .map((item) => ({
      name: item.filename || item.name,
      url: item.path && /^https?:\/\//i.test(item.path) ? item.path : undefined,
      content: item.content
        ? (Buffer.isBuffer(item.content) ? item.content.toString("base64") : item.content)
        : undefined,
    }));
}

function normalizeTags(tags = []) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (!tag) return "";
      if (typeof tag === "string") return tag;
      return [tag.name, tag.value].filter(Boolean).join(":");
    })
    .map((tag) => String(tag).trim().replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 50))
    .filter(Boolean);
}

function normalizeMessage(message = {}) {
  const to = normalizeRecipients(message.to);
  if (!to.length) throw new AppError("Email recipient is required", 400);
  if (!message.subject) throw new AppError("Email subject is required", 400);
  if (!message.html && !message.text) throw new AppError("Email content is required", 400);

  const headers = normalizeHeaders({
    ...(message.headers || {}),
    "Auto-Submitted": "auto-generated",
    "X-Auto-Response-Suppress": "OOF, AutoReply",
  });

  const from = formatFromAddress(message.from || env.brevo.from);
  const sender = parseEmailAddress(from, env.brevo.fromName || env.mail?.fromName || "Prakash Electronics");
  const replyTo = normalizeRecipients(message.replyTo || env.mail?.replyTo)[0];

  const payload = {
    sender,
    to,
    cc: normalizeRecipients(message.cc),
    bcc: normalizeRecipients(message.bcc),
    subject: message.subject,
    htmlContent: message.html || `<pre>${String(message.text || "").replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char]))}</pre>`,
    textContent: message.text,
    replyTo: replyTo ? parseEmailAddress(replyTo) : undefined,
    attachments: serializeAttachments(message.attachments),
    tags: normalizeTags(message.tags),
    headers,
  };

  payload.to = payload.to.map((email) => parseEmailAddress(email));
  payload.cc = payload.cc?.map((email) => parseEmailAddress(email));
  payload.bcc = payload.bcc?.map((email) => parseEmailAddress(email));
  if (payload.attachments?.length) {
    payload.attachment = payload.attachments.filter((item) => item.name && (item.url || item.content));
  }
  delete payload.attachments;

  Object.keys(payload).forEach((key) => {
    if (
      payload[key] === undefined ||
      payload[key] === "" ||
      (Array.isArray(payload[key]) && payload[key].length === 0)
    ) {
      delete payload[key];
    }
  });

  return payload;
}

async function sendBrevoEmailOnce(message, options = {}) {
  const payload = normalizeMessage(message);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_EMAIL_TIMEOUT_MS);

  try {
    assertBrevoConfigured();
    if (options.idempotencyKey || message.idempotencyKey) {
      payload.headers = {
        ...(payload.headers || {}),
        "X-Idempotency-Key": options.idempotencyKey || message.idempotencyKey,
      };
    }

    const response = await fetch(env.brevo.apiUrl, {
      method: "POST",
      headers: {
        "api-key": env.brevo.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new AppError(
        body.message || body.error || `Brevo email delivery failed with ${response.status}`,
        response.status || 502,
      );
    }

    const messageId = body.messageId || body.id || "";
    logger.info("email.sent", {
      provider: "brevo",
      messageId,
      to: payload.to.map((item) => item.email),
      subject: payload.subject,
      tags: payload.tags,
    });

    return {
      provider: "brevo",
      messageId,
      response: body,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new AppError("Brevo API timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendEmailOnce(message, options = {}) {
  let brevoError = null;

  if (isBrevoConfigured()) {
    try {
      return await sendBrevoEmailOnce(message, options);
    } catch (error) {
      brevoError = error;
      logger.warn("email.brevo_failed_trying_smtp", {
        to: normalizeRecipients(message.to),
        subject: message.subject,
        error: error.message,
      });
    }
  }

  if (isSmtpConfigured()) {
    const result = await sendSmtpEmail(message);
    logger.info("email.sent", {
      provider: "smtp",
      to: normalizeRecipients(message.to),
      subject: message.subject,
      tags: normalizeTags(message.tags),
    });
    return result;
  }

  if (brevoError) throw brevoError;
  assertBrevoConfigured();
  throw new AppError("Email settings are not configured", 500);
}

async function sendEmail(message = {}, options = {}) {
  const maxAttempts = Number(options.maxAttempts || DEFAULT_MAX_ATTEMPTS);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) {
        logger.warn("email.retrying", {
          attempt,
          to: normalizeRecipients(message.to),
          subject: message.subject,
        });
      }
      return await sendEmailOnce(message, options);
    } catch (error) {
      lastError = error;
      logger.error("email.failed_attempt", {
        attempt,
        maxAttempts,
        to: normalizeRecipients(message.to),
        subject: message.subject,
        error: error.message,
      });
      if (attempt < maxAttempts) {
        await wait(RETRY_DELAYS_MS[attempt] || 4000);
      }
    }
  }

  throw lastError;
}

async function sendOtpEmail({ to, otp, purpose }) {
  const expiresMinutes = Math.max(1, Math.round(env.otpExpiresMs / 60000));
  const template = renderOtpEmail({ otp, purpose, expiresMinutes });

  return sendEmail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
    tags: [
      { name: "type", value: "otp" },
      { name: "purpose", value: String(purpose || "login").slice(0, 48) },
    ],
  }, {
    idempotencyKey: `otp-${purpose || "login"}-${Date.now()}-${String(to).toLowerCase()}`,
  });
}

module.exports = {
  formatFromAddress,
  isBrevoConfigured,
  isEmailConfigured: () => isBrevoConfigured() || isSmtpConfigured(),
  sendEmail,
  sendMail: sendEmail,
  sendOtpEmail,
};
