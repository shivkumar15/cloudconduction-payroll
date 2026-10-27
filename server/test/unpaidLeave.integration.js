import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { app } from "../src/app.js";
import { Employee } from "../src/models/Employee.js";
import { PayrollRun } from "../src/models/PayrollRun.js";
import { UnpaidLeaveRequest } from "../src/models/UnpaidLeaveRequest.js";
import { User } from "../src/models/User.js";
import { getWorkingDaysInPeriod } from "../src/services/unpaidLeaveService.js";

function workingDates(period) {
  const [year, month] = period.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  const dates = [];
  while (cursor.getUTCMonth() === month - 1) {
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

test("MongoDB unpaid-leave workflow enforces ownership, admin decisions, payroll deductions and snapshot locks", async () => {
  const mongoUri = process.env.INTEGRATION_TEST_MONGODB_URI;
  assert.ok(mongoUri, "Set INTEGRATION_TEST_MONGODB_URI to a dedicated test database");

  let testDatabaseName = "";
  try {
    testDatabaseName = decodeURIComponent(new URL(mongoUri).pathname.slice(1).split("/")[0] || "");
  } catch {
    assert.fail("INTEGRATION_TEST_MONGODB_URI must be a valid MongoDB URI");
  }
  assert.match(testDatabaseName, /test/i, "Integration test database name must include 'test'");

  const runId = randomBytes(4).toString("hex");
  const period = String(2000 + (Number.parseInt(runId.slice(0, 2), 16) % 100))
    + "-" + String((Number.parseInt(runId.slice(2, 4), 16) % 12) + 1).padStart(2, "0");
  const isolatedMongoUrl = new URL(mongoUri);
  isolatedMongoUrl.pathname = "/" + testDatabaseName + "_unpaid_leave_" + runId;
  const isolatedMongoUri = isolatedMongoUrl.toString();

  const adminEmail = "leave-admin-" + runId + "@example.test";
  const employeeEmail = "leave-employee-" + runId + "@example.test";
  const secondEmail = "leave-second-" + runId + "@example.test";
  const adminPassword = "Leave-admin-test-" + runId + "!A";
  const employeePassword = "Leave-employee-test-" + runId + "!A";
  const secondPassword = "Leave-second-test-" + runId + "!A";
  const employeeCode = "LV-" + runId.toUpperCase() + "A";
  const secondCode = "LV-" + runId.toUpperCase() + "B";
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
    const cookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")];
    const cookie = cookies.find((value) => value?.startsWith("ccp_session="));
    assert.ok(cookie, "login should issue a session cookie");
    return cookie.split(";")[0];
  }

  async function login(baseUrl, email, password) {
    const response = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email, password }
    });
    assert.equal(response.status, 200);
    return sessionCookieFrom(response);
  }

  try {
    await mongoose.connect(isolatedMongoUri, { serverSelectionTimeoutMS: 8_000 });
    connected = true;
    await Promise.all([User.init(), Employee.init(), PayrollRun.init(), UnpaidLeaveRequest.init()]);

    const employee = await Employee.create({
      employeeCode,
      firstName: "Leave",
      lastName: "Tester",
      workEmail: employeeEmail,
      department: "Engineering",
      designation: "QA Engineer",
      currency: "INR",
      employmentStatus: "active",
      employmentStartDate: new Date("2000-01-01T00:00:00.000Z"),
      salaryStructure: {
        baseSalaryPaise: 2_500_000,
        monthlyAllowancesPaise: 300_000,
        monthlyDeductionsPaise: 200_000
      }
    });
    const secondEmployee = await Employee.create({
      employeeCode: secondCode,
      firstName: "Second",
      lastName: "Tester",
      workEmail: secondEmail,
      department: "Engineering",
      designation: "QA Engineer",
      currency: "INR",
      employmentStatus: "active",
      employmentStartDate: new Date("2000-01-01T00:00:00.000Z"),
      salaryStructure: {
        baseSalaryPaise: 1_500_000,
        monthlyAllowancesPaise: 0,
        monthlyDeductionsPaise: 100_000
      }
    });

    await User.create([
      {
        email: adminEmail,
        passwordHash: await User.hashPassword(adminPassword),
        role: "admin",
        employeeId: null,
        isActive: true,
        mustChangePassword: false
      },
      {
        email: employeeEmail,
        passwordHash: await User.hashPassword(employeePassword),
        role: "employee",
        employeeId: employee._id,
        isActive: true,
        mustChangePassword: false
      },
      {
        email: secondEmail,
        passwordHash: await User.hashPassword(secondPassword),
        role: "employee",
        employeeId: secondEmployee._id,
        isActive: true,
        mustChangePassword: false
      }
    ]);

    server = app.listen(0);
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = "http://127.0.0.1:" + server.address().port;
    const adminCookie = await login(baseUrl, adminEmail, adminPassword);
    const employeeCookie = await login(baseUrl, employeeEmail, employeePassword);
    const secondCookie = await login(baseUrl, secondEmail, secondPassword);
    const dates = workingDates(period);
    assert.ok(dates.length >= 2);

    const anonymous = await request(baseUrl, "/api/unpaid-leave/me");
    assert.equal(anonymous.status, 401);
    const employeeAdminList = await request(baseUrl, "/api/unpaid-leave", { cookie: employeeCookie });
    assert.equal(employeeAdminList.status, 403);

    const weekend = await request(baseUrl, "/api/unpaid-leave", {
      method: "POST",
      cookie: employeeCookie,
      body: { date: "2026-11-01", reason: "Weekend should fail" }
    });
    assert.equal(weekend.status, 400);

    const forged = await request(baseUrl, "/api/unpaid-leave", {
      method: "POST",
      cookie: employeeCookie,
      body: { date: dates[0], reason: "Please approve", status: "approved", decidedBy: employee._id.toString() }
    });
    assert.equal(forged.status, 400);

    const firstRequest = await request(baseUrl, "/api/unpaid-leave", {
      method: "POST",
      cookie: employeeCookie,
      body: { date: dates[0], reason: "Unpaid leave request" }
    });
    assert.equal(firstRequest.status, 201);
    const first = (await firstRequest.json()).data;
    assert.equal(first.status, "pending");
    assert.equal(first.employeeId, employee._id.toString());

    const duplicate = await request(baseUrl, "/api/unpaid-leave", {
      method: "POST",
      cookie: employeeCookie,
      body: { date: dates[0], reason: "Duplicate request" }
    });
    assert.equal(duplicate.status, 409);

    const otherEmployeeRead = await request(baseUrl, "/api/unpaid-leave/me", { cookie: secondCookie });
    assert.equal(otherEmployeeRead.status, 200);
    assert.deepEqual((await otherEmployeeRead.json()).data, []);
    const selfApprove = await request(baseUrl, "/api/unpaid-leave/" + first.id + "/approve", {
      method: "POST", cookie: employeeCookie, body: {}
    });
    assert.equal(selfApprove.status, 403);

    const adminList = await request(baseUrl, "/api/unpaid-leave?period=" + period + "&status=pending", {
      cookie: adminCookie
    });
    assert.equal(adminList.status, 200);
    const listBody = await adminList.json();
    assert.equal(listBody.pagination.total, 1);
    assert.equal(listBody.data[0].employee.employeeCode, employeeCode);

    const approve = await request(baseUrl, "/api/unpaid-leave/" + first.id + "/approve", {
      method: "POST", cookie: adminCookie, body: {}
    });
    assert.equal(approve.status, 200);
    assert.equal((await approve.json()).data.status, "approved");
    const repeatApprove = await request(baseUrl, "/api/unpaid-leave/" + first.id + "/approve", {
      method: "POST", cookie: adminCookie, body: {}
    });
    assert.equal(repeatApprove.status, 409);

    const secondRequest = await request(baseUrl, "/api/unpaid-leave", {
      method: "POST",
      cookie: employeeCookie,
      body: { date: dates[1], reason: "Needs review before payroll" }
    });
    assert.equal(secondRequest.status, 201);
    const second = (await secondRequest.json()).data;

    const previewResponse = await request(baseUrl, "/api/payroll/preview", {
      method: "POST", cookie: adminCookie, body: { period }
    });
    assert.equal(previewResponse.status, 200);
    const preview = (await previewResponse.json()).data;
    assert.equal(preview.pendingUnpaidLeaveRequestsCount, 1);
    assert.equal(preview.canCreateRun, false);
    assert.equal(preview.items.find((item) => item.employeeCode === employeeCode).unpaidLeaveDays, 1);
    assert.equal(preview.items.find((item) => item.employeeCode === employeeCode).unpaidLeaveDeductionPaise,
      Math.round(2_800_000 / getWorkingDaysInPeriod(period)));

    const createWhilePending = await request(baseUrl, "/api/payroll/runs", {
      method: "POST", cookie: adminCookie, body: { period }
    });
    assert.equal(createWhilePending.status, 409);
    assert.equal((await createWhilePending.json()).code, "PENDING_UNPAID_LEAVE_REQUESTS");
    assert.equal(await PayrollRun.countDocuments({ period }), 0);

    const reject = await request(baseUrl, "/api/unpaid-leave/" + second.id + "/reject", {
      method: "POST", cookie: adminCookie, body: { decisionNote: "Not approved for this date" }
    });
    assert.equal(reject.status, 200);
    assert.equal((await reject.json()).data.status, "rejected");

    const createRun = await request(baseUrl, "/api/payroll/runs", {
      method: "POST", cookie: adminCookie, body: { period }
    });
    assert.equal(createRun.status, 201);
    const run = (await createRun.json()).data;
    const item = run.items.find((entry) => entry.employeeCode === employeeCode);
    const leaveDeduction = Math.round(2_800_000 / getWorkingDaysInPeriod(period));
    assert.equal(item.fixedMonthlyDeductionsPaise, 200_000);
    assert.equal(item.unpaidLeaveDays, 1);
    assert.equal(item.unpaidLeaveDeductionPaise, leaveDeduction);
    assert.equal(item.monthlyDeductionsPaise, 200_000 + leaveDeduction);
    assert.equal(item.netPayPaise, 2_800_000 - 200_000 - leaveDeduction);

    const afterSnapshotRequest = await request(baseUrl, "/api/unpaid-leave", {
      method: "POST", cookie: secondCookie, body: { date: dates[2], reason: "Too late for snapshot" }
    });
    assert.equal(afterSnapshotRequest.status, 409);
    assert.equal((await afterSnapshotRequest.json()).code, "PAYROLL_PERIOD_LOCKED");

    const leaveAfterSnapshotApproval = await request(baseUrl, "/api/unpaid-leave/" + first.id + "/approve", {
      method: "POST", cookie: adminCookie, body: {}
    });
    assert.equal(leaveAfterSnapshotApproval.status, 409);
    const lockedList = await request(baseUrl, "/api/unpaid-leave/me", { cookie: employeeCookie });
    assert.equal(lockedList.status, 200);
    const employeeLeave = (await lockedList.json()).data;
    assert.equal(employeeLeave.find((entry) => entry.id === first.id).status, "approved");
    assert.equal(await UnpaidLeaveRequest.countDocuments({ employeeId: secondEmployee._id, date: new Date(dates[2] + "T00:00:00.000Z") }), 0);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
    if (connected) await mongoose.disconnect();
  }
});
