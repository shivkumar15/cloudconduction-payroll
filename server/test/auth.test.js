import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { changePasswordSchema } from "../src/validators/authSchemas.js";
import { User } from "../src/models/User.js";

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
