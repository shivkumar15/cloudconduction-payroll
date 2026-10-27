import { z } from "zod";

const dateOnlySchema = z.string()
  .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use a payroll date in YYYY-MM-DD format (2000–2100)")
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "WFH date must be a real calendar date");

const periodSchema = z.string()
  .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/, "Period must use YYYY-MM format with a valid month");

export const createWfhRequestSchema = z.object({
  date: dateOnlySchema,
  reason: z.string().trim().min(3).max(240)
}).strict();

export const wfhListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  period: periodSchema.optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional()
}).strict();

export const rejectWfhSchema = z.object({
  decisionNote: z.string().trim().min(3).max(240)
}).strict();

export const wfhIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid WFH request ID");

export const attendanceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  period: periodSchema.optional(),
  status: z.enum(["checked_in", "completed"]).optional()
}).strict();

export const attendancePunchBodySchema = z.object({}).strict();

const datetimeWithOffset = z.string().datetime({ offset: true });
export const correctAttendanceCheckoutSchema = z.object({
  checkedOutAt: datetimeWithOffset,
  reason: z.string().trim().min(3).max(240)
}).strict();
export const attendanceIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid attendance record ID");

export function isRealWfhDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
