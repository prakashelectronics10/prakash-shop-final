const SENSITIVE_KEY_PATTERN = /(password|secret|token|api[_-]?key|authorization|cookie|pass)/i;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redact(item),
    ]),
  );
}

function write(level, message, meta = {}) {
  const payload = {
    level,
    message,
    service: "prakash-api",
    timestamp: new Date().toISOString(),
    ...redact(meta),
  };

  const line = process.env.NODE_ENV === "production"
    ? JSON.stringify(payload)
    : `${payload.timestamp} ${level.toUpperCase()} ${message} ${Object.keys(meta).length ? JSON.stringify(redact(meta)) : ""}`;

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

const logger = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
};

module.exports = { logger };
