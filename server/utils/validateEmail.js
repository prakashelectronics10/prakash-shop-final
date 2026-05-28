const dns = require("dns/promises");

const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const CACHE_TTL_MS = 10 * 60 * 1000;
const DNS_TIMEOUT_MS = Number(process.env.EMAIL_VERIFY_DNS_TIMEOUT_MS || 3000);
const cache = new Map();

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "guerrillamail.com",
  "maildrop.cc",
  "mailinator.com",
  "moakt.com",
  "sharklasers.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
]);

const COMMON_DOMAIN_FIXES = new Map([
  ["gamil.com", "gmail.com"],
  ["gmial.com", "gmail.com"],
  ["gmai.com", "gmail.com"],
  ["gmail.co", "gmail.com"],
  ["gnail.com", "gmail.com"],
  ["hotmial.com", "hotmail.com"],
  ["hotmai.com", "hotmail.com"],
  ["outlok.com", "outlook.com"],
  ["outlook.co", "outlook.com"],
  ["yaho.com", "yahoo.com"],
  ["yahoo.co", "yahoo.com"],
]);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isEmailSyntaxValid(email) {
  const normalized = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalized)) return false;
  const [local, domain] = normalized.split("@");
  if (!local || !domain || local.length > 64 || normalized.length > 254) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  return domain
    .split(".")
    .every((label) => label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"));
}

function cached(email) {
  const hit = cache.get(email);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(email);
    return null;
  }
  return hit.result;
}

function setCached(email, result) {
  cache.set(email, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

async function withTimeout(promise, ms = DNS_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Email DNS validation timed out")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function hasMailExchange(domain) {
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (Array.isArray(mx) && mx.some((record) => record.exchange && record.exchange !== ".")) {
      return true;
    }
  } catch (_error) {
    // Some valid domains send from their root A/AAAA records without an MX.
  }

  try {
    const addresses = await withTimeout(dns.resolve(domain));
    return Array.isArray(addresses) && addresses.length > 0;
  } catch (_error) {
    return false;
  }
}

async function validateEmailDeliverability(email, options = {}) {
  const normalized = normalizeEmail(email);
  const cachedResult = !options.force ? cached(normalized) : null;
  if (cachedResult) return cachedResult;

  if (!isEmailSyntaxValid(normalized)) {
    return setCached(normalized, { valid: false, email: normalized, reason: "Invalid email address" });
  }

  const [local, domain] = normalized.split("@");
  if (
    /^(test|fake|demo|sample|example|admin|user)\d*$/i.test(local) ||
    /^(random|fake|test|asdf|qwerty|lettersnumbers)[a-z0-9._-]*$/i.test(local)
  ) {
    return setCached(normalized, { valid: false, email: normalized, reason: "Invalid email address" });
  }

  if (["example.com", "example.org", "example.net", "test.com", "invalid.com"].includes(domain)) {
    return setCached(normalized, { valid: false, email: normalized, reason: "Invalid email address" });
  }

  if (COMMON_DOMAIN_FIXES.has(domain)) {
    return setCached(normalized, {
      valid: false,
      email: normalized,
      reason: `Invalid email domain. Did you mean ${COMMON_DOMAIN_FIXES.get(domain)}?`,
    });
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return setCached(normalized, { valid: false, email: normalized, reason: "Temporary email addresses are not allowed" });
  }

  const domainReceivesMail = await hasMailExchange(domain);
  if (!domainReceivesMail) {
    return setCached(normalized, { valid: false, email: normalized, reason: "Invalid email address" });
  }

  return setCached(normalized, {
    valid: true,
    email: normalized,
    reason: "Email domain verified",
    verification: "dns",
  });
}

module.exports = { isEmailSyntaxValid, normalizeEmail, validateEmailDeliverability };
