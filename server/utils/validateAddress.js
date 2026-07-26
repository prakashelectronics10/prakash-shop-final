const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = Number(process.env.ADDRESS_VERIFY_TIMEOUT_MS || 8000);
const NOMINATIM_GAP_MS = 1100;
const USER_AGENT = process.env.ADDRESS_VERIFY_USER_AGENT
  || "PrakashElectronicsBooking/1.0 (https://prakashshop.in; booking-address-verify)";

const cache = new Map();
let lastNominatimAt = 0;

function normalizeQuery(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cacheKey(kind, value) {
  return `${kind}:${normalizeQuery(value).toLowerCase()}`;
}

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Address lookup failed (${response.status})`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function throttleNominatim() {
  const wait = Math.max(0, NOMINATIM_GAP_MS - (Date.now() - lastNominatimAt));
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastNominatimAt = Date.now();
}

function extractPin(query) {
  const match = String(query || "").match(/\b(\d{6})\b/);
  return match ? match[1] : "";
}

function looksLikeGarbage(query) {
  const value = normalizeQuery(query);
  if (value.length < 6) return true;
  if (!/[a-zA-Z]/.test(value) && !/\d{6}/.test(value)) return true;
  // Repeated junk like "aaaaaa" / "111111" (except real-looking PIN handled later)
  if (/^(.)\1{5,}$/.test(value.replace(/\s/g, ""))) return true;
  if (/^(test|asdf|qwerty|abc|xyz|none|n\/a|na|null|undefined)/i.test(value)) return true;
  return false;
}

function formatFromNominatim(item) {
  const address = item?.address || {};
  const parts = [
    address.house_number,
    address.road || address.pedestrian || address.path,
    address.neighbourhood || address.suburb || address.village || address.hamlet,
    address.city || address.town || address.municipality || address.county,
    address.state_district || address.district,
    address.state,
    address.postcode,
    address.country,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  const unique = [];
  parts.forEach((part) => {
    if (!unique.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
      unique.push(part);
    }
  });

  const formatted = unique.length >= 2
    ? unique.join(", ")
    : String(item?.display_name || "").trim();

  return {
    placeId: String(item?.place_id || ""),
    formatted,
    displayName: String(item?.display_name || formatted).trim(),
    lat: item?.lat ? Number(item.lat) : null,
    lon: item?.lon ? Number(item.lon) : null,
    type: String(item?.type || item?.class || ""),
    importance: Number(item?.importance || 0),
    postcode: String(address.postcode || extractPin(formatted) || ""),
    state: String(address.state || ""),
    city: String(address.city || address.town || address.village || address.municipality || ""),
    countryCode: String(address.country_code || "").toLowerCase(),
  };
}

function isAcceptablePlace(place) {
  if (!place?.formatted || place.formatted.length < 8) return false;
  if (place.countryCode && place.countryCode !== "in") return false;
  // Prefer real localities over unnamed map points
  if (!place.city && !place.state && !place.postcode) return false;
  return true;
}

async function lookupIndianPin(pin) {
  const key = cacheKey("pin", pin);
  const cached = getCached(key);
  if (cached) return cached;

  try {
    const data = await fetchJson(`https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`);
    const row = Array.isArray(data) ? data[0] : null;
    if (!row || String(row.Status || "").toLowerCase() !== "success" || !Array.isArray(row.PostOffice) || !row.PostOffice.length) {
      return setCached(key, null);
    }

    const office = row.PostOffice[0];
    const formatted = [
      office.Name,
      office.Block,
      office.District,
      office.State,
      pin,
      "India",
    ].filter(Boolean).filter((part, index, arr) => arr.findIndex((item) => item.toLowerCase() === part.toLowerCase()) === index)
      .join(", ");

    return setCached(key, {
      placeId: `pin:${pin}`,
      formatted,
      displayName: formatted,
      lat: null,
      lon: null,
      type: "postcode",
      importance: 0.7,
      postcode: pin,
      state: String(office.State || ""),
      city: String(office.District || office.Block || office.Name || ""),
      countryCode: "in",
      source: "india-post",
    });
  } catch (_error) {
    return setCached(key, null);
  }
}

async function searchNominatim(query, limit = 5) {
  const key = cacheKey(`search:${limit}`, query);
  const cached = getCached(key);
  if (cached) return cached;

  await throttleNominatim();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", String(Math.min(8, Math.max(1, limit))));

  const rows = await fetchJson(url.toString());
  const places = (Array.isArray(rows) ? rows : [])
    .map(formatFromNominatim)
    .filter(isAcceptablePlace);

  return setCached(key, places);
}

/**
 * Suggest real Indian locations for autocomplete.
 */
async function suggestAddresses(query, limit = 6) {
  const normalized = normalizeQuery(query);
  if (normalized.length < 3) {
    return { suggestions: [], message: "Type at least 3 characters" };
  }

  const pin = extractPin(normalized);
  const suggestions = [];

  if (pin) {
    const pinPlace = await lookupIndianPin(pin);
    if (pinPlace) suggestions.push(pinPlace);
  }

  try {
    const places = await searchNominatim(normalized, limit);
    places.forEach((place) => {
      if (!suggestions.some((item) => item.formatted.toLowerCase() === place.formatted.toLowerCase())) {
        suggestions.push(place);
      }
    });
  } catch (_error) {
    // PIN result alone is still useful when Nominatim is rate-limited.
  }

  return {
    suggestions: suggestions.slice(0, limit),
    message: suggestions.length
      ? "Select a verified location"
      : "No matching place found. Try City, Area, State or PIN code",
  };
}

/**
 * Verify that an address exists as a real place (India-focused).
 */
async function validateAddress(query, options = {}) {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return { valid: false, reason: "Location / Address is required", address: "" };
  }
  if (looksLikeGarbage(normalized)) {
    return {
      valid: false,
      reason: "Enter a real location like: Chitarpur, Ramgarh, Jharkhand 825101",
      address: normalized,
    };
  }

  const verifyKey = cacheKey("verify", normalized);
  const cached = getCached(verifyKey);
  if (cached) return cached;

  const pin = extractPin(normalized);
  let pinPlace = null;
  if (pin) {
    pinPlace = await lookupIndianPin(pin);
    if (!pinPlace && /^\d{6}$/.test(normalized)) {
      return setCached(verifyKey, {
        valid: false,
        reason: "This PIN code does not exist in India",
        address: normalized,
      });
    }
  }

  let places = [];
  try {
    places = await searchNominatim(normalized, options.limit || 5);
  } catch (error) {
    if (pinPlace) {
      return setCached(verifyKey, {
        valid: true,
        reason: "Location verified via PIN code",
        address: pinPlace.formatted,
        place: pinPlace,
      });
    }
    return setCached(verifyKey, {
      valid: false,
      reason: error.message || "Unable to verify location right now. Please try again.",
      address: normalized,
    });
  }

  if (pinPlace) {
    places = [pinPlace, ...places.filter((place) => place.postcode !== pin)];
  }

  const exact = places.find((place) => {
    const left = place.formatted.toLowerCase();
    const right = normalized.toLowerCase();
    return left === right
      || left.includes(right)
      || right.includes(left)
      || (place.displayName && place.displayName.toLowerCase().includes(right));
  }) || places[0];

  if (!exact) {
    return setCached(verifyKey, {
      valid: false,
      reason: "This location was not found. Choose a real City / Area / PIN from suggestions.",
      address: normalized,
      suggestions: [],
    });
  }

  // If user typed only a vague word but we got a match, still require enough specificity
  const wordCount = normalized.split(" ").filter(Boolean).length;
  if (wordCount < 2 && !pin && exact.importance < 0.35) {
    return setCached(verifyKey, {
      valid: false,
      reason: "Please enter a more complete address (Area, City, State or PIN).",
      address: normalized,
      suggestions: places.slice(0, 5),
    });
  }

  return setCached(verifyKey, {
    valid: true,
    reason: "Location verified",
    address: exact.formatted,
    place: exact,
    suggestions: places.slice(0, 5),
  });
}

module.exports = {
  normalizeQuery,
  suggestAddresses,
  validateAddress,
};
