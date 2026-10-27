import { env } from "../config/env.js";
import { buildPayrollInsightsSummary, buildDeterministicPayrollInsights, requestOpenAIPayrollInsights, reservePayrollInsightsUsage } from "../services/payrollInsightsService.js";
import { payrollInsightsRequestSchema } from "../validators/payrollInsightsSchemas.js";

function invalidRequest(res, issues) {
  return res.status(400).json({
    success: false,
    message: "Invalid payroll insights request",
    errors: issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }))
  });
}

function insightsResponse(summary, insights, mode, message) {
  return {
    success: true,
    data: {
      period: summary.period,
      periods: summary.periods,
      insights,
      mode,
      aiEnabled: mode === "ai",
      message,
      generatedAt: new Date().toISOString()
    }
  };
}

export async function getPayrollInsights(req, res, next) {
  const parsed = payrollInsightsRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalidRequest(res, parsed.error.issues);

  try {
    const summary = await buildPayrollInsightsSummary(parsed.data.period);

    if (!env.OPENAI_API_KEY) {
      return res.status(200).json(insightsResponse(
        summary,
        buildDeterministicPayrollInsights(summary),
        "disabled",
        "AI insights are disabled because OPENAI_API_KEY is not configured. Aggregate metrics and deterministic review guidance are still available."
      ));
    }

    try {
      await reservePayrollInsightsUsage(req.authUser._id);
    } catch (error) {
      if (error?.status === 429) {
        return res.status(429).json({
          success: false,
          code: error.code,
          message: error.message
        });
      }
      return next(error);
    }

    try {
      const insights = await requestOpenAIPayrollInsights(summary, {
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL
      });
      return res.status(200).json(insightsResponse(
        summary,
        insights,
        "ai",
        "AI-generated observations are advisory only; saved payroll values remain authoritative."
      ));
    } catch {
      console.warn("Payroll insights provider unavailable; returning deterministic aggregate guidance.");
      return res.status(200).json(insightsResponse(
        summary,
        buildDeterministicPayrollInsights(summary),
        "fallback",
        "AI insights are temporarily unavailable. Review the deterministic aggregate guidance below; no payroll values were changed."
      ));
    }
  } catch (error) {
    return next(error);
  }
}
