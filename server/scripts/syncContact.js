const mongoose = require("mongoose");
const connectDB = require("../config/db");
const ContactInfo = require("../models/ContactInfo");
const { contact } = require("../data/defaultSeed");

async function main() {
  await connectDB();

  const existing = await ContactInfo.findOne().sort({ updatedAt: -1 });
  if (existing) {
    await ContactInfo.findByIdAndUpdate(existing._id, contact, {
      new: true,
      runValidators: true,
    });
  } else {
    await ContactInfo.create(contact);
  }

  console.log("Contact info synced from defaultSeed.js.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
