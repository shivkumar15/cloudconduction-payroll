import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { app } from "../src/app.js";
import { AttendanceRecord } from "../src/models/AttendanceRecord.js";
import { Employee } from "../src/models/Employee.js";
import { EmployeeDayReservation } from "../src/models/EmployeeDayReservation.js";
import { PayrollRun } from "../src/models/PayrollRun.js";
import { UnpaidLeaveRequest } from "../src/models/UnpaidLeaveRequest.js";
import { User } from "../src/models/User.js";
import { WfhRequest } from "../src/models/WfhRequest.js";
import { getIndiaBusinessDate, addDateOnlyDays } from "../src/services/wfhService.js";

function nextWeekday(dateOnly) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addDateOnlyDays(dateOnly, offset);
    const day = new Date(candidate + "T00:00:00.000Z").getUTCDay();
    if (day >= 1 && day <= 5) return candidate;
  }
  throw new Error("Unable to locate a weekday within seven days");
}

test("MongoDB WFH and attendance workflow enforces ownership, shared day reservations, server timestamps, correction audit and payroll locks", async () => {
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
  const isolatedMongoUrl = new URL(mongoUri);
  isolatedMongoUrl.pathname = "/" + testDatabaseName + "_wfh_" + runId;
  const isolatedMongoUri = isolatedMongoUrl.toString();

  const adminEmail = "wfh-admin-" + runId + "@example.test";
  const employeeEmail = "wfh-employee-" + runId + "@example.test";
  const secondEmail = "wfh-second-" + runId + "@example.test";
  const adminPassword = "Wfh-admin-test-" + runId + "!A";
  const employeePassword = "Wfh-employee-test-" + runId + "!A";
  const secondPassword = "Wfh-second-test-" + runId + "!A";
  const employeeCode = "WF-" + runId.toUpperCase() + "A";
  const secondCode = "WF-" + runId.toUpperCase() + "B";
  const businessDate = getIndiaBusinessDate();
  const nextDate = nextWeekday(businessDate);
  const nextFollowingDate = nextWeekday(nextDate);
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
    const response = await request(baseUrl, "/api/auth/login", { method: "POST", body: { email, password } });
    assert.equal(response.status, 200);
    return sessionCookieFrom(response);
  }

  async function createWfhRequest(baseUrl, cookie, date, reason = "Scheduled remote work") {
    return request(baseUrl, "/api/wfh", {
      method: "POST",
      cookie,
      body: { date, reason }
    });
  }

  try {
    await mongoose.connect(isolatedMongoUri, { serverSelectionTimeoutMS: 8_000 });
    connected = true;
    await Promise.all([
      User.init(), Employee.init(), PayrollRun.init(), UnpaidLeaveRequest.init(),
      WfhRequest.init(), AttendanceRecord.init(), EmployeeDayReservation.init()
    ]);

    const employees = await Employee.create([
      {
        employeeCode,
        firstName: "Wfh",
        lastName: "Employee",
        workEmail: employeeEmail,
        department: "Engineering",
        designation: "QA Engineer",
        currency: "INR",
        employmentStatus: "active",
        employmentStartDate: new Date("2000-01-01T00:00:00.000Z"),
        salaryStructure: { baseSalaryPaise: 2_500_000, monthlyAllowancesPaise: 300_000, monthlyDeductionsPaise: 200_000 }
      },
      {
        employeeCode: secondCode,
        firstName: "Second",
        lastName: "Employee",
        workEmail: secondEmail,
        department: "Engineering",
        designation: "QA Engineer",
        currency: "INR",
        employmentStatus: "active",
        employmentStartDate: new Date("2000-01-01T00:00:00.000Z"),
        salaryStructure: { baseSalaryPaise: 1_500_000, monthlyAllowancesPaise: 0, monthlyDeductionsPaise: 100_000 }
      }
    ]);
    const [firstEmployee, secondEmployee] = employees;

    await User.create([
      { email: adminEmail, passwordHash: await User.hashPassword(adminPassword), role: "admin", employeeId: null, isActive: true, mustChangePassword: false },
      { email: employeeEmail, passwordHash: await User.hashPassword(employeePassword), role: "employee", employeeId: firstEmployee._id, isActive: true, mustChangePassword: false },
      { email: secondEmail, passwordHash: await User.hashPassword(secondPassword), role: "employee", employeeId: secondEmployee._id, isActive: true, mustChangePassword: false }
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

    assert.equal((await request(baseUrl, "/api/wfh/me")).status, 401);
    assert.equal((await request(baseUrl, "/api/attendance/me")).status, 401);
    assert.equal((await request(baseUrl, "/api/wfh", { cookie: employeeCookie })).status, 403);
    assert.equal((await request(baseUrl, "/api/attendance", { cookie: employeeCookie })).status, 403);

    const invalidPast = await createWfhRequest(baseUrl, employeeCookie, addDateOnlyDays(businessDate, -1));
    assert.equal(invalidPast.status, 400);
    const invalidFarFuture = await createWfhRequest(baseUrl, employeeCookie, addDateOnlyDays(businessDate, 91));
    assert.equal(invalidFarFuture.status, 400);
    const forgedApproval = await request(baseUrl, "/api/wfh", {
      method: "POST",
      cookie: employeeCookie,
      body: { date: businessDate, reason: "Try to self-approve", status: "approved", decidedBy: employeeCode }
    });
    assert.equal(forgedApproval.status, 400);

    const checkInBeforeApproval = await request(baseUrl, "/api/attendance/check-in", {
      method: "POST", cookie: employeeCookie, body: {}
    });
    assert.equal(checkInBeforeApproval.status, 409);
    assert.equal((await checkInBeforeApproval.json()).code, "APPROVED_WFH_REQUIRED");

    const createToday = await createWfhRequest(baseUrl, employeeCookie, businessDate);
    assert.equal(createToday.status, 201);
    const todayRequest = (await createToday.json()).data;
    assert.equal(todayRequest.status, "pending");
    assert.equal(todayRequest.employeeId, firstEmployee._id.toString());

    const duplicateToday = await createWfhRequest(baseUrl, employeeCookie, businessDate);
    assert.equal(duplicateToday.status, 409);

    const selfApprove = await request(baseUrl, "/api/wfh/" + todayRequest.id + "/approve", {
      method: "POST", cookie: employeeCookie, body: {}
    });
    assert.equal(selfApprove.status, 403);

    const employeeList = await request(baseUrl, "/api/wfh/me?employeeId=" + secondEmployee._id.toString(), {
      cookie: employeeCookie
    });
    assert.equal(employeeList.status, 200);
    assert.deepEqual((await employeeList.json()).data.map((entry) => entry.employeeId), [firstEmployee._id.toString()]);

    const adminList = await request(baseUrl, "/api/wfh?period=" + businessDate.slice(0, 7) + "&status=pending", {
      cookie: adminCookie
    });
    assert.equal(adminList.status, 200);
    assert.equal((await adminList.json()).pagination.total, 1);

    const approveToday = await request(baseUrl, "/api/wfh/" + todayRequest.id + "/approve", {
      method: "POST", cookie: adminCookie, body: {}
    });
    assert.equal(approveToday.status, 200);
    assert.equal((await approveToday.json()).data.status, "approved");
    const repeatApprove = await request(baseUrl, "/api/wfh/" + todayRequest.id + "/approve", {
      method: "POST", cookie: adminCookie, body: {}
    });
    assert.equal(repeatApprove.status, 409);

    const forgedCheckIn = await request(baseUrl, "/api/attendance/check-in", {
      method: "POST",
      cookie: employeeCookie,
      body: { date: "2000-01-01", checkedInAt: "2000-01-01T00:00:00.000Z", employeeId: secondEmployee._id.toString() }
    });
    assert.equal(forgedCheckIn.status, 400);
    const checkIn = await request(baseUrl, "/api/attendance/check-in", {
      method: "POST", cookie: employeeCookie, body: {}
    });
    assert.equal(checkIn.status, 201);
    const attendance = (await checkIn.json()).data;
    assert.equal(attendance.date, businessDate);
    assert.equal(attendance.status, "checked_in");
    const checkedInAt = new Date(attendance.checkedInAt);
    assert.ok(Math.abs(Date.now() - checkedInAt.getTime()) < 5_000);
    const storedAttendance = await AttendanceRecord.findById(attendance.id);
    assert.equal(storedAttendance.employeeId.toString(), firstEmployee._id.toString());

    const duplicateCheckIn = await request(baseUrl, "/api/attendance/check-in", {
      method: "POST", cookie: employeeCookie, body: {}
    });
    assert.equal(duplicateCheckIn.status, 409);
    const otherEmployeeAttendance = await request(baseUrl, "/api/attendance/me", { cookie: secondCookie });
    assert.equal(otherEmployeeAttendance.status, 200);
    assert.deepEqual((await otherEmployeeAttendance.json()).data, []);

    const adminAttendance = await request(baseUrl, "/api/attendance?period=" + businessDate.slice(0, 7), {
      cookie: adminCookie
    });
    assert.equal(adminAttendance.status, 200);
    const adminAttendanceBody = await adminAttendance.json();
    assert.equal(adminAttendanceBody.pagination.total, 1);
    assert.equal(adminAttendanceBody.data[0].employeeId, firstEmployee._id.toString());
    assert.equal(adminAttendanceBody.data[0].employee.employeeCode, employeeCode);

    const checkout = await request(baseUrl, "/api/attendance/check-out", {
      method: "POST", cookie: employeeCookie, body: {}
    });
    assert.equal(checkout.status, 200);
    const checkedOut = (await checkout.json()).data;
    assert.ok(new Date(checkedOut.checkedOutAt) >= checkedInAt);
    assert.equal(checkedOut.status, "completed");

    const repeatCheckout = await request(baseUrl, "/api/attendance/check-out", {
      method: "POST", cookie: employeeCookie, body: {}
    });
    assert.equal(repeatCheckout.status, 409);
    const correctCompleted = await request(baseUrl, "/api/attendance/" + attendance.id + "/correct-checkout", {
      method: "POST", cookie: adminCookie,
      body: { checkedOutAt: new Date().toISOString(), reason: "Trying to rewrite completed time" }
    });
    assert.equal(correctCompleted.status, 409);

    // A WFH reservation and a leave reservation cannot coexist for one employee/date.
    const leaveFirst = await request(baseUrl, "/api/unpaid-leave", {
      method: "POST", cookie: employeeCookie, body: { date: nextDate, reason: "Unpaid leave conflict test" }
    });
    assert.equal(leaveFirst.status, 201);
    const leaveRequest = (await leaveFirst.json()).data;
    const wfhConflict = await createWfhRequest(baseUrl, employeeCookie, nextDate, "Conflicting WFH request");
    assert.equal(wfhConflict.status, 409);

    const rejectLeave = await request(baseUrl, "/api/unpaid-leave/" + leaveRequest.id + "/reject", {
      method: "POST", cookie: adminCookie, body: { decisionNote: "Rejected for reservation test" }
    });
    assert.equal(rejectLeave.status, 200);
    const afterRejectedLeave = await createWfhRequest(baseUrl, employeeCookie, nextDate, "WFH after rejected leave");
    assert.equal(afterRejectedLeave.status, 201);
    const rejectedLeaveWfh = (await afterRejectedLeave.json()).data;
    const rejectWfh = await request(baseUrl, "/api/wfh/" + rejectedLeaveWfh.id + "/reject", {
      method: "POST", cookie: adminCookie, body: { decisionNote: "Release reservation for second test" }
    });
    assert.equal(rejectWfh.status, 200);

    const secondDayWfh = await createWfhRequest(baseUrl, secondCookie, nextFollowingDate, "Pending WFH to test cross type lock");
    assert.equal(secondDayWfh.status, 201);
    const secondDayWfhRequest = (await secondDayWfh.json()).data;
    const leaveBlockedByWfh = await request(baseUrl, "/api/unpaid-leave", {
      method: "POST", cookie: secondCookie, body: { date: nextFollowingDate, reason: "Conflicting unpaid leave" }
    });
    assert.equal(leaveBlockedByWfh.status, 409);

    // Incomplete check-in can be closed later by an admin correction with a reason.
    const secondTodayWfh = await createWfhRequest(baseUrl, secondCookie, businessDate, "WFH for attendance correction test");
    assert.equal(secondTodayWfh.status, 201);
    const secondTodayRequest = (await secondTodayWfh.json()).data;
    const approveSecondToday = await request(baseUrl, "/api/wfh/" + secondTodayRequest.id + "/approve", {
      method: "POST", cookie: adminCookie, body: {}
    });
    assert.equal(approveSecondToday.status, 200);
    const secondCheckIn = await request(baseUrl, "/api/attendance/check-in", {
      method: "POST", cookie: secondCookie, body: {}
    });
    assert.equal(secondCheckIn.status, 201);
    const missingCheckoutRecord = (await secondCheckIn.json()).data;
    await new Promise((resolve) => setTimeout(resolve, 25));

    const invalidCorrection = await request(baseUrl, "/api/attendance/" + missingCheckoutRecord.id + "/correct-checkout", {
      method: "POST", cookie: adminCookie,
      body: { checkedOutAt: new Date(Date.now() + 60_000).toISOString(), reason: "Future time is invalid" }
    });
    assert.equal(invalidCorrection.status, 400);
    const employeeCorrection = await request(baseUrl, "/api/attendance/" + missingCheckoutRecord.id + "/correct-checkout", {
      method: "POST", cookie: secondCookie,
      body: { checkedOutAt: new Date(Date.now() - 1).toISOString(), reason: "Employee cannot correct" }
    });
    assert.equal(employeeCorrection.status, 403);

    const correctedCheckoutAt = new Date(Date.now() - 1);
    const correction = await request(baseUrl, "/api/attendance/" + missingCheckoutRecord.id + "/correct-checkout", {
      method: "POST", cookie: adminCookie,
      body: { checkedOutAt: correctedCheckoutAt.toISOString(), reason: "Employee missed the checkout punch" }
    });
    assert.equal(correction.status, 200);
    const corrected = (await correction.json()).data;
    assert.equal(corrected.status, "corrected");
    assert.equal(corrected.correctedBy, (await User.findOne({ email: adminEmail }))._id.toString());
    assert.equal(corrected.correctionNote, "Employee missed the checkout punch");

    const repeatCorrection = await request(baseUrl, "/api/attendance/" + missingCheckoutRecord.id + "/correct-checkout", {
      method: "POST", cookie: adminCookie,
      body: { checkedOutAt: new Date().toISOString(), reason: "Second correction attempt" }
    });
    assert.equal(repeatCorrection.status, 409);

    // The pending WFH request remains valid until its payroll period is locked.
    // The payroll snapshot is only created after all unpaid-leave requests in the period are resolved.
    const lockPeriod = nextFollowingDate.slice(0, 7);
    const createRun = await request(baseUrl, "/api/payroll/runs", {
      method: "POST", cookie: adminCookie, body: { period: lockPeriod }
    });
    assert.equal(createRun.status, 201);
    const lockedApproval = await request(baseUrl, "/api/wfh/" + secondDayWfhRequest.id + "/approve", {
      method: "POST", cookie: adminCookie, body: {}
    });
    assert.equal(lockedApproval.status, 409);
    assert.equal((await lockedApproval.json()).code, "PAYROLL_PERIOD_LOCKED");

    const lockedNewRequest = await createWfhRequest(baseUrl, employeeCookie, nextFollowingDate, "Request after the month locked");
    assert.equal(lockedNewRequest.status, 409);
    assert.equal((await lockedNewRequest.json()).code, "PAYROLL_PERIOD_LOCKED");
    assert.equal(await AttendanceRecord.countDocuments({ employeeId: firstEmployee._id, date: dateOnlyToUtcDate(businessDate) }), 1);
  } finally {
    if (server) await new Promise((resolve) => server.close(() => resolve()));
    if (connected) await mongoose.disconnect();
  }
});
