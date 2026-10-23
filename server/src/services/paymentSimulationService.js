import { randomUUID } from "node:crypto";

function isSafeNonNegativePaise(amountPaise) {
  return Number.isSafeInteger(amountPaise) && amountPaise >= 0;
}

export function buildPaymentIdempotencyKey(payrollRunId, employeeId) {
  if (!payrollRunId || !employeeId) {
    throw new TypeError("Payroll run ID and employee ID are required for idempotency");
  }
  return "payroll-run:" + payrollRunId.toString() + ":employee:" + employeeId.toString();
}

/**
 * Simulates an external payment-provider result. This function must never connect
 * to a bank or payment gateway. forceFailure exists only to test failure paths.
 */
export function simulatePayment({ amountPaise, currency = "INR", forceFailure = false }) {
  if (!isSafeNonNegativePaise(amountPaise)) {
    throw new RangeError("Simulated transaction amount must be a safe non-negative integer amount in paise");
  }
  if (currency !== "INR") {
    throw new RangeError("Only INR simulation is currently supported");
  }

  const status = forceFailure ? "failed" : "succeeded";
  return {
    provider: "simulation",
    status,
    simulatedReference: "SIM-" + randomUUID(),
    failureCode: forceFailure ? "SIMULATED_DECLINE" : null,
    message: forceFailure
      ? "Simulated failure requested for this test scenario"
      : "Simulated payment succeeded; no money was transferred",
    simulatedOnly: true
  };
}
