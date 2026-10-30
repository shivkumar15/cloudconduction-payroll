import test from "node:test";
import assert from "node:assert/strict";
import { buildPayrollInsightMetrics } from "../src/services/payrollInsightMetrics.js";

function run(overrides = {}) {
  return {
    period: "2026-09",
    status: "finalized",
    currency: "INR",
    employeeCount: 10,
    totalGrossPayPaise: 20_000_000,
    totalDeductionsPaise: 2_000_000,
    totalNetPayPaise: 18_000_000,
    items: [{ employeeId: "sensitive-id", employeeName: "Sensitive Name", netPayPaise: 123 }],
    ...overrides
  };
}

test("builds aggregate-only insights input from finalized payroll periods", () => {
  const result = buildPayrollInsightMetrics({
    currentRun: run({ period: "2026-10", employeeCount: 12, totalGrossPayPaise: 25_000_000, totalDeductionsPaise: 2_500_000, totalNetPayPaise: 22_500_000 }),
    previousRun: run()
  });

  assert.deepEqual(result, {
    period: "2026-10",
    currency: "INR",
    current: {
      employeeCount: 12,
      totalGrossPayPaise: 25_000_000,
      totalDeductionsPaise: 2_500_000,
      totalNetPayPaise: 22_500_000
    },
    comparison: {
      period: "2026-09",
      employeeCount: 10,
      totalGrossPayPaise: 20_000_000,
      totalDeductionsPaise: 2_000_000,
      totalNetPayPaise: 18_000_000,
      changes: {
        employeeCount: { absolute: 2, percent: 20 },
        totalGrossPayPaise: { absolute: 5_000_000, percent: 25 },
        totalDeductionsPaise: { absolute: 500_000, percent: 25 },
        totalNetPayPaise: { absolute: 4_500_000, percent: 25 }
      }
    }
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("sensitive-id"), false);
  assert.equal(serialized.includes("Sensitive Name"), false);
  assert.equal(Object.hasOwn(result.current, "items"), false);
  assert.equal(Object.hasOwn(result.current, "employeeName"), false);
  assert.equal(Object.hasOwn(result.current, "employeeId"), false);
});

test("supports a finalized period without a previous comparison", () => {
  const result = buildPayrollInsightMetrics({ currentRun: run() });
  assert.equal(result.period, "2026-09");
  assert.equal(result.comparison, null);
  assert.equal(result.current.totalNetPayPaise, 18_000_000);
});

test("rejects draft or approved runs", () => {
  assert.throws(() => buildPayrollInsightMetrics({ currentRun: run({ status: "draft" }) }), /must be finalized/);
  assert.throws(() => buildPayrollInsightMetrics({ currentRun: run({ status: "approved" }) }), /must be finalized/);
  assert.throws(() => buildPayrollInsightMetrics({ currentRun: run(), previousRun: run({ status: "draft" }) }), /must be finalized/);
});

test("rejects invalid periods, currency, employee count, and monetary values", () => {
  assert.throws(() => buildPayrollInsightMetrics({ currentRun: run({ period: "2026-13" }) }), /valid month/);
  assert.throws(() => buildPayrollInsightMetrics({ currentRun: run({ currency: "USD" }) }), /currency must be INR/);
  assert.throws(() => buildPayrollInsightMetrics({ currentRun: run({ employeeCount: 0 }) }), /positive safe integer/);
  assert.throws(() => buildPayrollInsightMetrics({ currentRun: run({ totalNetPayPaise: -1 }) }), /non-negative safe integer/);
  assert.throws(() => buildPayrollInsightMetrics({ currentRun: run({ totalGrossPayPaise: 1.5 }) }), /non-negative safe integer/);
});

test("requires the comparison period to be strictly earlier", () => {
  assert.throws(() => buildPayrollInsightMetrics({ currentRun: run(), previousRun: run() }), /must be earlier/);
  assert.throws(() => buildPayrollInsightMetrics({ currentRun: run({ period: "2026-09" }), previousRun: run({ period: "2026-10" }) }), /must be earlier/);
});

test("uses null percentage when the previous aggregate is zero", () => {
  const result = buildPayrollInsightMetrics({
    currentRun: run({ period: "2026-10", totalGrossPayPaise: 500, totalDeductionsPaise: 0, totalNetPayPaise: 500 }),
    previousRun: run({ totalGrossPayPaise: 0, totalDeductionsPaise: 0, totalNetPayPaise: 0 })
  });
  assert.deepEqual(result.comparison.changes.totalGrossPayPaise, { absolute: 500, percent: null });
  assert.deepEqual(result.comparison.changes.totalDeductionsPaise, { absolute: 0, percent: null });
  assert.deepEqual(result.comparison.changes.totalNetPayPaise, { absolute: 500, percent: null });
});
