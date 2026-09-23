const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MetaCatalogApiError,
  deleteProduct,
  testConnection,
  upsertProduct,
} = require("../services/metaCatalogClient");

const config = {
  graphApiVersion: "v26.0",
  catalogId: "123456",
  accessToken: "test-token-never-log",
  requestTimeoutMs: 1000,
};

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("create/update sync uses stable retailer upsert without exposing token in URL", async () => {
  let captured;
  const result = await upsertProduct({ retailer_id: "PE-1", price: 10000 }, {
    config,
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return response(200, { id: "meta-item-1" });
    },
  });
  assert.equal(result.id, "meta-item-1");
  assert.match(captured.url, /\/v26\.0\/123456\/products$/);
  assert.doesNotMatch(captured.url, /test-token/);
  assert.equal(captured.options.headers.Authorization, "Bearer test-token-never-log");
  assert.equal(captured.options.body.get("allow_upsert"), "true");
  assert.equal(captured.options.body.get("retailer_id"), "PE-1");
});

test("delete sync deletes the stored Meta item id idempotently", async () => {
  let captured;
  const result = await deleteProduct({ itemId: "meta-item-1", retailerId: "PE-1" }, {
    config,
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return response(200, { success: true });
    },
  });
  assert.equal(result.success, true);
  assert.match(captured.url, /\/meta-item-1$/);
  assert.equal(captured.options.method, "DELETE");
});

test("connection test verifies catalog product access without requesting business fields", async () => {
  let captured;
  const result = await testConnection({
    config,
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return response(200, { data: [] });
    },
  });

  const url = new URL(captured.url);
  assert.equal(url.pathname, "/v26.0/123456/products");
  assert.equal(url.searchParams.get("fields"), "id,retailer_id");
  assert.equal(url.searchParams.get("limit"), "1");
  assert.equal(url.searchParams.has("business"), false);
  assert.equal(captured.options.method, "GET");
  assert.equal(result.id, "123456");
  assert.equal(result.productAccessVerified, true);
});

test("missing catalog permissions return a useful sanitized admin error", async () => {
  await assert.rejects(
    () => testConnection({
      config,
      fetchImpl: async () => response(400, {
        error: {
          message: "(#100) Missing permissions access_token=EASecretTokenValueThatMustNeverLeak123456",
          code: 100,
        },
      }),
    }),
    (error) => {
      assert.equal(error instanceof MetaCatalogApiError, true);
      assert.equal(error.status, 403);
      assert.match(error.message, /catalog_management/);
      assert.match(error.message, /MANAGE/);
      assert.match(error.message, /business_management is not required/);
      assert.doesNotMatch(error.message, /EASecretToken/);
      return true;
    },
  );
});

test("temporary Meta errors are retryable and invalid configuration is not", async () => {
  await assert.rejects(
    () => upsertProduct({ retailer_id: "PE-1" }, {
      config,
      fetchImpl: async () => response(429, { error: { message: "Rate limited", code: 4 } }),
    }),
    (error) => error instanceof MetaCatalogApiError && error.retryable === true,
  );
  await assert.rejects(
    () => upsertProduct({}, { config: { ...config, accessToken: "" }, fetchImpl: async () => response(200, {}) }),
    (error) => error instanceof MetaCatalogApiError && error.retryable === false,
  );
});
