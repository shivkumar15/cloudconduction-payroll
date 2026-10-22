import test from "node:test";
import assert from "node:assert/strict";
import { requireEmployeeReadAccess, validateEmployeeIdParam } from "../src/middleware/employeeAccess.js";
import { requireRole } from "../src/middleware/auth.js";

function runMiddleware(middleware, req) {
  let statusCode = 200;
  let body;
  let nextCalled = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; }
  };
  middleware(req, res, () => { nextCalled = true; });
  return { statusCode, body, nextCalled };
}

const ownerId = "507f1f77bcf86cd799439011";
const otherId = "507f1f77bcf86cd799439012";

test("admin can read an employee record", () => {
  const result = runMiddleware(requireEmployeeReadAccess, {
    params: { id: otherId },
    authUser: { role: "admin", employeeId: null }
  });
  assert.equal(result.nextCalled, true);
});

test("employee can read only their linked record", () => {
  const own = runMiddleware(requireEmployeeReadAccess, {
    params: { id: ownerId },
    authUser: { role: "employee", employeeId: { toString: () => ownerId } }
  });
  const other = runMiddleware(requireEmployeeReadAccess, {
    params: { id: otherId },
    authUser: { role: "employee", employeeId: { toString: () => ownerId } }
  });
  assert.equal(own.nextCalled, true);
  assert.equal(other.statusCode, 403);
  assert.equal(other.nextCalled, false);
});

test("employee without a linked record is not allowed to read arbitrary records", () => {
  const result = runMiddleware(requireEmployeeReadAccess, {
    params: { id: ownerId },
    authUser: { role: "employee", employeeId: null }
  });
  assert.equal(result.statusCode, 403);
});

test("employee route rejects malformed MongoDB IDs before querying the database", () => {
  const result = runMiddleware(validateEmployeeIdParam, {
    params: { id: "not-a-mongo-id" }
  });
  assert.equal(result.statusCode, 400);
  assert.equal(result.nextCalled, false);
});


test("employee role cannot pass an admin-only role guard", () => {
  const result = runMiddleware(requireRole("admin"), {
    authUser: { role: "employee" }
  });
  assert.equal(result.statusCode, 403);
  assert.equal(result.nextCalled, false);
});
