import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { buildPaymentIdempotencyKey, simulatePayment } from "../src/services/paymentSimulationService.js";
import { transactionListQuerySchema, simulatePayrollTransactionsSchema } from "../src/validators/transactionSchemas.js";
import { PayrollTransaction } from "../src/models/PayrollTransaction.js";
import {
  createLocalPayoutRequest,
  isLocalPayoutStatusTransitionAllowed
} from "../src/services/localPayoutProvider.js";
import { app } from "../src/app.js";
import { isLocalPayoutTestModeEnabled } from "../src/utils/localPayoutTestMode.js";

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

test("simulation adapter is clearly simulated and validates integer paise", () => {
  const succeeded = simulatePayment({ amountPaise: 2_600_000 });
  assert.equal(succeeded.provider, "simulation");
  assert.equal(succeeded.status, "succeeded");
  assert.equal(succeeded.simulatedOnly, true);
  assert.match(succeeded.simulatedReference, /^SIM-/);
  assert.equal(succeeded.failureCode, null);

  const failed = simulatePayment({ amountPaise: 2_600_000, forceFailure: true });
  assert.equal(failed.status, "failed");
  assert.equal(failed.failureCode, "SIMULATED_DECLINE");

  assert.throws(() => simulatePayment({ amountPaise: -1 }), /safe non-negative integer/);
  assert.throws(() => simulatePayment({ amountPaise: 12.5 }), /safe non-negative integer/);
  assert.throws(() => simulatePayment({ amountPaise: 0, currency: "USD" }), /Only INR/);
});

test("local payout test mode is available outside production and requires explicit production opt-in", () => {
  assert.equal(isLocalPayoutTestModeEnabled({
    NODE_ENV: "development",
    ENABLE_LOCAL_PAYOUT_TESTS: false
  }), true);

  assert.equal(isLocalPayoutTestModeEnabled({
    NODE_ENV: "test",
    ENABLE_LOCAL_PAYOUT_TESTS: false
  }), true);

  assert.equal(isLocalPayoutTestModeEnabled({
    NODE_ENV: "production",
    ENABLE_LOCAL_PAYOUT_TESTS: false
  }), false);

  assert.equal(isLocalPayoutTestModeEnabled({
    NODE_ENV: "production",
    ENABLE_LOCAL_PAYOUT_TESTS: true
  }), true);
});

test("local payout provider creates test references and waits for a status event", () => {
  const payout = createLocalPayoutRequest({ amountPaise: 2_600_000 });
  assert.equal(payout.provider, "local-test");
  assert.equal(payout.status, "processing");
  assert.equal(payout.testOnly, true);
  assert.match(payout.providerReference, /^LPT-[A-F0-9]{20}$/);
  assert.match(payout.providerPaymentId, /^lpt_[a-f0-9-]+$/);
  assert.equal(payout.failureCode, null);

  const failed = createLocalPayoutRequest({ amountPaise: 2_600_000, forceFailure: true });
  assert.equal(failed.status, "failed");
  assert.equal(failed.failureCode, "LOCAL_TEST_DECLINE");

  assert.equal(isLocalPayoutStatusTransitionAllowed("processing", "succeeded"), true);
  assert.equal(isLocalPayoutStatusTransitionAllowed("processing", "failed"), true);
  assert.equal(isLocalPayoutStatusTransitionAllowed("succeeded", "failed"), false);
  assert.equal(isLocalPayoutStatusTransitionAllowed("failed", "succeeded"), false);
  assert.throws(() => createLocalPayoutRequest({ amountPaise: -1 }), /safe non-negative integer/);
  assert.throws(() => createLocalPayoutRequest({ amountPaise: 10, currency: "USD" }), /Only INR/);
});

test("local payout event schema rejects forged or malformed event fields", async () => {
  const { localPayoutEventSchema } = await import("../src/validators/transactionSchemas.js");
  assert.deepEqual(localPayoutEventSchema.parse({ eventId: "local-event-123", status: "succeeded" }), {
    eventId: "local-event-123",
    status: "succeeded"
  });
  assert.equal(localPayoutEventSchema.safeParse({ eventId: "short", status: "succeeded" }).success, false);
  assert.equal(localPayoutEventSchema.safeParse({ eventId: "local-event-123", status: "processing" }).success, false);
  assert.equal(localPayoutEventSchema.safeParse({ eventId: "local-event-123", status: "succeeded", isAdmin: true }).success, false);
});

test("logical payment idempotency key is stable per run and employee", () => {
  const runId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
  const employeeId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439012");
  const key = buildPaymentIdempotencyKey(runId, employeeId);
  assert.equal(key, buildPaymentIdempotencyKey(runId.toString(), employeeId.toString()));
  assert.match(key, /payroll-run:.*:employee:/);
  assert.notEqual(key, buildPaymentIdempotencyKey(runId, "507f1f77bcf86cd799439013"));
  assert.throws(() => buildPaymentIdempotencyKey("", employeeId), /required for idempotency/);
});

test("transaction list query validates filters and pagination", () => {
  assert.deepEqual(transactionListQuerySchema.parse({ period: "2026-10", status: "failed" }), {
    page: 1,
    pageSize: 10,
    period: "2026-10",
    status: "failed"
  });
  assert.equal(transactionListQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(transactionListQuerySchema.safeParse({ pageSize: "101" }).success, false);
  assert.equal(transactionListQuerySchema.safeParse({ period: "2026-13" }).success, false);
  assert.equal(transactionListQuerySchema.safeParse({ status: "pending" }).success, false);
  assert.equal(transactionListQuerySchema.parse({ status: "processing" }).status, "processing");
  assert.equal(transactionListQuerySchema.safeParse({ unexpected: true }).success, false);
});

test("failure simulation request rejects unknown fields and duplicate employee codes", () => {
  assert.deepEqual(simulatePayrollTransactionsSchema.parse({ failEmployeeCodes: ["emp-1"] }), {
    failEmployeeCodes: ["EMP-1"]
  });
  assert.equal(simulatePayrollTransactionsSchema.safeParse({ unknown: true }).success, false);
  assert.equal(simulatePayrollTransactionsSchema.safeParse({ failEmployeeCodes: ["EMP-1", "emp-1"] }).success, false);
  assert.equal(simulatePayrollTransactionsSchema.safeParse({ failEmployeeCodes: ["!bad"] }).success, false);
});

test("transaction model enforces unique idempotency and run/employee pairs", () => {
  const indexes = PayrollTransaction.schema.indexes();
  assert.equal(indexes.some(([fields, options]) => fields.idempotencyKey === 1 && options.unique === true), true);
  assert.equal(indexes.some(([fields, options]) =>
    fields.payrollRunId === 1 && fields.employeeId === 1 && options.unique === true
  ), true);
});

test("transaction endpoints require authentication", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(baseUrl + "/api/transactions");
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});
