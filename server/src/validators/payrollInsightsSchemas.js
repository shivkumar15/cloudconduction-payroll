import { z } from "zod";
import { payrollPeriodSchema } from "./payrollSchemas.js";

export const payrollInsightsRequestSchema = z.object({
  period: payrollPeriodSchema
}).strict();
