import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { PayrollInsightUsage } from "../src/models/PayrollInsightUsage.js";
import {
  buildDeterministicPayrollInsights,
  extractResponsesApiText,
  getPayrollInsightPeriods,
  toModelAggregateInput,
  validatePayrollModelInsights,
  requestOpenAIPayrollInsights
} from "../src/services/payrollInsightsService.js";

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

test("insights period window includes the selected month and two prior calendar months", () => {
  assert.deepEqual(getPayrollInsightPeriods("2027-01"), ["2026-11", "2026-12", "2027-01"]);
  assert.deepEqual(getPayrollInsightPeriods("2024-03"), ["2024-01", "2024-02", "2024-03"]);
  assert.throws(() => getPayrollInsightPeriods("2026-13"), /valid YYYY-MM/);
});

test("model payload contains only period-level aggregates and no employee identifiers", () => {
  const result = toModelAggregateInput({
    period: "2026-10",
    periods: [{
      period: "2026-10",
      hasSavedRun: true,
      status: "finalized",
      employeeCount: 4,
      totalGrossPayPaise: 1000,
      totalDeductionsPaise: 100,
      totalNetPayPaise: 900,
      unpaidLeaveDays: 2,
      unpaidLeaveDeductionPaise: 50,
      transactions: { total: 4, succeeded: 3, failed: 1 },
      items: [{ employeeName: "Must not be sent", employeeCode: "SECRET" }]
    }]
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("Must not be sent"), false);
  assert.equal(serialized.includes("SECRET"), false);
  assert.equal(serialized.includes("employeeCode"), false);
  assert.equal(result.periods[0].employeeCount, 4);
  assert.equal(result.periods[0].transactions.failed, 1);
});

test("deterministic insights flag failed transactions and missing payroll history", () => {
  const failed = buildDeterministicPayrollInsights({
    period: "2026-10",
    selectedPeriod: {
      period: "2026-10",
      hasSavedRun: true,
      totalNetPayPaise: 900,
      unpaidLeaveDeductionPaise: 50,
      transactions: { failed: 1 }
    },
    periods: []
  });
  assert.equal(failed[0].severity, "high");
  assert.match(failed[0].title, /Failed simulated transactions/);

  const empty = buildDeterministicPayrollInsights({
    period: "2026-10",
    selectedPeriod: { period: "2026-10", hasSavedRun: false },
    periods: []
  });
  assert.equal(empty.length, 1);
  assert.match(empty[0].summary, /unavailable/);
});

test("structured model output rejects invalid severity, oversized messages and extra fields", () => {
  assert.deepEqual(validatePayrollModelInsights({
    insights: [{ severity: "review", title: "Review", summary: "Check totals.", action: "Inspect records." }]
  }).length, 1);
  assert.throws(() => validatePayrollModelInsights({
    insights: [{ severity: "danger", title: "Review", summary: "Check totals.", action: "Inspect records." }]
  }));
  assert.throws(() => validatePayrollModelInsights({
    insights: [{ severity: "review", title: "Review", summary: "x".repeat(301), action: "Inspect records." }]
  }));
  assert.throws(() => validatePayrollModelInsights({
    insights: [{ severity: "review", title: "Review", summary: "Check totals.", action: "Inspect records.", employeeCode: "x" }]
  }));
});

test("Responses API extraction accepts output_text and nested output messages", () => {
  assert.equal(extractResponsesApiText({ output_text: "{\"insights\":[]}" }), "{\"insights\":[]}");
  assert.equal(extractResponsesApiText({
    output: [{ type: "message", content: [{ type: "output_text", text: "{\"insights\":[]}" }] }]
  }), "{\"insights\":[]}");
  assert.throws(() => extractResponsesApiText({ output: [{ type: "message", content: [{ type: "refusal" }] }] }), /refused/);
});

test("OpenAI Responses request uses a strict schema and does not store the response", async () => {
  let requestBody = null;
  const fakeFetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          insights: [{ severity: "info", title: "Observation", summary: "Aggregate data only.", action: "Review the report." }]
        })
      })
    };
  };

  const insights = await requestOpenAIPayrollInsights({
    period: "2026-10",
    periods: [{
      period: "2026-10",
      hasSavedRun: false,
      transactions: { total: 0, succeeded: 0, failed: 0 }
    }]
  }, { apiKey: "test-key", model: "gpt-5-mini", fetchImpl: fakeFetch });

  assert.equal(insights.length, 1);
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.text.format.type, "json_schema");
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.max_output_tokens, 800);
});

test("usage model has a unique per-admin UTC day index and retention cleanup index", () => {
  const indexes = PayrollInsightUsage.schema.indexes();
  assert.equal(indexes.some(([fields, options]) => fields.adminId === 1 && fields.dayStart === 1 && options.unique === true), true);
  assert.equal(indexes.some(([fields, options]) => fields.dayStart === 1 && options.expireAfterSeconds === 60 * 60 * 24 * 60), true);
  assert.ok(mongoose.Types.ObjectId.isValid(new mongoose.Types.ObjectId().toString()));
});

test("payroll insights API requires authentication", async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(baseUrl + "/api/payroll-insights", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify({ period: "2026-10" })
  });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});
