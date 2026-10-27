import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { app } from "../src/app.js";
import { Employee } from "../src/models/Employee.js";
import { PayrollRun } from "../src/models/PayrollRun.js";
import { PayrollTransaction } from "../src/models/PayrollTransaction.js";
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

  // Keep payroll integration data in its own disposable database so this test
  // cannot race with the employee lifecycle integration test when CI runs files in parallel.
  const payrollDatabaseName = testDatabaseName + "_payroll";
  const isolatedMongoUrl = new URL(mongoUri);
  isolatedMongoUrl.pathname = "/" + payrollDatabaseName;
  const isolatedMongoUri = isolatedMongoUrl.toString();

  const runId = randomBytes(4).toString("hex");
  const adminEmail = "payroll-admin-" + runId + "@example.test";
  const employeeEmail = "payroll-employee-" + runId + "@example.test";
  const employeeCode = "PR-" + runId.toUpperCase() + "A";
  const inactiveCode = "PR-" + runId.toUpperCase() + "B";
  const futureCode = "PR-" + runId.toUpperCase() + "C";
  const futureEmail = "payroll-future-" + runId + "@example.test";
  const emails = [adminEmail, employeeEmail, futureEmail];
  const codes = [employeeCode, inactiveCode, futureCode];
  const year = 2000 + (Number.parseInt(runId.slice(0, 2), 16) % 100);
  const month = (Number.parseInt(runId.slice(2, 4), 16) % 12) + 1;
  const period = String(year) + "-" + String(month).padStart(2, "0");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextPeriod = String(nextYear) + "-" + String(nextMonth).padStart(2, "0");
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
    await mongoose.connect(isolatedMongoUri, { serverSelectionTimeoutMS: 8_000 });
    connected = true;
    await Promise.all([User.init(), Employee.init(), PayrollRun.init(), PayrollTransaction.init()]);

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
        employmentStartDate: new Date(period + "-01T00:00:00.000Z"),
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
        employmentStartDate: new Date(period + "-01T00:00:00.000Z"),
        salaryStructure: {
          baseSalaryPaise: 9_000_000,
          monthlyAllowancesPaise: 0,
          monthlyDeductionsPaise: 0
        }
      },
      {
        employeeCode: futureCode,
        firstName: "Future",
        lastName: "Joiner",
        workEmail: futureEmail,
        department: "Engineering",
        designation: "QA Engineer",
        currency: "INR",
        employmentStatus: "active",
        employmentStartDate: new Date(nextPeriod + "-01T00:00:00.000Z"),
        salaryStructure: {
          baseSalaryPaise: 1_200_000,
          monthlyAllowancesPaise: 100_000,
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

    const employeeInsights = await request(baseUrl, "/api/payroll-insights", {
      method: "POST",
      cookie: employeeCookie,
      body: { period }
    });
    assert.equal(employeeInsights.status, 403);

    const unknownInsightsField = await request(baseUrl, "/api/payroll-insights", {
      method: "POST",
      cookie: adminCookie,
      body: { period, employeeCode: "MUST_NOT_BE_ACCEPTED" }
    });
    assert.equal(unknownInsightsField.status, 400);

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
    assert.deepEqual(preview.items.map((item) => item.employeeCode), [employeeCode]);
    assert.equal(preview.items.some((item) => item.employeeCode === futureCode), false);

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

    const lockedStartDateUpdate = await request(baseUrl, "/api/employees/" + activeEmployee._id.toString(), {
      method: "PATCH",
      cookie: adminCookie,
      body: { employmentStartDate: nextPeriod + "-01" }
    });
    assert.equal(lockedStartDateUpdate.status, 409);
    assert.equal((await lockedStartDateUpdate.json()).code, "EMPLOYMENT_START_DATE_LOCKED");

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

    const employeeTransactionsArePrivate = await request(baseUrl, "/api/transactions", { cookie: employeeCookie });
    assert.equal(employeeTransactionsArePrivate.status, 403);

    const invalidFailureScenario = await request(baseUrl, runUrl + "/simulate-transactions", {
      method: "POST",
      cookie: adminCookie,
      body: { failEmployeeCodes: ["NOT-IN-RUN"] }
    });
    assert.equal(invalidFailureScenario.status, 400);

    const simulatedPayments = await request(baseUrl, runUrl + "/simulate-transactions", {
      method: "POST",
      cookie: adminCookie,
      body: { failEmployeeCodes: [employeeCode] }
    });
    assert.equal(simulatedPayments.status, 200);
    const simulationBody = await simulatedPayments.json();
    assert.equal(simulationBody.simulatedOnly, true);
    assert.equal(simulationBody.summary.count, 1);
    assert.equal(simulationBody.summary.failed, 1);
    assert.equal(simulationBody.data[0].status, "failed");
    assert.equal(simulationBody.data[0].attemptCount, 1);
    const transactionId = simulationBody.data[0].id;
    const idempotencyKey = "payroll-run:" + created.id + ":employee:" + activeEmployee._id.toString();
    const storedTransaction = await PayrollTransaction.findById(transactionId);
    assert.equal(storedTransaction.idempotencyKey, idempotencyKey);
    assert.equal(storedTransaction.provider, "simulation");
    assert.equal(storedTransaction.amountPaise, 2_600_000);

    const employeeTransactionsBeforeFinalization = await request(baseUrl, "/api/transactions/me", {
      cookie: employeeCookie
    });
    assert.equal(employeeTransactionsBeforeFinalization.status, 200);
    assert.deepEqual((await employeeTransactionsBeforeFinalization.json()).data, []);

    const finalizeBeforePayments = await request(baseUrl, runUrl + "/finalize", {
      method: "POST",
      cookie: adminCookie
    });
    assert.equal(finalizeBeforePayments.status, 409);
    assert.equal((await finalizeBeforePayments.json()).code, "SIMULATED_PAYMENTS_INCOMPLETE");

    const duplicateSimulation = await request(baseUrl, runUrl + "/simulate-transactions", {
      method: "POST",
      cookie: adminCookie,
      body: {}
    });
    assert.equal(duplicateSimulation.status, 200);
    const duplicateSimulationBody = await duplicateSimulation.json();
    assert.equal(duplicateSimulationBody.data[0].id, transactionId);
    assert.equal(duplicateSimulationBody.data[0].status, "failed");
    assert.equal(duplicateSimulationBody.data[0].attemptCount, 1);
    assert.equal(await PayrollTransaction.countDocuments({ payrollRunId: created.id }), 1);

    const employeeRetryForbidden = await request(baseUrl, "/api/transactions/" + transactionId + "/retry", {
      method: "POST",
      cookie: employeeCookie
    });
    assert.equal(employeeRetryForbidden.status, 403);

    const transactionList = await request(baseUrl, "/api/transactions?period=" + period + "&status=failed", {
      cookie: adminCookie
    });
    assert.equal(transactionList.status, 200);
    const transactionListBody = await transactionList.json();
    assert.equal(transactionListBody.simulatedOnly, true);
    assert.equal(transactionListBody.pagination.total, 1);
    assert.equal(transactionListBody.data[0].id, transactionId);

    const transactionDetail = await request(baseUrl, "/api/transactions/" + transactionId, {
      cookie: adminCookie
    });
    assert.equal(transactionDetail.status, 200);
    assert.equal((await transactionDetail.json()).data.status, "failed");

    const retryResponse = await request(baseUrl, "/api/transactions/" + transactionId + "/retry", {
      method: "POST",
      cookie: adminCookie
    });
    assert.equal(retryResponse.status, 200);
    const retryBody = await retryResponse.json();
    assert.equal(retryBody.simulatedOnly, true);
    assert.equal(retryBody.data.status, "succeeded");
    assert.equal(retryBody.data.attemptCount, 2);
    assert.equal(retryBody.data.attemptHistory.length, 2);
    assert.equal((await PayrollTransaction.findById(transactionId)).idempotencyKey, idempotencyKey);

    const repeatRetry = await request(baseUrl, "/api/transactions/" + transactionId + "/retry", {
      method: "POST",
      cookie: adminCookie
    });
    assert.equal(repeatRetry.status, 409);

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

    const employeeTransactionsAfterFinalization = await request(baseUrl, "/api/transactions/me", {
      cookie: employeeCookie
    });
    assert.equal(employeeTransactionsAfterFinalization.status, 200);
    const ownTransactions = (await employeeTransactionsAfterFinalization.json()).data;
    assert.equal(ownTransactions.length, 1);
    assert.equal(ownTransactions[0].id, transactionId);
    assert.equal(ownTransactions[0].status, "succeeded");
    assert.equal(ownTransactions[0].simulatedOnly, true);

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

    const nextPeriodPreviewResponse = await request(baseUrl, "/api/payroll/preview", {
      method: "POST",
      cookie: adminCookie,
      body: { period: nextPeriod }
    });
    assert.equal(nextPeriodPreviewResponse.status, 200);
    const nextPeriodPreview = (await nextPeriodPreviewResponse.json()).data;
    assert.equal(nextPeriodPreview.employeeCount, 2);
    assert.deepEqual(nextPeriodPreview.items.map((item) => item.employeeCode).sort(), [employeeCode, futureCode].sort());
  } finally {
    if (server) await new Promise((resolve) => server.close(() => resolve()));
    if (connected) {
      await PayrollTransaction.deleteMany({ period });
      await PayrollRun.deleteMany({ period });
      await Employee.deleteMany({ employeeCode: { $in: codes } });
      await User.deleteMany({ email: { $in: emails } });
      await mongoose.disconnect();
    }
  }
});
