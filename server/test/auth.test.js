import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { changePasswordSchema } from "../src/validators/authSchemas.js";
import { User } from "../src/models/User.js";
import { env } from "../src/config/env.js";

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

test("current-user endpoint rejects anonymous requests", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(`${baseUrl}/api/auth/me`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

test("login validates input before querying the database", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://localhost:5173"
    },
    body: JSON.stringify({ email: "not-an-email", password: "" })
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
});

test("unsafe cookie-authenticated requests reject missing origins", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST"
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.message, "Request origin not allowed");
});

test("unsafe requests reject an untrusted origin", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { "Origin": "https://attacker.example" }
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.message, "Request origin not allowed");
});


test("change-password schema enforces current password, a 12-character new password, and strict fields", () => {
  assert.equal(changePasswordSchema.safeParse({
    currentPassword: "initial-temporary-password",
    newPassword: "a-different-strong-password"
  }).success, true);

  assert.equal(changePasswordSchema.safeParse({
    currentPassword: "",
    newPassword: "a-different-strong-password"
  }).success, false);

  assert.equal(changePasswordSchema.safeParse({
    currentPassword: "initial-temporary-password",
    newPassword: "short"
  }).success, false);

  assert.equal(changePasswordSchema.safeParse({
    currentPassword: "initial-temporary-password",
    newPassword: "a-different-strong-password",
    role: "admin"
  }).success, false);
});

test("change-password route requires an authenticated session", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://localhost:5173"
    },
    body: JSON.stringify({
      currentPassword: "initial-temporary-password",
      newPassword: "a-different-strong-password"
    })
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});


test("employee accounts default to a required password change while admins do not", () => {
  const employee = new User({
    email: "employee@example.test",
    passwordHash: "not-a-real-hash",
    role: "employee"
  });
  const admin = new User({
    email: "admin@example.test",
    passwordHash: "not-a-real-hash",
    role: "admin"
  });

  assert.equal(employee.mustChangePassword, true);
  assert.equal(admin.mustChangePassword, false);
});


test("hydrated legacy employee records without the flag require a password change", () => {
  const legacyEmployee = User.hydrate({
    _id: "507f1f77bcf86cd799439011",
    email: "legacy-employee@example.test",
    passwordHash: "not-a-real-hash",
    role: "employee",
    isActive: true,
    tokenVersion: 0
  });

  const legacyAdmin = User.hydrate({
    _id: "507f1f77bcf86cd799439012",
    email: "legacy-admin@example.test",
    passwordHash: "not-a-real-hash",
    role: "admin",
    isActive: true,
    tokenVersion: 0
  });

  assert.equal(legacyEmployee.mustChangePassword, true);
  assert.equal(legacyAdmin.mustChangePassword, false);
});


test("password-reset requests do not reveal whether an email belongs to an active account", async (t) => {
  const originalSmtpConfig = {
    SMTP_HOST: env.SMTP_HOST,
    SMTP_PORT: env.SMTP_PORT,
    SMTP_USER: env.SMTP_USER,
    SMTP_PASS: env.SMTP_PASS,
    MAIL_FROM: env.MAIL_FROM
  };
  Object.assign(env, {
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: 587,
    SMTP_USER: "sender@example.test",
    SMTP_PASS: "test-only-not-a-real-secret",
    MAIL_FROM: "sender@example.test"
  });
  t.after(() => Object.assign(env, originalSmtpConfig));

  const results = [
    null,
    { passwordResetRequestedAt: new Date() }
  ];
  t.mock.method(User, "findOne", () => ({
    select: async () => results.shift()
  }));

  const baseUrl = await withServer(t);
  async function requestReset(email) {
    const response = await fetch(baseUrl + "/api/auth/password-reset/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://localhost:5173"
      },
      body: JSON.stringify({ email })
    });
    return { status: response.status, body: await response.json() };
  }

  const unknownAddress = await requestReset("not-registered@example.test");
  const activeAddressInCooldown = await requestReset("employee@example.test");

  assert.equal(unknownAddress.status, 202);
  assert.equal(activeAddressInCooldown.status, 202);
  assert.deepEqual(unknownAddress.body, activeAddressInCooldown.body);
  assert.match(unknownAddress.body.message, /verify the address or contact your payroll administrator/i);
});
