const test = require("node:test");
const assert = require("node:assert/strict");
const { isPrivateAddress, safeOrigin } = require("../services/faviconService");

test("favicon proxy accepts only public HTTPS origins", () => {
  assert.equal(safeOrigin("https://21st.dev/some/long/path?query=1"), "https://21st.dev");
  assert.equal(safeOrigin("http://21st.dev"), "");
  assert.equal(safeOrigin("javascript:alert(1)"), "");
  assert.equal(safeOrigin("https://user:password@example.com"), "");
  assert.equal(safeOrigin("https://localhost/private"), "");
  assert.equal(safeOrigin("https://127.0.0.1/private"), "");
});

test("favicon proxy blocks private, local, metadata and documentation IP ranges", () => {
  [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "::1",
    "fd00::1",
    "fe80::1",
  ].forEach((address) => assert.equal(isPrivateAddress(address), true, address));
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});
