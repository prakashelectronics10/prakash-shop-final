const amphtmlValidator = require("amphtml-validator");
const {
  renderAmpCatalogPage,
  renderAmpNotFound,
  renderAmpProductPage,
} = require("../services/ampPageService");

const origin = "https://www.prakashshop.in";
const sampleProduct = {
  identifier: "amp-validation-product",
  name: "AMP Validation Product",
  title: "AMP Validation Product",
  description: "Representative electronics product used to validate the reusable AMP template.",
  fullDescription: "Representative electronics product used to validate the reusable AMP template.",
  shortDescription: "Representative electronics product.",
  image: `${origin}/logo512.png`,
  images: [`${origin}/logo512.png`],
  imageAlt: "Prakash Electronics product",
  sourceType: "shop-product",
  category: "Electronics",
  brand: "Prakash Electronics",
  sku: "AMP-CHECK-1",
  condition: "new",
  mrp: 999,
  price: 899,
  discountPercent: 10,
  availability: "https://schema.org/InStock",
  availabilityLabel: "In Stock",
  specifications: [{ label: "Type", value: "Validation sample" }],
  shipping: {},
  publicOffers: [],
};

async function main() {
  const validator = await amphtmlValidator.getInstance();
  const documents = [
    ["product", renderAmpProductPage(sampleProduct, origin)],
    ["shop catalog", renderAmpCatalogPage({ products: [sampleProduct], sourceType: "shop-product", origin })],
    ["wiring catalog", renderAmpCatalogPage({ products: [{ ...sampleProduct, sourceType: "project-part" }], sourceType: "project-part", origin })],
    ["404", renderAmpNotFound(origin)],
  ];
  let failed = false;
  for (const [name, html] of documents) {
    const result = validator.validateString(html);
    if (result.status === "PASS") {
      console.log(`PASS ${name}`);
      continue;
    }
    failed = true;
    console.error(`FAIL ${name}`);
    result.errors.forEach((error) => console.error(`  ${error.line}:${error.col} ${error.message}`));
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
