import mongoose from "mongoose";
import { env } from "../config/env.js";
import { User } from "../models/User.js";

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in server/.env before running this script.");
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error("SEED_ADMIN_PASSWORD must contain 12 to 128 characters.");
  }

  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const existing = await User.findOne({ email });
  if (existing) {
    throw new Error("A user with this email already exists. The seed script will not change existing accounts.");
  }

  const passwordHash = await User.hashPassword(password);
  await User.create({
    email,
    passwordHash,
    role: "admin",
    isActive: true
  });

  console.info("Admin account created successfully.");
  console.info("Sign in with the configured admin email; the password is not printed.");
}

seedAdmin()
  .catch((error) => {
    console.error("Admin provisioning failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
