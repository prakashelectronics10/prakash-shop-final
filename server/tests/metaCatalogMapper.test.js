const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MetaProductValidationError,
  mapProductToMeta,
  metaAvailability,
  toMinorUnits,
} = require("../services/metaCatalogMapper");

function product(overrides = {}) {
  return {
    _id: "66cfe4cfe4cfe4cfe4cfe4cf",
    sku: "PE-FAN-001",
    slug: "bldc-fan",
    name: "BLDC fan",
    description: "Energy-efficient fan with remote control.",
    mrp: 3000,
    price: 2499,
    quantity: 7,
    availability: "In Stock",
    isActive: true,
    imageUrl: "https://res.cloudinary.com/demo/image/upload/fan.jpg",
    images: [
      { url: "https://res.cloudinary.com/demo/image/upload/fan.jpg" },
      { url: "https://res.cloudinary.com/demo/image/upload/fan-side.jpg" },
    ],
    brand: "Example Brand",
    condition: "new",
    ...overrides,
  };
}

test("maps a website product to current Meta Product Item fields and INR minor units", () => {
  const result = mapProductToMeta(product(), { origin: "https://prakashshop.in" });
  assert.equal(result.retailer_id, "PE-FAN-001");
  assert.equal(result.price, 300000);
  assert.equal(result.sale_price, 249900);
  assert.equal(result.currency, "INR");
  assert.equal(result.availability, "in stock");
  assert.equal(result.url, "https://prakashshop.in/product/bldc-fan");
  assert.deepEqual(result.additional_image_urls, ["https://res.cloudinary.com/demo/image/upload/fan-side.jpg"]);
});

test("availability is deterministic for stock, inactive, and explicit unavailable states", () => {
  assert.equal(metaAvailability(product({ quantity: 2 }), "quantity"), "in stock");
  assert.equal(metaAvailability(product({ quantity: 0 }), "quantity"), "out of stock");
  assert.equal(metaAvailability(product({ quantity: 5, isActive: false }), "quantity"), "out of stock");
  assert.equal(metaAvailability(product({ quantity: 5, availability: "Not Available" }), "quantity"), "out of stock");
});

test("retailer identifier stays stable when the title and slug change", () => {
  const first = mapProductToMeta(product());
  const renamed = mapProductToMeta(product({ name: "Renamed fan", slug: "renamed-fan" }));
  assert.equal(first.retailer_id, renamed.retailer_id);
});

test("price conversion rounds rupees to integer paise", () => {
  assert.equal(toMinorUnits(2499), 249900);
  assert.equal(toMinorUnits(10.555), 1056);
  assert.equal(toMinorUnits(-1), null);
});

test("invalid public product data fails before a Meta request", () => {
  assert.throws(
    () => mapProductToMeta(product({ imageUrl: "http://localhost:3000/fan.jpg", images: [] })),
    MetaProductValidationError,
  );
  assert.throws(() => mapProductToMeta(product({ sku: "" })), /stable SKU/);
});
