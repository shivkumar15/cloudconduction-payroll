import { z } from "zod";
import { env } from "../config/env.js";
import { PayrollRun } from "../models/PayrollRun.js";
import { buildPayrollInsightMetrics } from "../services/payrollInsightMetrics.js";
import {
  generatePayrollInsights,
  PayrollInsightsServiceError
} from "../services/aiPayrollInsightsService.js";
import { payrollPeriodSchema } from "../validators/payrollSchemas.js";

const periodQuerySchema = z.object({
  period: payrollPeriodSchema
}).strict();

// Projection is intentionally aggregate-only: employee-level payroll items are
// not retrieved for this endpoint and are never sent to the model.
const AGGREGATE_FIELDS = [
  "period",
  "currency",
  "status",
  "employeeCount",
  "totalGrossPayPaise",
  "totalDeductionsPaise",
  "totalNetPayPaise"
].join(" ");

function respondInvalidQuery(res) {
  return res.status(400).json({
    success: false,
    code: "INVALID_PAYROLL_PERIOD",
    message: "Provide a valid payroll period using YYYY-MM."
  });
}

export async function getAiPayrollInsights(req, res, next) {
  const parsed = periodQuerySchema.safeParse(req.query);
  if (!parsed.success) return respondInvalidQuery(res);

  if (typeof env.GEMINI_API_KEY !== "string" || !env.GEMINI_API_KEY.trim()) {
    return res.status(503).json({
      success: false,
      code: "AI_INSIGHTS_NOT_CONFIGURED",
      message: "AI Payroll Insights is disabled until GEMINI_API_KEY is configured in the backend. Billing does not need to be enabled."
    });
  }

  const period = parsed.data.period;

  try {
    const currentRun = await PayrollRun.findOne({ period, status: "finalized" })
      .select(AGGREGATE_FIELDS)
      .lean();

    if (!currentRun) {
      return res.status(404).json({
        success: false,
        code: "FINALIZED_PAYROLL_NOT_FOUND",
        message: "No finalized payroll run exists for " + period + ". Finalize that payroll period before generating insights."
      });
    }

    const previousRun = await PayrollRun.findOne({
      period: { $lt: period },
      status: "finalized"
    })
      .select(AGGREGATE_FIELDS)
      .sort({ period: -1 })
      .lean();

    const metrics = buildPayrollInsightMetrics({ currentRun, previousRun });
    const insights = await generatePayrollInsights(metrics);

    return res.status(200).json({
      success: true,
      data: {
        period,
        currency: metrics.currency,
        metrics,
        insights,
        provider: "Gemini",
        generatedAt: new Date().toISOString(),
        disclaimer: "AI-generated advisory information based on aggregate payroll metrics only. Verify all observations against source records. This is not tax, legal, or compliance advice."
      }
    });
  } catch (error) {
    if (error instanceof PayrollInsightsServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }
    return next(error);
  }
}
