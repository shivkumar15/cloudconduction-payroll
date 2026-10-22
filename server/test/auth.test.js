import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";

async function withServer(t) {
  const server = app.listen(0);
  t.after(() => server.close());
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
