const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const app = require("../app");

async function withServer(run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("canonical catalogues advertise their one-to-one AMP pages", async () => {
  await withServer(async (baseUrl) => {
    const products = await fetch(`${baseUrl}/products`).then((response) => response.text());
    const wiring = await fetch(`${baseUrl}/wiring-parts`).then((response) => response.text());
    assert.match(products, /<link rel="amphtml" href="https:\/\/prakashshop\.in\/amp\/products" \/>/);
    assert.match(wiring, /<link rel="amphtml" href="https:\/\/prakashshop\.in\/amp\/wiring-parts" \/>/);
    assert.equal((products.match(/rel="amphtml"/g) || []).length, 1);
  });
});

test("AMP catalogue route is server rendered and cacheable", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/amp/products`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.match(response.headers.get("cache-control"), /max-age=120/);
    assert.match(html, /<html amp lang="en">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/prakashshop\.in\/products">/);
  });
});

test("Pulse AI server metadata uses the requested optimized title and description", async () => {
  await withServer(async (baseUrl) => {
    const html = await fetch(`${baseUrl}/pulse-ai`).then((response) => response.text());
    assert.match(html, /<title>Pulse AI by Prakash Electronics \| Prakash Electronics and Electricals<\/title>/);
    assert.match(html, /<meta name="description" content="Pulse AI helps you find suitable electronics products, wiring accessories, repair guidance, offers, and service-booking options from Prakash Electronics\." \/>/);
  });
});
