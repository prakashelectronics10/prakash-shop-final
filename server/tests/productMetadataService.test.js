const test = require("node:test");
const assert = require("node:assert/strict");
const { serializeProductMeta } = require("../services/productMetadataService");

test("shared product metadata uses the product URL and product image", () => {
  const product = {
    _id: "product-id",
    slug: "havells-bldc-fan",
    name: "Havells BLDC Fan",
    shortDescription: "Energy-efficient BLDC fan",
    imageUrl: "https://res.cloudinary.com/demo/image/upload/products/havells-bldc-fan.jpg",
    price: 2499,
    quantity: 4,
    availability: "In Stock",
  };

  const metadata = serializeProductMeta(product, {
    origin: "https://www.prakashshop.in",
    sourceType: "shop-product",
  });

  assert.equal(metadata.url, "https://www.prakashshop.in/product/havells-bldc-fan");
  assert.match(metadata.image, /products\/havells-bldc-fan\.jpg$/);
  assert.doesNotMatch(metadata.image, /og-image/);
  assert.equal(metadata.imageAlt, product.name);
});
