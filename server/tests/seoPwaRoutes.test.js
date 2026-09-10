const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("robots keeps noindex pages crawlable and blocks API endpoints", async () => {
  await withServer(async (baseUrl) => {
    const robots = await fetch(`${baseUrl}/robots.txt`).then((response) => response.text());
    assert.match(robots, /Disallow: \/api\//);
    assert.doesNotMatch(robots, /Disallow: \/(?:cart|checkout|orders|prakash-control-panel)/);
    assert.match(robots, /Sitemap: https:\/\/prakashshop\.in\/sitemap\.xml/);
  });
});

test("sitemap lists canonical service URLs and no legacy page query URLs", async () => {
  await withServer(async (baseUrl) => {
    const sitemap = await fetch(`${baseUrl}/sitemap.xml`).then((response) => response.text());
    assert.match(sitemap, /https:\/\/prakashshop\.in\/learn-more\?service=/);
    assert.doesNotMatch(sitemap, /\?page=learn-more/);
    assert.doesNotMatch(sitemap, /\/#/);
  });
});

test("legacy page URLs redirect to their canonical route", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/?page=learn-more&service=lcd-led-tv-repair`, { redirect: "manual" });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "/learn-more?service=lcd-led-tv-repair");
  });
});

test("unknown routes return a real noindex 404 document", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/definitely-not-a-real-page`);
    const html = await response.text();
    assert.equal(response.status, 404);
    assert.match(html, /<title>Page not found \| Prakash Electronics<\/title>/);
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
  });
});

test("web app manifest and service worker contain the installability essentials", () => {
  const publicDir = path.resolve(__dirname, "..", "..", "public");
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest.json"), "utf8"));
  const serviceWorker = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf8");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.match(serviceWorker, /offline\.html/);
  assert.match(serviceWorker, /\/api\//);
  assert.match(serviceWorker, /\/prakash-control-panel@1999/);
});

test("products route exposes the mobile-compatible OG image without a host redirect", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/products`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<link rel="canonical" href="https:\/\/prakashshop\.in\/products" \/>/);
    assert.match(html, /<meta property="og:image" content="https:\/\/prakashshop\.in\/og-image-shop-products\.jpg\?v=20260910-mobile" \/>/);
    assert.match(html, /<meta property="og:image:secure_url" content="https:\/\/prakashshop\.in\/og-image-shop-products\.jpg\?v=20260910-mobile" \/>/);
    assert.match(html, /<meta property="og:image:type" content="image\/jpeg" \/>/);
    assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
    assert.match(html, /<meta property="og:image:height" content="630" \/>/);
    assert.match(html, /<meta name="twitter:image" content="https:\/\/prakashshop\.in\/og-image-shop-products\.jpg\?v=20260910-mobile" \/>/);
    assert.match(html, /<meta name="twitter:image:alt" content="Prakash Electronics shop products" \/>/);
  });
});

test("products OG asset is a lightweight standard JPEG with matching hosting headers", async () => {
  const publicDir = path.resolve(__dirname, "..", "..", "public");
  const imagePath = path.join(publicDir, "og-image-shop-products.jpg");
  const image = fs.readFileSync(imagePath);
  const headers = fs.readFileSync(path.join(publicDir, "_headers"), "utf8");
  const metadata = await require("sharp")(imagePath).metadata();
  assert.deepEqual([...image.subarray(0, 3)], [255, 216, 255]);
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.ok(image.length < 300 * 1024);
  assert.match(headers, /\/og-image-shop-products\.jpg\s+Content-Type: image\/jpeg/);
});

test("manifest endpoint is fresh and always exposes installable icon sizes", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/manifest.json`);
    const manifest = await response.json();
    assert.match(response.headers.get("content-type") || "", /application\/manifest\+json/);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
    assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  });
});
