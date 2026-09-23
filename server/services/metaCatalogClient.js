const env = require("../config/env");

const GRAPH_ORIGIN = "https://graph.facebook.com";

class MetaCatalogApiError extends Error {
  constructor(message, { status = 0, code = null, subcode = null, retryable = false } = {}) {
    super(message);
    this.name = "MetaCatalogApiError";
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.retryable = retryable;
  }
}

function sanitizedMetaMessage(error, fallback = "Meta Catalog request failed.") {
  const message = String(error?.message || fallback)
    .replace(/EA[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/access[_ -]?token\s*[=:]\s*[^\s&]+/gi, "access token=[redacted]")
    .slice(0, 500);
  return message || fallback;
}

function isMissingPermissionsError(error) {
  return Number(error?.code) === 100 && /missing permissions?/i.test(String(error?.message || ""));
}

function adminMetaMessage(error) {
  if (isMissingPermissionsError(error)) {
    return "Meta Catalog permission denied. Use a System User token with catalog_management and assign MANAGE access to the configured catalog. business_management is not required for product catalog sync.";
  }
  return sanitizedMetaMessage(error);
}

function assertConfig(config = env.metaCatalog) {
  if (!/^v\d+\.\d+$/.test(String(config.graphApiVersion || ""))) {
    throw new MetaCatalogApiError("META_GRAPH_API_VERSION must look like v26.0.", { retryable: false });
  }
  if (!config.catalogId) {
    throw new MetaCatalogApiError("META_CATALOG_ID is not configured.", { retryable: false });
  }
  if (!config.accessToken) {
    throw new MetaCatalogApiError("META_ACCESS_TOKEN is not configured.", { retryable: false });
  }
}

function graphUrl(path, config = env.metaCatalog) {
  return `${GRAPH_ORIGIN}/${config.graphApiVersion}/${String(path).replace(/^\/+/, "")}`;
}

function encodeGraphBody(data = {}) {
  const body = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    body.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });
  return body;
}

function isRetryableMetaError(status, code) {
  return status === 408 || status === 429 || status >= 500 || [1, 2, 4, 17, 32, 613].includes(Number(code));
}

async function graphRequest(path, {
  method = "GET",
  query = {},
  body,
  config = env.metaCatalog,
  fetchImpl = global.fetch,
} = {}) {
  assertConfig(config);
  const url = new URL(graphUrl(path, config));
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(config.requestTimeoutMs || 15000)));
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: body ? encodeGraphBody(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    const message = error?.name === "AbortError" ? "Meta Catalog request timed out." : "Meta Catalog network request failed.";
    throw new MetaCatalogApiError(message, { retryable: true });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const metaError = payload.error || {};
    const missingPermissions = isMissingPermissionsError(metaError);
    throw new MetaCatalogApiError(adminMetaMessage(metaError), {
      status: missingPermissions ? 403 : response.status,
      code: metaError.code,
      subcode: metaError.error_subcode,
      retryable: isRetryableMetaError(response.status, metaError.code),
    });
  }
  return payload;
}

async function upsertProduct(payload, options = {}) {
  const config = options.config || env.metaCatalog;
  return graphRequest(`${config.catalogId}/products`, {
    ...options,
    config,
    method: "POST",
    body: { ...payload, allow_upsert: true },
  });
}

async function findProductByRetailerId(retailerId, options = {}) {
  const config = options.config || env.metaCatalog;
  const payload = await graphRequest(`${config.catalogId}/products`, {
    ...options,
    config,
    query: {
      fields: "id,retailer_id",
      limit: 10,
      filter: { retailer_id: { eq: retailerId } },
    },
  });
  return (payload.data || []).find((item) => String(item.retailer_id) === String(retailerId)) || null;
}

async function deleteProduct({ itemId, retailerId }, options = {}) {
  const target = itemId ? { id: itemId } : await findProductByRetailerId(retailerId, options);
  if (!target?.id) return { success: true, alreadyAbsent: true };
  return graphRequest(target.id, { ...options, method: "DELETE" });
}

async function testConnection(options = {}) {
  const config = options.config || env.metaCatalog;
  await graphRequest(`${config.catalogId}/products`, {
    ...options,
    config,
    query: { fields: "id,retailer_id", limit: 1 },
  });
  return {
    id: config.catalogId,
    name: "Meta product catalog",
    productAccessVerified: true,
  };
}

module.exports = {
  MetaCatalogApiError,
  assertConfig,
  deleteProduct,
  findProductByRetailerId,
  graphRequest,
  graphUrl,
  sanitizedMetaMessage,
  testConnection,
  upsertProduct,
};
