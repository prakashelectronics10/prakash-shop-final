const test = require("node:test");
const assert = require("node:assert/strict");

const { adminCreateSchema, adminUpdateSchema } = require("../validations/adminSchemas");

test("admin permissions accept every section exposed by the access editor", () => {
  const permissions = ["orders", "pulseAI", "autoSliderBanners"];

  const createResult = adminCreateSchema.safeParse({
    name: "Store Editor",
    email: "editor@example.com",
    password: "secure-password",
    permissions,
  });
  const updateResult = adminUpdateSchema.safeParse({ permissions });

  assert.equal(createResult.success, true);
  assert.equal(updateResult.success, true);
});
