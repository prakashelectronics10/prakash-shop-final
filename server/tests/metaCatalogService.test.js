const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateBackoffMs, generatedSku } = require("../services/metaCatalogService");
const { requireSuperAdmin } = require("../middleware/auth");

test("retry backoff is bounded and exponential", () => {
  assert.equal(calculateBackoffMs(1, 1000), 1000);
  assert.equal(calculateBackoffMs(2, 1000), 2000);
  assert.equal(calculateBackoffMs(5, 1000), 16000);
  assert.equal(calculateBackoffMs(99, 1000), 60 * 60 * 1000);
});

test("generated SKU is deterministic for existing products", () => {
  const id = "66cfe4cfe4cfe4cfe4cfe4cf";
  assert.equal(generatedSku("shop-product", id), generatedSku("shop-product", id));
  assert.equal(generatedSku("project-part", id), generatedSku("project-part", id));
  assert.notEqual(generatedSku("shop-product", id), generatedSku("project-part", id));
});

test("Meta control authorization accepts owners and rejects ordinary admins", () => {
  let ownerAllowed = false;
  requireSuperAdmin({ admin: { role: "owner", email: "owner@example.com" } }, {}, () => { ownerAllowed = true; });
  assert.equal(ownerAllowed, true);

  let rejection;
  requireSuperAdmin({ admin: { role: "admin", email: "staff@example.com" } }, {}, (error) => { rejection = error; });
  assert.equal(rejection.statusCode, 403);
});
