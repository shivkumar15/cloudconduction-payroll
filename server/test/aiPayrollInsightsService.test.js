import test from "node:test";
import assert from "node:assert/strict";
import {
  GEMINI_FREE_TIER_MODEL,
  generatePayrollInsights,
  PayrollInsightsServiceError
} from "../src/services/aiPayrollInsightsService.js";

const metrics = {
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
};

const validResponse = {
  summary: "Net payroll is higher than the previous finalized period.",
  observations: ["Recorded net payroll increased by 25%."],
  itemsToReview: ["Confirm that the change matches expected staffing and salary updates."],
  limitations: "This is aggregate-only AI commentary and must be verified by an administrator."
};

test("generates validated structured insights using only the supplied aggregate metrics", async () => {
  let captured;
  const result = await generatePayrollInsights(metrics, {
    apiKey: "test-key",
    providerGenerate: async (request) => {
      captured = request;
      return JSON.stringify(validResponse);
    }
  });

  assert.deepEqual(result, validResponse);
  assert.equal(captured.apiKey, "test-key");
  assert.equal(captured.model, GEMINI_FREE_TIER_MODEL);
  assert.ok(captured.prompt.includes(JSON.stringify(metrics)));
  assert.match(captured.prompt, /Do not infer causes from aggregates alone/);
  assert.match(captured.prompt, /Do not make tax, legal, compliance, fraud/);
  assert.equal(captured.prompt.includes("Sensitive Name"), false);
});

test("does not call the provider without an API key", async () => {
  let wasCalled = false;
  await assert.rejects(
    generatePayrollInsights(metrics, {
      apiKey: "  ",
      providerGenerate: async () => { wasCalled = true; return JSON.stringify(validResponse); }
    }),
    (error) => error instanceof PayrollInsightsServiceError
      && error.code === "AI_INSIGHTS_NOT_CONFIGURED"
      && error.statusCode === 503
  );
  assert.equal(wasCalled, false);
});

test("rejects malformed JSON and schema-invalid provider responses", async () => {
  await assert.rejects(
    generatePayrollInsights(metrics, { apiKey: "test-key", providerGenerate: async () => "not-json" }),
    (error) => error.code === "AI_INVALID_OUTPUT"
  );

  await assert.rejects(
    generatePayrollInsights(metrics, {
      apiKey: "test-key",
      providerGenerate: async () => JSON.stringify({ ...validResponse, unexpected: "field" })
    }),
    (error) => error.code === "AI_INVALID_OUTPUT"
  );
});

test("rejects oversized provider responses", async () => {
  await assert.rejects(
    generatePayrollInsights(metrics, { apiKey: "test-key", providerGenerate: async () => "x".repeat(4_001) }),
    (error) => error.code === "AI_INVALID_OUTPUT"
  );
});

test("maps free-tier quota errors to a safe retry message without enabling billing", async () => {
  await assert.rejects(
    generatePayrollInsights(metrics, {
      apiKey: "test-key",
      providerGenerate: async () => { throw Object.assign(new Error("provider payload must not leak"), { status: 429 }); }
    }),
    (error) => error.code === "AI_PROVIDER_RATE_LIMITED"
      && error.statusCode === 429
      && error.message.includes("will not enable paid billing")
      && !error.message.includes("provider payload")
  );
});

test("maps free-tier eligibility errors to a safe response", async () => {
  await assert.rejects(
    generatePayrollInsights(metrics, {
      apiKey: "test-key",
      providerGenerate: async () => { throw Object.assign(new Error("private provider response"), { status: 403 }); }
    }),
    (error) => error.code === "AI_PROVIDER_UNAVAILABLE"
      && error.statusCode === 503
      && error.message.includes("free-tier eligibility")
      && !error.message.includes("private provider response")
  );
});

test("maps provider timeout errors to a safe response", async () => {
  await assert.rejects(
    generatePayrollInsights(metrics, {
      apiKey: "test-key",
      providerGenerate: async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }
    }),
    (error) => error.code === "AI_PROVIDER_TIMEOUT" && error.statusCode === 504
  );
});
