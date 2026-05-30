const mongoose = require("mongoose");
const connectDB = require("../config/db");
const env = require("../config/env");
const Admin = require("../models/Admin");

async function main() {
  if (!env.adminEmail || !env.adminPassword) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env before running npm run create-admin.");
  }

  if (env.adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD should be at least 12 characters.");
  }

  await connectDB();

  const existing = await Admin.findOne({ email: env.adminEmail.toLowerCase() });
  if (existing) {
    console.log(`Admin already exists for ${existing.email}. No changes made.`);
    return;
  }

  const passwordHash = await Admin.hashPassword(env.adminPassword);
  await Admin.create({
    name: "Main Admin",
    email: env.adminEmail.toLowerCase(),
    passwordHash,
    role: "owner",
    isActive: true,
  });

  console.log(`Owner admin created: ${env.adminEmail.toLowerCase()}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
