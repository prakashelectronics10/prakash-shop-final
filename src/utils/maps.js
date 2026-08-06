const GOOGLE_MAP_HOSTS = new Set(["www.google.com", "google.com", "maps.google.com"]);

function extractSrc(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/src=["']([^"']+)["']/i);
  return match ? match[1] : raw;
}

export function getSafeGoogleMapEmbedUrl(value) {
  const raw = extractSrc(value);
  if (!raw) return "";

  let url;
  try {
    url = new URL(raw, window.location.origin);
  } catch (_error) {
    return "";
  }

  if (!GOOGLE_MAP_HOSTS.has(url.hostname)) return "";
  url.protocol = "https:";

  if (!url.pathname.includes("/maps/embed")) {
    url.searchParams.set("output", "embed");
  }

  return url.toString();
}
