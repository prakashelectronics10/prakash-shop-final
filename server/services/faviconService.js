const dns = require("dns/promises");
const net = require("net");

const faviconCache = new Map();
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 60 * 1000;
const MAX_FAVICON_BYTES = 256 * 1024;
const MAX_REDIRECTS = 2;
const MAX_CACHE_ENTRIES = 200;

function isPrivateAddress(address) {
  const value = String(address || "").toLowerCase();
  if (!value) return true;
  if (net.isIPv4(value)) {
    const octets = value.split(".").map(Number);
    return octets[0] === 0
      || octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 0)
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19))
      || (octets[0] === 198 && octets[1] === 51 && octets[2] === 100)
      || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113)
      || octets[0] >= 224;
  }
  if (net.isIPv6(value)) {
    return value === "::"
      || value === "::1"
      || value.startsWith("fc")
      || value.startsWith("fd")
      || /^fe[89ab]/.test(value)
      || value.startsWith("ff")
      || value.startsWith("2001:db8")
      || value.startsWith("::ffff:127.")
      || value.startsWith("::ffff:10.")
      || value.startsWith("::ffff:192.168.");
  }
  return true;
}

function safeOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return "";
    if (!url.hostname || url.username || url.password || net.isIP(url.hostname)) return "";
    if (url.hostname === "localhost" || url.hostname.endsWith(".local")) return "";
    return url.origin;
  } catch (_error) {
    return "";
  }
}

async function assertPublicHostname(hostname) {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error("Favicon host is not public");
  }
}

async function fetchWithSafeRedirects(url, redirectCount = 0) {
  const parsed = new URL(url);
  await assertPublicHostname(parsed.hostname);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/x-icon,image/*;q=0.8",
        "User-Agent": "PrakashShop-Favicon/1.0",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount >= MAX_REDIRECTS) return null;
      const location = response.headers.get("location");
      const nextOrigin = safeOrigin(new URL(location || "", url).toString());
      if (!nextOrigin) return null;
      return fetchWithSafeRedirects(new URL(location, url).toString(), redirectCount + 1);
    }
    if (!response.ok) return null;

    const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/") || contentType === "image/svg+xml") return null;
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_FAVICON_BYTES) return null;

    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > MAX_FAVICON_BYTES) return null;
    return { body, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSafeFavicon(destinationUrl) {
  const origin = safeOrigin(destinationUrl);
  if (!origin) return null;

  const cached = faviconCache.get(origin);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value = null;
  try {
    value = await fetchWithSafeRedirects(`${origin}/favicon.ico`);
  } catch (_error) {
    value = null;
  }
  faviconCache.forEach((entry, key) => {
    if (entry.expiresAt <= Date.now()) faviconCache.delete(key);
  });
  while (faviconCache.size >= MAX_CACHE_ENTRIES) {
    faviconCache.delete(faviconCache.keys().next().value);
  }
  faviconCache.set(origin, {
    value,
    expiresAt: Date.now() + (value ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
  });
  return value;
}

module.exports = {
  fetchSafeFavicon,
  isPrivateAddress,
  safeOrigin,
};
