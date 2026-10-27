import { z } from "zod";
import { PayrollRun } from "../models/PayrollRun.js";
import { PayrollTransaction } from "../models/PayrollTransaction.js";
import { PayrollInsightUsage } from "../models/PayrollInsightUsage.js";

const MAX_DAILY_CALLS = 20;
const MINIMUM_INTERVAL_MS = 60 * 1000;
const PROVIDER_TIMEOUT_MS = 8 * 1000;

const modelInsightsSchema = z.object({
  insights: z.array(z.object({
    severity: z.enum(["info", "review", "high"]),
    title: z.string().trim().min(1).max(100),
    summary: z.string().trim().min(1).max(300),
    action: z.string().trim().min(1).max(180)
  }).strict()).max(3)
}).strict();

export class PayrollInsightsLimitError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PayrollInsightsLimitError";
    this.code = code;
    this.status = 429;
  }
}

export function getPayrollInsightPeriods(period) {
  if (typeof period !== "string" || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(period)) {
    throw new TypeError("A valid YYYY-MM payroll period is required");
  }

  const parts = period.split("-").map(Number);
  return [2, 1, 0].map((offset) => {
    const date = new Date(Date.UTC(parts[0], parts[1] - 1 - offset, 1));
    return String(date.getUTCFullYear()) + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
  });
}

function safeSum(items, field) {
  const total = items.reduce((sum, item) => {
    const value = Number.isSafeInteger(item[field]) && item[field] >= 0 ? item[field] : 0;
    return sum + value;
  }, 0);
  return Number.isSafeInteger(total) ? total : 0;
}

function aggregatePayrollRun(run, transactionCounts) {
  const items = Array.isArray(run?.items) ? run.items : [];
  return {
    period: run.period,
    hasSavedRun: true,
    status: run.status,
    employeeCount: Number.isSafeInteger(run.employeeCount) ? run.employeeCount : items.length,
    totalGrossPayPaise: run.totalGrossPayPaise,
    totalDeductionsPaise: run.totalDeductionsPaise,
    totalNetPayPaise: run.totalNetPayPaise,
    unpaidLeaveDays: safeSum(items, "unpaidLeaveDays"),
    unpaidLeaveDeductionPaise: safeSum(items, "unpaidLeaveDeductionPaise"),
    transactions: transactionCounts
  };
}

export async function buildPayrollInsightsSummary(period) {
  const periods = getPayrollInsightPeriods(period);
  const [runs, transactionRows] = await Promise.all([
    PayrollRun.find({ period: { $in: periods } })
      .select("period status employeeCount totalGrossPayPaise totalDeductionsPaise totalNetPayPaise items.unpaidLeaveDays items.unpaidLeaveDeductionPaise")
      .lean(),
    PayrollTransaction.aggregate([
      { $match: { period: { $in: periods } } },
      { $group: { _id: { period: "$period", status: "$status" }, count: { $sum: 1 } } }
    ])
  ]);

  const runByPeriod = new Map(runs.map((run) => [run.period, run]));
  const transactionCountsByPeriod = new Map(periods.map((item) => [
    item,
    { total: 0, succeeded: 0, failed: 0 }
  ]));

  for (const row of transactionRows) {
    const counts = transactionCountsByPeriod.get(row._id.period);
    if (!counts) continue;
    if (row._id.status === "succeeded" || row._id.status === "failed") {
      counts[row._id.status] = row.count;
      counts.total += row.count;
    }
  }

  const periodSummaries = periods.map((item) => {
    const transactionCounts = transactionCountsByPeriod.get(item);
    const run = runByPeriod.get(item);
    if (run) return aggregatePayrollRun(run, transactionCounts);
    return {
      period: item,
      hasSavedRun: false,
      status: null,
      employeeCount: 0,
      totalGrossPayPaise: null,
      totalDeductionsPaise: null,
      totalNetPayPaise: null,
      unpaidLeaveDays: 0,
      unpaidLeaveDeductionPaise: 0,
      transactions: transactionCounts
    };
  });

  return {
    period,
    periods: periodSummaries,
    selectedPeriod: periodSummaries.find((item) => item.period === period) || null
  };
}

export function toModelAggregateInput(summary) {
  return {
    selectedPeriod: summary.period,
    periods: summary.periods.map((item) => ({
      period: item.period,
      hasSavedRun: item.hasSavedRun,
      status: item.status,
      employeeCount: item.employeeCount,
      totalGrossPayPaise: item.totalGrossPayPaise,
      totalDeductionsPaise: item.totalDeductionsPaise,
      totalNetPayPaise: item.totalNetPayPaise,
      unpaidLeaveDays: item.unpaidLeaveDays,
      unpaidLeaveDeductionPaise: item.unpaidLeaveDeductionPaise,
      transactions: {
        total: item.transactions.total,
        succeeded: item.transactions.succeeded,
        failed: item.transactions.failed
      }
    }))
  };
}

