import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { app } from "../src/app.js";
import { Employee } from "../src/models/Employee.js";
import { User } from "../src/models/User.js";

test("MongoDB employee lifecycle enforces login links, roles, duplicates and ownership", async () => {
  const mongoUri = process.env.MONGODB_URI;
  assert.ok(mongoUri, "MONGODB_URI must be configured for the integration test");

  const runId = randomBytes(4).toString("hex");
  const adminEmail = "qa-admin-" + runId + "@example.test";
  const employeeEmail = "qa-employee-" + runId + "@example.test";
  const secondEmail = "qa-second-" + runId + "@example.test";
  const adminPassword = "qa-admin-password-" + runId;
  const employeePassword = "qa-employee-password-" + runId;
  const secondPassword = "qa-second-password-" + runId;
  const employeeCode = "IT-" + runId.toUpperCase() + "A";
  const secondCode = "IT-" + runId.toUpperCase() + "B";
  const codes = [employeeCode, secondCode];
  const emails = [adminEmail, employeeEmail, secondEmail];
  let server;
  let connected = false;

  async function request(baseUrl, path, options = {}) {
    const headers = {};
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      headers.Origin = "http://localhost:5173";
    }
    if (options.cookie) headers.Cookie = options.cookie;

    return fetch(baseUrl + path, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  }

  async function login(baseUrl, email, password) {
    const response = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email, password }
    });
    assert.equal(response.status, 200, "expected test account login to succeed");
    const rawCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")];
    const cookieLine = rawCookies.find((value) => value?.startsWith("ccp_session="));
    assert.ok(cookieLine, "login response should set the session cookie");
    return cookieLine.split(";")[0];
  }

  function employeePayload(code, email, password) {
    return {
      employeeCode: code,
      firstName: "Test",
      lastName: "Employee",
      workEmail: email,
      department: "Engineering",
      designation: "QA Engineer",
      salaryStructure: {
        baseSalaryPaise: 2_500_000,
        monthlyAllowancesPaise: 300_000,
        monthlyDeductionsPaise: 200_000
      },
      initialPassword: password
    };
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8_000 });
    connected = true;
    await Promise.all([User.init(), Employee.init()]);

    await User.create({
      email: adminEmail,
      passwordHash: await User.hashPassword(adminPassword),
      role: "admin",
      employeeId: null,
      isActive: true
    });

    server = app.listen(0);
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = "http://127.0.0.1:" + server.address().port;
    const adminCookie = await login(baseUrl, adminEmail, adminPassword);

    const createFirst = await request(baseUrl, "/api/employees", {
      method: "POST",
      cookie: adminCookie,
      body: employeePayload(employeeCode, employeeEmail, employeePassword)
    });
    assert.equal(createFirst.status, 201);
    const firstBody = await createFirst.json();
    const firstEmployee = firstBody.data;
    assert.equal(firstBody.success, true);
    assert.equal(firstEmployee.employeeCode, employeeCode);
    assert.equal(firstEmployee.workEmail, employeeEmail);
    assert.equal(firstEmployee.salaryStructure.baseSalaryPaise, 2_500_000);

    const duplicateCode = await request(baseUrl, "/api/employees", {
      method: "POST",
      cookie: adminCookie,
      body: employeePayload(employeeCode, secondEmail, secondPassword)
    });
    assert.equal(duplicateCode.status, 409);

    const duplicateEmail = await request(baseUrl, "/api/employees", {
      method: "POST",
      cookie: adminCookie,
      body: employeePayload(secondCode, employeeEmail, secondPassword)
    });
    assert.equal(duplicateEmail.status, 409);

    const createSecond = await request(baseUrl, "/api/employees", {
      method: "POST",
      cookie: adminCookie,
      body: employeePayload(secondCode, secondEmail, secondPassword)
    });
    assert.equal(createSecond.status, 201);
    const secondEmployee = (await createSecond.json()).data;

    const list = await request(baseUrl, "/api/employees?page=1&pageSize=1&q=" + employeeCode, {
      cookie: adminCookie
    });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.pagination.pageSize, 1);
    assert.equal(listBody.pagination.total, 1);
    assert.equal(listBody.data[0].id, firstEmployee.id);

    const employeeCookie = await login(baseUrl, employeeEmail, employeePassword);
    const ownProfileResponse = await request(baseUrl, "/api/employees/me", {
      cookie: employeeCookie
    });
    assert.equal(ownProfileResponse.status, 200);
    assert.equal((await ownProfileResponse.json()).data.id, firstEmployee.id);

    const otherEmployee = await request(baseUrl, "/api/employees/" + secondEmployee.id, {
      cookie: employeeCookie
    });
    assert.equal(otherEmployee.status, 403);

    const employeeList = await request(baseUrl, "/api/employees", { cookie: employeeCookie });
    assert.equal(employeeList.status, 403);

    const forbiddenPatch = await request(baseUrl, "/api/employees/" + firstEmployee.id, {
      method: "PATCH",
      cookie: employeeCookie,
      body: { department: "Finance" }
    });
    assert.equal(forbiddenPatch.status, 403);

    const update = await request(baseUrl, "/api/employees/" + firstEmployee.id, {
      method: "PATCH",
      cookie: adminCookie,
      body: { department: "Finance" }
    });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).data.department, "Finance");

    const deactivate = await request(baseUrl, "/api/employees/" + firstEmployee.id, {
      method: "DELETE",
      cookie: adminCookie
    });
    assert.equal(deactivate.status, 200);
    assert.equal((await deactivate.json()).data.employmentStatus, "inactive");

    const deactivatedSession = await request(baseUrl, "/api/employees/me", {
      cookie: employeeCookie
    });
    assert.equal(deactivatedSession.status, 401);

    const reactivate = await request(baseUrl, "/api/employees/" + firstEmployee.id, {
      method: "PATCH",
      cookie: adminCookie,
      body: { employmentStatus: "active" }
    });
    assert.equal(reactivate.status, 200);
    assert.equal((await reactivate.json()).data.employmentStatus, "active");

    const oldSessionAfterReactivation = await request(baseUrl, "/api/employees/me", {
      cookie: employeeCookie
    });
    assert.equal(oldSessionAfterReactivation.status, 401);

    const freshEmployeeCookie = await login(baseUrl, employeeEmail, employeePassword);
    const freshProfile = await request(baseUrl, "/api/employees/me", {
      cookie: freshEmployeeCookie
    });
    assert.equal(freshProfile.status, 200);
    assert.equal((await freshProfile.json()).data.employmentStatus, "active");
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
    if (connected) {
      await Employee.deleteMany({ employeeCode: { $in: codes } });
      await User.deleteMany({ email: { $in: emails } });
      await mongoose.disconnect();
    }
  }
});
