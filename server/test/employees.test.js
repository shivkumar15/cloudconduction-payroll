import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";

async function withServer(t) {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return "http://127.0.0.1:" + server.address().port;
}

test("employee list rejects unauthenticated requests", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(baseUrl + "/api/employees");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).success, false);
});

test("employee self-service rejects unauthenticated requests", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(baseUrl + "/api/employees/me");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).success, false);
});

test("create employee rejects unauthenticated requests before touching the database", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(baseUrl + "/api/employees", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://localhost:5173"
    },
    body: JSON.stringify({})
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).success, false);
});
