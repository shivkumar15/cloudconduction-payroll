import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { AttendanceRecord } from "../src/models/AttendanceRecord.js";
import { EmployeeDayReservation } from "../src/models/EmployeeDayReservation.js";
import { WfhRequest } from "../src/models/WfhRequest.js";
import {
  attendanceListQuerySchema,
  attendancePunchBodySchema,
  correctAttendanceCheckoutSchema,
  createWfhRequestSchema,
  rejectWfhSchema,
  wfhListQuerySchema
} from "../src/validators/wfhSchemas.js";
import {
  addDateOnlyDays,
  getAttendancePeriodBounds,
  getIndiaBusinessDate,
  isWfhRequestDateAllowed
} from "../src/services/wfhService.js";

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

test("India business date uses Asia/Kolkata rather than the host timezone", () => {
  assert.equal(getIndiaBusinessDate(new Date("2026-10-26T18:45:00.000Z")), "2026-10-27");
  assert.equal(getIndiaBusinessDate(new Date("2026-10-27T17:59:00.000Z")), "2026-10-27");
  assert.equal(getIndiaBusinessDate(new Date("2026-10-27T18:30:00.000Z")), "2026-10-28");
});

test("WFH request window includes today and day 365, but rejects past and day 366", () => {
  assert.equal(addDateOnlyDays("2026-10-27", 365), "2027-10-27");
  assert.equal(isWfhRequestDateAllowed("2026-10-27", "2026-10-27"), true);
  assert.equal(isWfhRequestDateAllowed("2027-10-27", "2026-10-27"), true);
  assert.equal(isWfhRequestDateAllowed("2026-10-26", "2026-10-27"), false);
  assert.equal(isWfhRequestDateAllowed("2027-10-28", "2026-10-27"), false);
  assert.equal(isWfhRequestDateAllowed("2026-02-30", "2026-02-01"), false);
  assert.throws(() => addDateOnlyDays("2026-02-30", 1), /real YYYY-MM-DD/);
});

test("WFH request, list, punch and admin-correction schemas reject mass assignment", () => {
  assert.deepEqual(createWfhRequestSchema.parse({ date: "2026-10-27", reason: "Internet repair" }), {
    date: "2026-10-27",
    reason: "Internet repair"
  });
  assert.equal(createWfhRequestSchema.safeParse({ date: "2026-02-30", reason: "Internet repair" }).success, false);
  assert.equal(createWfhRequestSchema.safeParse({ date: "2026-10-27", reason: "x" }).success, false);
  assert.equal(createWfhRequestSchema.safeParse({
    date: "2026-10-27", reason: "Internet repair", status: "approved", employeeId: new mongoose.Types.ObjectId().toString()
  }).success, false);
  assert.equal(rejectWfhSchema.safeParse({ decisionNote: "Not allowed by policy" }).success, true);
  assert.equal(rejectWfhSchema.safeParse({ decisionNote: "x" }).success, false);
  assert.equal(attendancePunchBodySchema.safeParse({}).success, true);
  assert.equal(attendancePunchBodySchema.safeParse({ checkedInAt: "2000-01-01T00:00:00Z" }).success, false);
  assert.equal(correctAttendanceCheckoutSchema.safeParse({
    checkedOutAt: "2026-10-27T15:30:00+05:30",
    reason: "Employee missed checkout"
  }).success, true);
  assert.equal(correctAttendanceCheckoutSchema.safeParse({
    checkedOutAt: "2026-10-27T15:30:00",
    reason: "Employee missed checkout"
  }).success, false);
});

test("WFH and attendance list queries are bounded and strict", () => {
  assert.deepEqual(wfhListQuerySchema.parse({ period: "2026-10", status: "pending" }), {
    page: 1, pageSize: 25, period: "2026-10", status: "pending"
  });
  assert.equal(wfhListQuerySchema.safeParse({ pageSize: 101 }).success, false);
  assert.equal(wfhListQuerySchema.safeParse({ unexpected: "field" }).success, false);
  assert.deepEqual(attendanceListQuerySchema.parse({ status: "completed" }), {
    page: 1, pageSize: 25, status: "completed"
  });
  assert.equal(attendanceListQuerySchema.safeParse({ period: "2026-13" }).success, false);
  assert.deepEqual(getAttendancePeriodBounds("2026-10"), {
    start: new Date("2026-10-01T00:00:00.000Z"),
    end: new Date("2026-11-01T00:00:00.000Z")
  });
});

test("WFH and attendance database models enforce unique employee/date invariants", () => {
  const wfhIndexes = WfhRequest.schema.indexes();
  assert.equal(wfhIndexes.some(([fields, options]) => fields.employeeId === 1 && fields.date === 1 && options.unique), true);
  const attendanceIndexes = AttendanceRecord.schema.indexes();
  assert.equal(attendanceIndexes.some(([fields, options]) => fields.employeeId === 1 && fields.date === 1 && options.unique), true);
  const reservationIndexes = EmployeeDayReservation.schema.indexes();
  assert.equal(reservationIndexes.some(([fields, options]) => fields.employeeId === 1 && fields.date === 1 && options.unique), true);
});

test("attendance model rejects checkout before check-in", async () => {
  const record = new AttendanceRecord({
    employeeId: new mongoose.Types.ObjectId(),
    date: new Date("2026-10-27T00:00:00.000Z"),
    mode: "wfh",
    wfhRequestId: new mongoose.Types.ObjectId(),
    checkedInAt: new Date("2026-10-27T10:00:00.000Z"),
    checkedOutAt: new Date("2026-10-27T09:00:00.000Z")
  });
  await assert.rejects(() => record.validate(), /Check-out must occur after check-in/);
});

test("WFH and attendance APIs deny anonymous and employee access to admin lists", async (t) => {
  const baseUrl = await withServer(t);
  const anonymousWfh = await fetch(baseUrl + "/api/wfh/me");
  assert.equal(anonymousWfh.status, 401);
  const anonymousAttendance = await fetch(baseUrl + "/api/attendance/me");
  assert.equal(anonymousAttendance.status, 401);
  const anonymousCheckIn = await fetch(baseUrl + "/api/attendance/check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: "{}"
  });
  assert.equal(anonymousCheckIn.status, 401);
  assert.equal((await anonymousCheckIn.json()).success, false);
});
