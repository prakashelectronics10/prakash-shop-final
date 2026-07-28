const net = require("net");
const tls = require("tls");
const crypto = require("crypto");
const env = require("../../config/env");
const AppError = require("../../utils/AppError");

const SMTP_TIMEOUT_MS = 15000;

function isSmtpConfigured() {
  return Boolean(env.smtp.enabled && env.smtp.host && env.smtp.port && env.smtp.user && env.smtp.pass && env.smtp.from);
}

function assertSmtpConfigured() {
  if (!env.smtp.enabled) throw new AppError("SMTP email delivery is disabled", 503);
  if (!isSmtpConfigured()) throw new AppError("SMTP email settings are not configured", 500);
}

function parseEmailAddress(value, fallbackName = "") {
  const raw = String(value || "").trim();
  const match = raw.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, "").trim() || fallbackName || "",
      email: match[2].trim(),
    };
  }
  return { name: fallbackName || "", email: raw };
}

function encodeHeader(value) {
  const text = String(value || "");
  return /^[\x00-\x7F]*$/.test(text)
    ? text
    : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function formatAddress(address) {
  const parsed = typeof address === "string" ? parseEmailAddress(address) : address;
  if (!parsed?.email) return "";
  return parsed.name ? `${encodeHeader(parsed.name)} <${parsed.email}>` : parsed.email;
}

function normalizeRecipients(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  const item = String(value || "").trim();
  return item ? [item] : [];
}

function dotEscape(value) {
  return String(value || "").replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function stripHtml(html = "") {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMimeMessage(message) {
  const from = parseEmailAddress(message.from || env.smtp.from, env.mail?.fromName || "Prakash Electronics");
  const to = normalizeRecipients(message.to).map((item) => parseEmailAddress(item));
  if (!from.email) throw new AppError("SMTP sender is required", 500);
  if (!to.length) throw new AppError("SMTP recipient is required", 400);

  const subject = String(message.subject || "").trim();
  const text = String(message.text || stripHtml(message.html) || "");
  const html = String(message.html || "");
  const boundary = `prakash_${crypto.randomBytes(12).toString("hex")}`;
  const headers = [
    `From: ${formatAddress(from)}`,
    `To: ${to.map(formatAddress).join(", ")}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@prakashshop.in>`,
    "Auto-Submitted: auto-generated",
    "X-Auto-Response-Suppress: OOF, AutoReply",
  ];

  if (html) {
    return {
      from: from.email,
      to: to.map((item) => item.email),
      raw: [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        text,
        "",
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        html,
        "",
        `--${boundary}--`,
        "",
      ].join("\r\n"),
    };
  }

  return {
    from: from.email,
    to: to.map((item) => item.email),
    raw: [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      text,
      "",
    ].join("\r\n"),
  };
}

function createSocket() {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    const socket = env.smtp.secure
      ? tls.connect({ host: env.smtp.host, port: env.smtp.port, servername: env.smtp.host }, () => resolve(socket))
      : net.connect({ host: env.smtp.host, port: env.smtp.port }, () => resolve(socket));
    socket.setTimeout(SMTP_TIMEOUT_MS, () => {
      socket.destroy(new AppError("SMTP connection timed out", 504));
    });
    socket.once("error", onError);
  });
}

function readResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: Number(last.slice(0, 3)), text: buffer });
      }
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

async function expect(socket, expectedCodes) {
  const response = await readResponse(socket);
  const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];
  if (!codes.includes(response.code)) {
    throw new AppError(`SMTP failed with ${response.code}: ${response.text.trim()}`, 502);
  }
  return response;
}

async function sendCommand(socket, command, expectedCodes) {
  socket.write(`${command}\r\n`);
  return expect(socket, expectedCodes);
}

async function upgradeToTls(socket) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: env.smtp.host }, () => resolve(secureSocket));
    secureSocket.once("error", reject);
    secureSocket.setTimeout(SMTP_TIMEOUT_MS, () => {
      secureSocket.destroy(new AppError("SMTP TLS timed out", 504));
    });
  });
}

async function sendSmtpEmail(message) {
  assertSmtpConfigured();
  const mime = buildMimeMessage(message);
  let socket = await createSocket();

  try {
    await expect(socket, 220);
    await sendCommand(socket, "EHLO prakashshop.in", 250);
    if (!env.smtp.secure) {
      await sendCommand(socket, "STARTTLS", 220);
      socket = await upgradeToTls(socket);
      await sendCommand(socket, "EHLO prakashshop.in", 250);
    }
    await sendCommand(socket, "AUTH LOGIN", 334);
    await sendCommand(socket, Buffer.from(env.smtp.user).toString("base64"), 334);
    await sendCommand(socket, Buffer.from(env.smtp.pass).toString("base64"), 235);
    await sendCommand(socket, `MAIL FROM:<${mime.from}>`, 250);
    for (const recipient of mime.to) {
      await sendCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
    }
    await sendCommand(socket, "DATA", 354);
    socket.write(`${dotEscape(mime.raw)}\r\n.\r\n`);
    await expect(socket, 250);
    await sendCommand(socket, "QUIT", 221).catch(() => null);
    return { provider: "smtp", messageId: "", response: { accepted: mime.to } };
  } finally {
    socket.destroy();
  }
}

module.exports = {
  assertSmtpConfigured,
  isSmtpConfigured,
  sendSmtpEmail,
};
