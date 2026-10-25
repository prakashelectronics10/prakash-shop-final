const dns = require("dns/promises");
const net = require("net");

const MAX_HTML_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

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

async function assertPublicHostname(hostname) {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error("URL host is not public");
  }
}

function absolutize(baseUrl, value) {
  try {
    return new URL(value, baseUrl).toString();
  } catch (_error) {
    return "";
  }
}

function extractMetaContent(html, propertyNames) {
  for (const name of propertyNames) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return "";
}

async function fetchHtml(url, redirectCount = 0) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }
  await assertPublicHostname(parsed.hostname);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "PrakashShop-OGPreview/1.0",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount >= MAX_REDIRECTS) throw new Error("Too many redirects");
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect without location");
      return fetchHtml(absolutize(url, location), redirectCount + 1);
    }

    if (!response.ok) {
      throw new Error(`Unable to fetch URL (${response.status})`);
    }

    const contentType = String(response.headers.get("content-type") || "");
    if (contentType.startsWith("image/")) {
      return { kind: "image", imageUrl: url, title: "", description: "" };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_HTML_BYTES) {
      throw new Error("Page is too large to parse");
    }
    return {
      kind: "html",
      html: buffer.toString("utf8"),
      finalUrl: url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveOgImage(pageUrl) {
  const raw = String(pageUrl || "").trim();
  if (!raw) throw new Error("URL is required");

  const result = await fetchHtml(raw);
  if (result.kind === "image") {
    return {
      imageUrl: result.imageUrl,
      title: "",
      description: "",
      sourceUrl: raw,
    };
  }

  const ogImage = extractMetaContent(result.html, ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"]);
  const title = extractMetaContent(result.html, ["og:title", "twitter:title"]);
  const description = extractMetaContent(result.html, ["og:description", "twitter:description", "description"]);
  const imageUrl = ogImage ? absolutize(result.finalUrl, ogImage) : "";

  if (!imageUrl) {
    throw new Error("No Open Graph image found on that page");
  }

  const imageHost = new URL(imageUrl).hostname;
  await assertPublicHostname(imageHost);

  return {
    imageUrl,
    title: title.slice(0, 200),
    description: description.slice(0, 400),
    sourceUrl: raw,
  };
}

module.exports = { resolveOgImage };
