import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import {
  generatePasswordResetOtp,
  hashPasswordResetOtp,
  passwordResetOtpMatches
} from "../src/utils/passwordResetOtp.js";

async function withServer(t) {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("generated reset OTP is a six-digit code", () => {
  const otp = generatePasswordResetOtp();
  assert.match(otp, /^\d{6}$/);
});

test("reset OTP is verified against user-bound HMAC and does not match a different code", () => {
  const userId = "user-test-id";
  const otp = "123456";
  const digest = hashPasswordResetOtp(userId, otp);

  assert.equal(passwordResetOtpMatches(userId, otp, digest), true);
  assert.equal(passwordResetOtpMatches(userId, "654321", digest), false);
  assert.equal(passwordResetOtpMatches("different-user", otp, digest), false);
  assert.equal(digest.includes(otp), false);
});

test("password reset confirmation rejects invalid code shape without database access", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(`${baseUrl}/api/auth/password-reset/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://localhost:5173"
    },
    body: JSON.stringify({
      email: "user@example.com",
      otp: "123",
      newPassword: "a-strong-password"
    })
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
});

test("password reset request explains global SMTP setup is required", async (t) => {
  // Force the no-SMTP case even when a developer has SMTP values in their local .env.
  // This endpoint should return before touching MongoDB when SMTP is unavailable.
  const originalSmtpConfig = {
    SMTP_HOST: env.SMTP_HOST,
    SMTP_PORT: env.SMTP_PORT,
    SMTP_USER: env.SMTP_USER,
    SMTP_PASS: env.SMTP_PASS,
    MAIL_FROM: env.MAIL_FROM
  };
  Object.assign(env, {
    SMTP_HOST: undefined,
    SMTP_PORT: undefined,
    SMTP_USER: undefined,
    SMTP_PASS: undefined,
    MAIL_FROM: undefined
  });
  t.after(() => Object.assign(env, originalSmtpConfig));

  const baseUrl = await withServer(t);
  const response = await fetch(`${baseUrl}/api/auth/password-reset/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://localhost:5173"
    },
    body: JSON.stringify({ email: "user@example.com" })
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.match(body.message, /email is not configured/i);
});
