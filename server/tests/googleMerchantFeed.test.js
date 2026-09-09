const test = require("node:test");
const assert = require("node:assert/strict");
const { feedProduct } = require("../services/googleMerchantFeedService");

test("merchant item uses canonical product URL and real optional identifiers", () => {
  const xml = feedProduct({
    _id: "66cfe4cfe4cfe4cfe4cfe4cf",
    slug: "bldc-fan-with-remote",
    name: "BLDC fan with remote",
    description: "Energy-efficient ceiling fan with remote control.",
    price: 2499,
    quantity: 7,
    availability: "In Stock",
    imageUrl: "https://res.cloudinary.com/demo/image/upload/fan.jpg",
    sku: "PE-FAN-001",
    brand: "Example Brand",
    gtin: "8901234567890",
    condition: "new",
  }, "https://www.prakashshop.in", "quantity");

  assert.match(xml, /<link>https:\/\/www\.prakashshop\.in\/product\/bldc-fan-with-remote<\/link>/);
  assert.match(xml, /<g:gtin>8901234567890<\/g:gtin>/);
  assert.doesNotMatch(xml, /identifier_exists>no/);
});

test("merchant item declares identifiers absent instead of inventing GTIN or MPN", () => {
  const xml = feedProduct({
    _id: "66cfe4cfe4cfe4cfe4cfe4cf",
    slug: "wire-clip",
    name: "Wire clip",
    description: "Electrical wire clip.",
    price: 10,
    stock: 20,
    availability: "In Stock",
    imageUrl: "/images/wire-clip.jpg",
  }, "https://www.prakashshop.in", "stock");

  assert.match(xml, /<g:identifier_exists>no<\/g:identifier_exists>/);
  assert.doesNotMatch(xml, /<g:gtin>/);
  assert.doesNotMatch(xml, /<g:mpn>/);
});

test("inactive purchase data is not emitted as a merchant item", () => {
  assert.equal(feedProduct({ name: "No image", price: 50, quantity: 1 }, "https://www.prakashshop.in", "quantity"), null);
  assert.equal(feedProduct({ name: "No stock", slug: "no-stock", price: 50, quantity: 0, imageUrl: "/x.jpg" }, "https://www.prakashshop.in", "quantity"), null);
  assert.equal(feedProduct({ name: "Unavailable", slug: "unavailable", price: 50, quantity: 4, availability: "Not Available", imageUrl: "/x.jpg" }, "https://www.prakashshop.in", "quantity"), null);
});

test("public automatic offer is emitted as Google Merchant sale pricing", () => {
  const xml = feedProduct({
    _id: "66cfe4cfe4cfe4cfe4cfe4cf",
    slug: "offer-fan",
    name: "Offer fan",
    price: 2000,
    quantity: 4,
    availability: "In Stock",
    imageUrl: "/fan.jpg",
  }, "https://www.prakashshop.in", "quantity", {
    finalPrice: 1800,
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: "2026-09-30T23:59:59.000Z",
  });
  assert.match(xml, /<g:price>2000\.00 INR<\/g:price>/);
  assert.match(xml, /<g:sale_price>1800\.00 INR<\/g:sale_price>/);
  assert.match(xml, /<g:sale_price_effective_date>2026-09-01T00:00:00\.000Z\/2026-09-30T23:59:59\.000Z<\/g:sale_price_effective_date>/);
});
