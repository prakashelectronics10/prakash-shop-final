const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AMP_RUNTIME,
  renderAmpCatalogPage,
  renderAmpNotFound,
  renderAmpProductPage,
} = require("../services/ampPageService");

const origin = "https://prakashshop.in";
const product = {
  identifier: "bldc-fan",
  name: "BLDC Fan & Remote",
  title: "BLDC Fan & Remote",
  description: "Energy-efficient fan with remote control.",
  fullDescription: "Energy-efficient fan with remote control and multiple speeds.",
  shortDescription: "Efficient fan with remote.",
  image: `${origin}/fan.jpg`,
  images: [`${origin}/fan.jpg`, `${origin}/fan-side.jpg`],
  imageAlt: "BLDC fan",
  sourceType: "shop-product",
  category: "Fans",
  brand: "Example",
  sku: "PE-FAN-1",
  condition: "new",
  mrp: 3000,
  price: 2500,
  discountPercent: 17,
  availability: "https://schema.org/InStock",
  availabilityLabel: "In Stock",
  specifications: [{ label: "Speed", value: "5 levels" }],
  shipping: {},
  publicOffers: [],
};

function assertAmpShell(html) {
  assert.match(html, /^<!doctype html>\s*<html amp lang="en">/);
  assert.match(html, new RegExp(`<script async src="${AMP_RUNTIME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"></script>`));
  assert.match(html, /<style amp-boilerplate>/);
  assert.match(html, /<noscript><style amp-boilerplate>/);
  assert.match(html, /<style amp-custom>/);
  assert.doesNotMatch(html, /<script[^>]+static\/js/i);
  assert.doesNotMatch(html, /<img\b/i);
}

test("renders an AMP product with canonical, real commerce data and AMP images", () => {
  const html = renderAmpProductPage(product, origin);
  assertAmpShell(html);
  assert.match(html, /<link rel="canonical" href="https:\/\/prakashshop\.in\/product\/bldc-fan">/);
  assert.match(html, /<amp-img[^>]+fan\.jpg/);
  assert.match(html, /₹2,500/);
  assert.match(html, /BLDC Fan &amp; Remote/);
  assert.match(html, /"@type":"Product"/);
  assert.match(html, /View product and add to cart/);
});

test("renders canonical AMP catalogue and crawlable AMP product links", () => {
  const html = renderAmpCatalogPage({ products: [product], sourceType: "shop-product", origin });
  assertAmpShell(html);
  assert.match(html, /<link rel="canonical" href="https:\/\/prakashshop\.in\/products">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/prakashshop\.in\/og-image-shop-products\.jpg\?v=20260910-mobile">/);
  assert.match(html, /<meta property="og:image:type" content="image\/jpeg">/);
  assert.match(html, /href="\/amp\/product\/bldc-fan"/);
  assert.match(html, /"@type":"ItemList"/);
});

test("renders a valid noindex AMP 404 document", () => {
  const html = renderAmpNotFound(origin);
  assertAmpShell(html);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, />404</);
});
