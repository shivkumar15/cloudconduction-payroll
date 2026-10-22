import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export function generatePasswordResetOtp() {
  return randomInt(100_000, 1_000_000).toString();
}

export function hashPasswordResetOtp(userId, otp) {
  return createHmac("sha256", env.JWT_SECRET)
    .update(`${userId}:${otp}`)
    .digest("hex");
}

export function passwordResetOtpMatches(userId, otp, storedHash) {
  if (typeof storedHash !== "string") return false;

  const expected = Buffer.from(hashPasswordResetOtp(userId, otp), "hex");
  const actual = Buffer.from(storedHash, "hex");
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
