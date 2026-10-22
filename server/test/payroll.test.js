import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { calculateSalaryAmounts } from "../src/utils/money.js";
import { buildPayrollSnapshot, getPayrollTransition } from "../src/services/payrollService.js";
import { payrollPeriodSchema, payrollListQuerySchema } from "../src/validators/payrollSchemas.js";
import { PayrollRun } from "../src/models/PayrollRun.js";
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

test("monthly salary calculation uses exact integer paise", () => {
  const result = calculateSalaryAmounts({
    baseSalaryPaise: 2_500_000,
    monthlyAllowancesPaise: 300_000,
    monthlyDeductionsPaise: 200_000
  });

  assert.deepEqual(result, {
    baseSalaryPaise: 2_500_000,
    monthlyAllowancesPaise: 300_000,
    grossPayPaise: 2_800_000,
    monthlyDeductionsPaise: 200_000,
    netPayPaise: 2_600_000
  });
});

test("salary calculator rejects invalid amounts and deductions above gross", () => {
  assert.throws(() => calculateSalaryAmounts({
    baseSalaryPaise: -1,
    monthlyAllowancesPaise: 0,
    monthlyDeductionsPaise: 0
  }), /Base salary/);

  assert.throws(() => calculateSalaryAmounts({
    baseSalaryPaise: 1.5,
    monthlyAllowancesPaise: 0,
    monthlyDeductionsPaise: 0
  }), /Base salary/);

  assert.throws(() => calculateSalaryAmounts({
    baseSalaryPaise: 100,
    monthlyAllowancesPaise: 50,
    monthlyDeductionsPaise: 151
  }), /cannot exceed gross/);

  assert.throws(() => calculateSalaryAmounts({
    baseSalaryPaise: Number.MAX_SAFE_INTEGER + 1,
    monthlyAllowancesPaise: 0,
    monthlyDeductionsPaise: 0
  }), /Base salary/);
});

test("payroll snapshot includes active employees only and aggregates safe integer totals", () => {
  const employees = [
    {
      _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439012"),
      employeeCode: "EMP-B",
      firstName: "Bea",
      lastName: "Two",
      department: "Engineering",
      designation: "Engineer",
      employmentStatus: "active",
      currency: "INR",
      salaryStructure: {
        baseSalaryPaise: 1_500_000,
        monthlyAllowancesPaise: 0,
        monthlyDeductionsPaise: 100_000
      }
    },
    {
      _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
      employeeCode: "EMP-A",
      firstName: "Ada",
      lastName: "One",
      department: "Engineering",
      designation: "QA Engineer",
      employmentStatus: "active",
      currency: "INR",
      salaryStructure: {
        baseSalaryPaise: 2_500_000,
        monthlyAllowancesPaise: 300_000,
        monthlyDeductionsPaise: 200_000
      }
    },
    {
      _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439013"),
      employeeCode: "EMP-C",
      firstName: "Inactive",
      lastName: "Person",
      department: "Engineering",
      designation: "Engineer",
      employmentStatus: "inactive",
      currency: "INR",
      salaryStructure: {
        baseSalaryPaise: 9_000_000,
        monthlyAllowancesPaise: 0,
        monthlyDeductionsPaise: 0
      }
    }
  ];

  const snapshot = buildPayrollSnapshot(employees);
  assert.equal(snapshot.currency, "INR");
  assert.equal(snapshot.employeeCount, 2);
  assert.deepEqual(snapshot.items.map((item) => item.employeeCode), ["EMP-A", "EMP-B"]);
  assert.equal(snapshot.totalGrossPayPaise, 4_300_000);
  assert.equal(snapshot.totalDeductionsPaise, 300_000);
  assert.equal(snapshot.totalNetPayPaise, 4_000_000);
  assert.equal(snapshot.items.some((item) => item.employeeCode === "EMP-C"), false);
});

test("payroll periods require YYYY-MM and a valid month", () => {
  assert.equal(payrollPeriodSchema.safeParse("2026-10").success, true);
  assert.equal(payrollPeriodSchema.safeParse("2000-01").success, true);
  assert.equal(payrollPeriodSchema.safeParse("2100-12").success, true);
  assert.equal(payrollPeriodSchema.safeParse("2026-00").success, false);
  assert.equal(payrollPeriodSchema.safeParse("2026-13").success, false);
  assert.equal(payrollPeriodSchema.safeParse("2026-2").success, false);
  assert.equal(payrollPeriodSchema.safeParse("1999-12").success, false);
});

test("payroll run status transitions allow draft to approved to finalized only", () => {
  assert.deepEqual(getPayrollTransition("draft", "approve"), { from: "draft", to: "approved" });
  assert.deepEqual(getPayrollTransition("approved", "finalize"), { from: "approved", to: "finalized" });
  assert.equal(getPayrollTransition("draft", "finalize"), null);
  assert.equal(getPayrollTransition("approved", "approve"), null);
  assert.equal(getPayrollTransition("finalized", "finalize"), null);
  assert.equal(getPayrollTransition("draft", "process"), null);
});

test("payroll run model enforces a unique period index", () => {
  const indexes = PayrollRun.schema.indexes();
  assert.equal(indexes.some(([fields, options]) => fields.period === 1 && options.unique === true), true);
});

test("payroll list query bounds pagination and validates period filters", () => {
  assert.deepEqual(payrollListQuerySchema.parse({ period: "2026-10" }), {
    page: 1,
    pageSize: 10,
    period: "2026-10"
  });
  assert.equal(payrollListQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(payrollListQuerySchema.safeParse({ pageSize: "101" }).success, false);
  assert.equal(payrollListQuerySchema.safeParse({ period: "2026-14" }).success, false);
  assert.equal(payrollListQuerySchema.safeParse({ unexpected: "true" }).success, false);
});

test("payroll API requires authentication before exposing runs", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(baseUrl + "/api/payroll");
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});
