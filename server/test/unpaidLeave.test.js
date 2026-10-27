import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { UnpaidLeaveRequest } from "../src/models/UnpaidLeaveRequest.js";
import { buildPayrollSnapshot } from "../src/services/payrollService.js";
import {
  calculateUnpaidLeaveDeductionPaise,
  getPayrollPeriodBounds,
  getWorkingDaysInPeriod,
  parsePayrollPeriod
} from "../src/services/unpaidLeaveService.js";
import {
  createUnpaidLeaveRequestSchema,
  rejectUnpaidLeaveSchema,
  unpaidLeaveListQuerySchema
} from "../src/validators/unpaidLeaveSchemas.js";

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

test("working-day divisor counts only Monday-Friday dates and handles leap years", () => {
  assert.equal(getWorkingDaysInPeriod("2026-11"), 21);
  assert.equal(getWorkingDaysInPeriod("2024-02"), 21);
  assert.throws(() => getWorkingDaysInPeriod("2026-13"), /valid YYYY-MM/);
  assert.deepEqual(parsePayrollPeriod("2026-11"), { year: 2026, month: 11 });
  assert.deepEqual(getPayrollPeriodBounds("2026-11"), {
    start: new Date("2026-11-01T00:00:00.000Z"),
    end: new Date("2026-12-01T00:00:00.000Z")
  });
});

test("unpaid-leave deduction rounds once to integer paise and accepts zero days", () => {
  assert.equal(calculateUnpaidLeaveDeductionPaise({
    monthlyGrossPayPaise: 2_800_000,
    unpaidLeaveDays: 1,
    period: "2026-11"
  }), 133_333);
  assert.equal(calculateUnpaidLeaveDeductionPaise({
    monthlyGrossPayPaise: 2_800_000,
    unpaidLeaveDays: 5,
    period: "2026-11"
  }), 666_667);
  assert.equal(calculateUnpaidLeaveDeductionPaise({
    monthlyGrossPayPaise: 2_800_000,
    unpaidLeaveDays: 0,
    period: "2026-11"
  }), 0);
});

test("unpaid-leave deduction rejects invalid money, fractional days and leave above monthly weekdays", () => {
  assert.throws(() => calculateUnpaidLeaveDeductionPaise({
    monthlyGrossPayPaise: -1, unpaidLeaveDays: 1, period: "2026-11"
  }), /gross pay/);
  assert.throws(() => calculateUnpaidLeaveDeductionPaise({
    monthlyGrossPayPaise: 2_800_000, unpaidLeaveDays: 1.5, period: "2026-11"
  }), /safe non-negative integer/);
  assert.throws(() => calculateUnpaidLeaveDeductionPaise({
    monthlyGrossPayPaise: 2_800_000, unpaidLeaveDays: 22, period: "2026-11"
  }), /cannot exceed/);
});

test("payroll snapshot keeps fixed and leave deductions separate and blocks negative net pay", () => {
  const employee = {
    _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
    employeeCode: "EMP-LOP",
    firstName: "Leave",
    lastName: "Tester",
    department: "Engineering",
    designation: "QA Engineer",
    employmentStatus: "active",
    currency: "INR",
    salaryStructure: {
      baseSalaryPaise: 2_500_000,
      monthlyAllowancesPaise: 300_000,
      monthlyDeductionsPaise: 200_000
    }
  };

  const snapshot = buildPayrollSnapshot([employee], {
    period: "2026-11",
    unpaidLeaveDaysByEmployeeId: new Map([[employee._id.toString(), 1]])
  });
  assert.equal(snapshot.items[0].fixedMonthlyDeductionsPaise, 200_000);
  assert.equal(snapshot.items[0].unpaidLeaveDays, 1);
  assert.equal(snapshot.items[0].unpaidLeaveDeductionPaise, 133_333);
  assert.equal(snapshot.items[0].monthlyDeductionsPaise, 333_333);
  assert.equal(snapshot.items[0].netPayPaise, 2_466_667);

  const almostEntireGross = {
    ...employee,
    salaryStructure: {
      ...employee.salaryStructure,
      monthlyDeductionsPaise: 2_700_000
    }
  };
  assert.throws(() => buildPayrollSnapshot([almostEntireGross], {
    period: "2026-11",
    unpaidLeaveDaysByEmployeeId: new Map([[employee._id.toString(), 1]])
  }), /Combined fixed and unpaid-leave deductions exceed gross pay/);
});

test("unpaid-leave request validation accepts explicit weekdays and rejects weekends/mass assignment", () => {
  assert.deepEqual(createUnpaidLeaveRequestSchema.parse({
    date: "2026-11-02",
    reason: "Medical leave"
  }), { date: "2026-11-02", reason: "Medical leave" });
  assert.equal(createUnpaidLeaveRequestSchema.safeParse({
    date: "2026-11-01",
    reason: "Medical leave"
  }).success, false);
  assert.equal(createUnpaidLeaveRequestSchema.safeParse({
    date: "2026-02-30",
    reason: "Medical leave"
  }).success, false);
  assert.equal(createUnpaidLeaveRequestSchema.safeParse({
    date: "2026-11-02",
    reason: "Medical leave",
    status: "approved",
    decidedBy: new mongoose.Types.ObjectId().toString()
  }).success, false);
  assert.equal(createUnpaidLeaveRequestSchema.safeParse({
    date: "2026-11-02",
    reason: "x"
  }).success, false);
  assert.equal(rejectUnpaidLeaveSchema.safeParse({ decisionNote: "Policy not met" }).success, true);
  assert.equal(rejectUnpaidLeaveSchema.safeParse({ decisionNote: "" }).success, false);
});

test("unpaid-leave filters bound pagination and reject unknown fields", () => {
  assert.deepEqual(unpaidLeaveListQuerySchema.parse({ period: "2026-11", status: "pending" }), {
    page: 1,
    pageSize: 25,
    period: "2026-11",
    status: "pending"
  });
  assert.equal(unpaidLeaveListQuerySchema.safeParse({ pageSize: 101 }).success, false);
  assert.equal(unpaidLeaveListQuerySchema.safeParse({ period: "2026-13" }).success, false);
  assert.equal(unpaidLeaveListQuerySchema.safeParse({ unexpected: "true" }).success, false);
});

test("unpaid-leave request model enforces one request per employee and date", () => {
  const indexes = UnpaidLeaveRequest.schema.indexes();
  assert.equal(indexes.some(([fields, options]) => (
    fields.employeeId === 1 && fields.date === 1 && options.unique === true
  )), true);
});

test("unpaid-leave endpoints reject anonymous requests", async (t) => {
  const baseUrl = await withServer(t);
  const me = await fetch(baseUrl + "/api/unpaid-leave/me");
  assert.equal(me.status, 401);
  assert.equal((await me.json()).success, false);

  const create = await fetch(baseUrl + "/api/unpaid-leave", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify({ date: "2026-11-02", reason: "Medical leave" })
  });
  assert.equal(create.status, 401);
  assert.equal((await create.json()).success, false);
});
