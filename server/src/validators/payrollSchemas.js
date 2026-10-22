import { z } from "zod";

export const payrollPeriodSchema = z.string()
  .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/, "Period must use YYYY-MM format with a valid month (2000–2100)");

export const payrollPeriodBodySchema = z.object({
  period: payrollPeriodSchema
}).strict();

export const payrollListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  period: payrollPeriodSchema.optional()
}).strict();
