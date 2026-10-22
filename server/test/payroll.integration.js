import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { app } from "../src/app.js";
import { Employee } from "../src/models/Employee.js";
import { PayrollRun } from "../src/models/PayrollRun.js";
import { User } from "../src/models/User.js";

test("MongoDB payroll lifecycle snapshots salaries, prevents duplicate periods and enforces access", async () => {
  const mongoUri = process.env.INTEGRATION_TEST_MONGODB_URI;
  assert.ok(
    mongoUri,
    "Set INTEGRATION_TEST_MONGODB_URI to a dedicated test database; this test must not use the application database"
  );

  let testDatabaseName = "";
  try {
    testDatabaseName = decodeURIComponent(new URL(mongoUri).pathname.slice(1).split("/")[0] || "");
  } catch {
    assert.fail("INTEGRATION_TEST_MONGODB_URI must be a valid MongoDB URI");
  }
  assert.match(testDatabaseName, /test/i, "Integration test database name must include 'test'");

  const runId = randomBytes(4).toString("hex");
  const adminEmail = "payroll-admin-" + runId + "@example.test";
  const employeeEmail = "payroll-employee-" + runId + "@example.test";
  const employeeCode = "PR-" + runId.toUpperCase() + "A";
  const inactiveCode = "PR-" + runId.toUpperCase() + "B";
  const emails = [adminEmail, employeeEmail];
  const codes = [employeeCode, inactiveCode];
  const year = 2000 + (Number.parseInt(runId.slice(0, 2), 16) % 100);
  const month = (Number.parseInt(runId.slice(2, 4), 16) % 12) + 1;
  const period = String(year) + "-" + String(month).padStart(2, "0");
  let server;
  let connected = false;

  async function request(baseUrl, path, options = {}) {
    const method = options.method || "GET";
    const headers = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.Origin = "http://localhost:5173";
    if (options.cookie) headers.Cookie = options.cookie;
    return fetch(baseUrl + path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  }

  function sessionCookieFrom(response) {
    const rawCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")];
    const cookieLine = rawCookies.find((value) => value?.startsWith("ccp_session="));
    assert.ok(cookieLine, "response should set the session cookie");
    return cookieLine.split(";")[0];
  }

  async function login(baseUrl, email, password) {
    const response = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email, password }
    });
    assert.equal(response.status, 200, "expected integration account login to succeed");
    return sessionCookieFrom(response);
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8_000 });
    connected = true;
    await Promise.all([User.init(), Employee.init(), PayrollRun.init()]);

    const adminPassword = "Payroll-admin-test-" + runId + "!A";
    const employeePassword = "Payroll-employee-test-" + runId + "!A";
    await User.create({
      email: adminEmail,
      passwordHash: await User.hashPassword(adminPassword),
      role: "admin",
      employeeId: null,
      isActive: true,
      mustChangePassword: false
    });

    const employees = await Employee.create([
      {
        employeeCode,
        firstName: "Ada",
        lastName: "One",
        workEmail: employeeEmail,
        department: "Engineering",
        designation: "QA Engineer",
        currency: "INR",
        employmentStatus: "active",
        salaryStructure: {
          baseSalaryPaise: 2_500_000,
          monthlyAllowancesPaise: 300_000,
          monthlyDeductionsPaise: 200_000
        }
      },
      {
        employeeCode: inactiveCode,
        firstName: "Inactive",
        lastName: "Person",
        workEmail: "inactive-" + runId + "@example.test",
        department: "Engineering",
        designation: "Engineer",
        currency: "INR",
        employmentStatus: "inactive",
        salaryStructure: {
          baseSalaryPaise: 9_000_000,
          monthlyAllowancesPaise: 0,
          monthlyDeductionsPaise: 0
        }
      }
    ]);
    const activeEmployee = employees.find((employee) => employee.employeeCode === employeeCode);

    await User.create({
      email: employeeEmail,
      passwordHash: await User.hashPassword(employeePassword),
      role: "employee",
      employeeId: activeEmployee._id,
      isActive: true,
      mustChangePassword: false
    });

    server = app.listen(0);
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = "http://127.0.0.1:" + server.address().port;
    const adminCookie = await login(baseUrl, adminEmail, adminPassword);
    const employeeCookie = await login(baseUrl, employeeEmail, employeePassword);

    const anonymousRuns = await request(baseUrl, "/api/payroll");
    assert.equal(anonymousRuns.status, 401);

    const employeeAdminList = await request(baseUrl, "/api/payroll", { cookie: employeeCookie });
    assert.equal(employeeAdminList.status, 403);

    const invalidPeriod = await request(baseUrl, "/api/payroll/preview", {
      method: "POST",
      cookie: adminCookie,
      body: { period: "2026-13" }
    });
    assert.equal(invalidPeriod.status, 400);

    const previewResponse = await request(baseUrl, "/api/payroll/preview", {
      method: "POST",
      cookie: adminCookie,
      body: { period }
    });
    assert.equal(previewResponse.status, 200);
    const preview = (await previewResponse.json()).data;
    assert.equal(preview.period, period);
    assert.equal(preview.employeeCount, 1);
    assert.equal(preview.totalGrossPayPaise, 2_800_000);
    assert.equal(preview.totalDeductionsPaise, 200_000);
    assert.equal(preview.totalNetPayPaise, 2_600_000);

    const createResponse = await request(baseUrl, "/api/payroll/runs", {
      method: "POST",
      cookie: adminCookie,
      body: { period }
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()).data;
    assert.equal(created.status, "draft");
    assert.equal(created.employeeCount, 1);
    assert.equal(created.items[0].employeeCode, employeeCode);
    assert.equal(created.items[0].netPayPaise, 2_600_000);
    const runUrl = "/api/payroll/runs/" + created.id;

    const duplicateResponse = await request(baseUrl, "/api/payroll/runs", {
      method: "POST",
      cookie: adminCookie,
      body: { period }
    });
    assert.equal(duplicateResponse.status, 409);

    const draftPayslips = await request(baseUrl, "/api/payroll/me", { cookie: employeeCookie });
    assert.equal(draftPayslips.status, 200);
    assert.deepEqual((await draftPayslips.json()).data, []);

    const prematureFinalize = await request(baseUrl, runUrl + "/finalize", {
      method: "POST",
      cookie: adminCookie
    });
    assert.equal(prematureFinalize.status, 409);

    const approveResponse = await request(baseUrl, runUrl + "/approve", {
      method: "POST",
      cookie: adminCookie
    });
    assert.equal(approveResponse.status, 200);
    assert.equal((await approveResponse.json()).data.status, "approved");

    const repeatApprove = await request(baseUrl, runUrl + "/approve", {
      method: "POST",
      cookie: adminCookie
    });
    assert.equal(repeatApprove.status, 409);

    const finalizeResponse = await request(baseUrl, runUrl + "/finalize", {
      method: "POST",
      cookie: adminCookie
    });
    assert.equal(finalizeResponse.status, 200);
    assert.equal((await finalizeResponse.json()).data.status, "finalized");

    const repeatFinalize = await request(baseUrl, runUrl + "/finalize", {
      method: "POST",
      cookie: adminCookie
    });
    assert.equal(repeatFinalize.status, 409);

    const employeePayrollResponse = await request(baseUrl, "/api/payroll/me", {
      cookie: employeeCookie
    });
    assert.equal(employeePayrollResponse.status, 200);
    const employeePayroll = (await employeePayrollResponse.json()).data;
    assert.equal(employeePayroll.length, 1);
    assert.equal(employeePayroll[0].period, period);
    assert.equal(employeePayroll[0].item.employeeId, activeEmployee._id.toString());
    assert.equal(employeePayroll[0].item.employeeCode, employeeCode);
    assert.equal(employeePayroll[0].item.netPayPaise, 2_600_000);

    const adminRunDetail = await request(baseUrl, runUrl, { cookie: adminCookie });
    assert.equal(adminRunDetail.status, 200);
    assert.equal((await adminRunDetail.json()).data.items.length, 1);

    const listResponse = await request(baseUrl, "/api/payroll?period=" + period, {
      cookie: adminCookie
    });
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.equal(listed.pagination.total, 1);
    assert.equal(listed.data[0].id, created.id);
  } finally {
    if (server) await new Promise((resolve) => server.close(() => resolve()));
    if (connected) {
      await PayrollRun.deleteMany({ period });
      await Employee.deleteMany({ employeeCode: { $in: codes } });
      await User.deleteMany({ email: { $in: emails } });
      await mongoose.disconnect();
    }
  }
});
