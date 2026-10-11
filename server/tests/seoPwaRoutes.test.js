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
    assert.match(sitemap, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
    assert.match(sitemap, /<image:image>/);
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

test("unavailable product detail URLs redirect customers to the catalogue", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/product/no-longer-available`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/products");
  });
});

test("gallery page exposes current images as structured data", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/gallery`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<script type="application\/ld\+json" data-gallery-seo>/);
    assert.match(html, /"@type":"ImageGallery"/);
  });
});

test("homepage and about pages expose live section image structured data", async () => {
  await withServer(async (baseUrl) => {
    const [home, about] = await Promise.all([
      fetch(`${baseUrl}/`).then(async (response) => ({ status: response.status, html: await response.text() })),
      fetch(`${baseUrl}/about`).then(async (response) => ({ status: response.status, html: await response.text() })),
    ]);
    assert.equal(home.status, 200);
    assert.equal(about.status, 200);
    assert.match(home.html, /Prakash Electronics/);
    assert.match(home.html, /Electronics shop in Chitarpur|repair shop in Chitarpur|Prakash shop/i);
    assert.match(about.html, /About Prakash Electronics/);
    // Structured data scripts are present when live images exist; empty sections omit them.
    if (home.html.includes("data-home-image-seo")) {
      assert.match(home.html, /<script type="application\/ld\+json" data-home-image-seo>/);
      assert.match(home.html, /"@type":"ImageGallery"/);
    }
    if (about.html.includes("data-about-image-seo")) {
      assert.match(about.html, /<script type="application\/ld\+json" data-about-image-seo>/);
    }
  });
});

test("removed customer and admin cancellation endpoints return 404", async () => {
  await withServer(async (baseUrl) => {
    const customerResponse = await fetch(`${baseUrl}/api/orders/track/PE-TEST/cancellation`, { method: "POST" });
    const adminResponse = await fetch(`${baseUrl}/api/orders/admin/000000000000000000000000/cancellation`, { method: "PATCH" });
    assert.equal(customerResponse.status, 404);
    assert.equal(adminResponse.status, 404);
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
    assert.match(html, /<meta name="twitter:image:alt" content="Prakash Electronics shop products in Chitarpur" \/>/);
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

test("homepage shell marks its critical fallback hero image for immediate hydration", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<link rel="preload" as="image"[^>]*fetchpriority="high"[^>]*data-hero-image="true"/);
    assert.match(html, /imagesrcset="[^"]*hero-technician-720\.avif 720w/);
  });
});

test("dynamic Cloudinary hero preload matches the responsive AVIF requested by the client", () => {
  const source = "https://res.cloudinary.com/demo/image/upload/c_limit,f_auto,q_auto:good,w_1600/v1/prakash-electronics/hero?_a=test";
  const tag = app.heroPreloadTag({
    id: "hero-1",
    imageUrl: source,
    alt: "Homepage hero",
    link: "/products",
  });

  assert.match(tag, /href="https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/f_avif,q_auto:good,c_limit,w_960\/v1\/prakash-electronics\/hero\?_a=test"/);
  assert.match(tag, /imagesrcset="[^"]*f_avif,q_auto:good,c_limit,w_360[^"]* 360w/);
  assert.match(tag, /imagesrcset="[^"]*f_avif,q_auto:good,c_limit,w_720[^"]* 720w/);
  assert.match(tag, /imagesizes="\(min-width: 1024px\) 42vw, 92vw"/);
  assert.match(tag, /fetchpriority="high"/);
  assert.match(tag, /data-hero-src="https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/c_limit,f_auto,q_auto:good,w_1600\/v1\/prakash-electronics\/hero\?_a=test"/);
  assert.match(tag, /data-hero-id="hero-1"/);
  assert.match(tag, /data-hero-link="\/products"/);
});
