import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../config/env.js";

// Keep this fixed to the model currently listed as available on Gemini's free tier.
// Do not add automatic fallback to another model: a free-tier failure must fail closed.
export const GEMINI_FREE_TIER_MODEL = "gemini-3.8-flash";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_CHARACTERS = 4_000;

export class PayrollInsightsServiceError extends Error {
  constructor(code, statusCode, message) {
    super(message);
    this.name = "PayrollInsightsServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const payrollInsightsResponseSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  observations: z.array(z.string().trim().min(1).max(240)).max(4),
  itemsToReview: z.array(z.string().trim().min(1).max(240)).max(4),
  limitations: z.string().trim().min(1).max(400)
}).strict();

const responseJsonSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "One concise summary of the supplied aggregate payroll metrics."
    },
    observations: {
      type: "array",
      description: "Up to four neutral observations supported by the supplied data.",
      items: { type: "string" },
      maxItems: 4
    },
    itemsToReview: {
      type: "array",
      description: "Up to four prudent checks for an administrator; do not assert wrongdoing or invent causes.",
      items: { type: "string" },
      maxItems: 4
    },
    limitations: {
      type: "string",
      description: "State that this is aggregate-only AI commentary and must be verified by an administrator."
    }
  },
  required: ["summary", "observations", "itemsToReview", "limitations"]
};

async function requestGemini({ apiKey, prompt }) {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: REQUEST_TIMEOUT_MS }
  });

  const response = await ai.interactions.create({
    model: GEMINI_FREE_TIER_MODEL,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: responseJsonSchema
    }
  });

  return response.output_text;
}

function wrapProviderError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  const name = String(error?.name || "");

  if (status === 429) {
    return new PayrollInsightsServiceError(
      "AI_PROVIDER_RATE_LIMITED",
      429,
      "Gemini free-tier rate or daily quota was reached. Try again after the quota resets. This app will not enable paid billing."
    );
  }

  if (status === 402 || status === 403) {
    return new PayrollInsightsServiceError(
      "AI_PROVIDER_UNAVAILABLE",
      503,
      "Gemini denied this request. Check this project's free-tier eligibility and model access in Google AI Studio. Paid billing remains disabled."
    );
  }

  if (name === "AbortError" || name === "TimeoutError" || /timeout/i.test(String(error?.message || ""))) {
    return new PayrollInsightsServiceError(
      "AI_PROVIDER_TIMEOUT",
      504,
      "Gemini took too long to respond. Please try again later."
    );
  }

  return new PayrollInsightsServiceError(
    "AI_PROVIDER_ERROR",
    502,
    "Gemini could not generate payroll insights right now. Please try again later."
  );
}

function createPrompt(metrics) {
  return [
    "You are an advisory analyst for a payroll administrator.",
    "Explain the supplied aggregate payroll metrics clearly and briefly.",
    "The supplied numeric values are authoritative. Do not recalculate or replace them.",
    "Do not infer causes from aggregates alone. Phrase uncertain points as checks to review.",
    "Do not make tax, legal, compliance, fraud, or employee-performance determinations.",
    "Do not recommend changing payroll, approving records, changing transactions, or taking action on an individual employee.",
    "Only use the data included below. Return JSON matching the required response schema.",
    "Payroll aggregate metrics in paise, with percentage changes computed by the application:",
    JSON.stringify(metrics)
  ].join("\n");
}

/**
 * Generates schema-validated advice from aggregate metrics only.
 * providerGenerate is injectable so tests never need a real key or network call.
 */
export async function generatePayrollInsights(
  metrics,
  { apiKey = env.GEMINI_API_KEY, providerGenerate = requestGemini } = {}
) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new PayrollInsightsServiceError(
      "AI_INSIGHTS_NOT_CONFIGURED",
      503,
      "AI Payroll Insights is not configured. Add GEMINI_API_KEY to server/.env. Billing does not need to be enabled."
    );
  }

  let rawText;
  try {
    rawText = await providerGenerate({
      apiKey: apiKey.trim(),
      prompt: createPrompt(metrics),
      model: GEMINI_FREE_TIER_MODEL,
      responseSchema: responseJsonSchema
    });
  } catch (error) {
    throw wrapProviderError(error);
  }

  if (typeof rawText !== "string" || !rawText.trim() || rawText.length > MAX_RESPONSE_CHARACTERS) {
    throw new PayrollInsightsServiceError(
      "AI_INVALID_OUTPUT",
      502,
      "Gemini returned an empty or oversized response. Please try again later."
    );
  }

  let decoded;
  try {
    decoded = JSON.parse(rawText);
  } catch {
    throw new PayrollInsightsServiceError(
      "AI_INVALID_OUTPUT",
      502,
      "Gemini returned an unreadable response. Please try again later."
    );
  }

  const parsed = payrollInsightsResponseSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new PayrollInsightsServiceError(
      "AI_INVALID_OUTPUT",
      502,
      "Gemini returned a response that failed validation. Please try again later."
    );
  }

  return parsed.data;
}
