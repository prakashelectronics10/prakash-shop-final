const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Analytics = require("../models/Analytics");
const Category = require("../models/Category");
const ContactInfo = require("../models/ContactInfo");
const HeroSection = require("../models/HeroSection");
const Offer = require("../models/Offer");
const Product = require("../models/Product");
const SiteContent = require("../models/SiteContent");
const { categories, products, hero, contact, siteContent, offers } = require("../data/defaultSeed");

async function upsertSingleton(Model, payload) {
  const existing = await Model.findOne();
  if (existing) {
    await Model.findByIdAndUpdate(existing._id, payload, { runValidators: true });
  } else {
    await Model.create(payload);
  }
}

async function main() {
  await connectDB();

  const categoryMap = new Map();
  for (const category of categories) {
    const doc = await Category.findOneAndUpdate(
      { slug: category.slug },
      category,
      { new: true, upsert: true, runValidators: true },
    );
    categoryMap.set(category.slug, doc._id);
  }

  for (const product of products) {
    const { categorySlug, ...payload } = product;
    payload.category = categoryMap.get(categorySlug) || null;
    await Product.findOneAndUpdate(
      { slug: payload.slug },
      payload,
      { new: true, upsert: true, runValidators: true },
    );
  }

  await upsertSingleton(HeroSection, hero);
  await upsertSingleton(ContactInfo, contact);

  for (const [key, value] of Object.entries(siteContent)) {
    await SiteContent.findOneAndUpdate(
      { key },
      { key, value },
      { new: true, upsert: true, runValidators: true },
    );
  }

  for (const offer of offers) {
    await Offer.findOneAndUpdate(
      { title: offer.title },
      offer,
      { new: true, upsert: true, runValidators: true },
    );
  }

  await Analytics.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { totalFormSubmissions: 0 } },
    { new: true, upsert: true },
  );

  console.log("Database seeded with editable website content.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