function percentageChange(current, previous) {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function buildDeterministicPayrollInsights(summary) {
  const selected = summary.selectedPeriod;
  const insights = [];

  if (!selected?.hasSavedRun) {
    insights.push({
      severity: "info",
      title: "No saved payroll run for this month",
      summary: "Period-specific totals are unavailable until a payroll snapshot has been saved.",
      action: "Open the payroll workspace and review the preview before creating a run."
    });
  } else {
    if (selected.transactions.failed > 0) {
      insights.push({
        severity: "high",
        title: "Failed simulated transactions remain",
        summary: selected.transactions.failed + " transaction(s) are currently marked failed for " + selected.period + ".",
        action: "Review the failed transactions and retry them before attempting to finalize this demo payroll."
      });
    }

    const previous = summary.periods
      .filter((item) => item.period < selected.period && item.hasSavedRun)
      .slice()
      .sort((a, b) => b.period.localeCompare(a.period))[0];

    if (previous) {
      const netChange = percentageChange(selected.totalNetPayPaise, previous.totalNetPayPaise);
      if (netChange !== null && Math.abs(netChange) >= 20 && insights.length < 3) {
        insights.push({
          severity: "review",
          title: "Net payroll changed materially",
          summary: "Net payroll changed by " + Math.abs(netChange) + "% compared with the prior saved run for " + previous.period + ".",
          action: "Compare the saved aggregate totals and review employee or approved-leave changes before relying on the report."
        });
      }

      if (
        selected.unpaidLeaveDeductionPaise > previous.unpaidLeaveDeductionPaise
        && insights.length < 3
      ) {
        insights.push({
          severity: "review",
          title: "Unpaid-leave deductions increased",
          summary: "The saved unpaid-leave deduction total is higher than in " + previous.period + ".",
          action: "Review approved leave records and the saved payslip breakdown; the insight does not change payroll values."
        });
      }
    }
  }

  if (insights.length === 0) {
    insights.push({
      severity: "info",
      title: "No configured aggregate warning was triggered",
      summary: "The basic checks found no threshold-based warning in the selected saved totals. This is not a full payroll audit.",
      action: "Continue to review payroll details, leave approvals and transaction history manually."
    });
  }

  return insights.slice(0, 3);
}

export function validatePayrollModelInsights(value) {
  return modelInsightsSchema.parse(value).insights;
}

export function extractResponsesApiText(responseBody) {
  if (typeof responseBody?.output_text === "string" && responseBody.output_text.trim()) {
    return responseBody.output_text;
  }

  const messages = Array.isArray(responseBody?.output) ? responseBody.output : [];
  for (const message of messages) {
    const contentParts = Array.isArray(message?.content) ? message.content : [];
    for (const part of contentParts) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
      if (part?.type === "refusal") {
        throw new Error("The AI provider refused to generate payroll insights");
      }
    }
  }
  throw new Error("The AI provider returned no usable structured output");
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["info", "review", "high"] },
          title: { type: "string" },
          summary: { type: "string" },
          action: { type: "string" }
        },
        required: ["severity", "title", "summary", "action"]
      }
    }
  },
  required: ["insights"]
};

export async function requestOpenAIPayrollInsights(summary, options = {}) {
  const apiKey = options.apiKey;
  const model = options.model || "gpt-5-mini";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new TypeError("An OpenAI API key is required");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("The server runtime does not provide fetch");
  }

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      store: false,
      instructions: "You are an advisory payroll analytics assistant for a portfolio demo. Analyze only the supplied company-level, period-level aggregate metrics. Do not calculate authoritative wages, infer employee-level facts, invent missing values, or propose changing records or transaction status. Give at most three concise, actionable observations for a human admin to review. Be explicit when there is insufficient historical data. Respond using the required structured JSON schema.",
      input: "Analyze these aggregate-only payroll metrics. All money values are integer INR paise; failed/succeeded counts describe simulated transactions only. Do not assume real money was transferred.\n" + JSON.stringify(toModelAggregateInput(summary)),
      max_output_tokens: 800,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "payroll_insights",
          strict: true,
          schema: responseSchema
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error("OpenAI Responses API returned HTTP " + response.status);
  }

  const body = await response.json();
  if (body?.status === "incomplete") {
    throw new Error("The AI provider returned an incomplete response");
  }

  const parsed = JSON.parse(extractResponsesApiText(body));
  return validatePayrollModelInsights(parsed);
}

export async function reservePayrollInsightsUsage(adminId, now = new Date()) {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const earliestAllowed = new Date(now.getTime() - MINIMUM_INTERVAL_MS);

  try {
    return await PayrollInsightUsage.findOneAndUpdate({
      adminId,
      dayStart,
      calls: { $lt: MAX_DAILY_CALLS },
      $or: [
        { lastRequestedAt: { $exists: false } },
        { lastRequestedAt: { $lte: earliestAllowed } }
      ]
    }, {
      $inc: { calls: 1 },
      $set: { lastRequestedAt: now },
      $setOnInsert: { adminId, dayStart }
    }, {
      new: true,
      upsert: true
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const existing = await PayrollInsightUsage.findOne({ adminId, dayStart }).lean();
    if (existing?.calls >= MAX_DAILY_CALLS) {
      throw new PayrollInsightsLimitError("AI_DAILY_LIMIT_REACHED", "Daily AI insights limit reached. Try again tomorrow (UTC).");
    }
    if (existing?.lastRequestedAt && existing.lastRequestedAt.getTime() > earliestAllowed.getTime()) {
      throw new PayrollInsightsLimitError("AI_RATE_LIMITED", "AI insights can be requested once per minute per admin.");
    }
    throw error;
  }
}
