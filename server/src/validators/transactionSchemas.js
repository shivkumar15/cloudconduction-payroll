import { z } from "zod";

const periodSchema = z.string()
  .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/, "Period must use YYYY-MM format with a valid month (2000–2100)");

export const transactionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  period: periodSchema.optional(),
  status: z.enum(["succeeded", "failed"]).optional()
}).strict();

export const simulatePayrollTransactionsSchema = z.object({
  failEmployeeCodes: z.array(
    z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9][A-Za-z0-9-]{2,19}$/)
      .transform((code) => code.toUpperCase())
  ).max(100).optional().default([])
}).strict().superRefine((data, ctx) => {
  if (new Set(data.failEmployeeCodes).size !== data.failEmployeeCodes.length) {
    ctx.addIssue({
      code: "custom",
      path: ["failEmployeeCodes"],
      message: "Employee codes in the failure simulation must be unique"
    });
  }
});

export const transactionIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid transaction ID");
