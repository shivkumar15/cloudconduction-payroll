import { z } from "zod";

const dateOnlySchema = z.string()
  .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use a payroll date in YYYY-MM-DD format (2000–2100)")
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Leave date must be a real calendar date")
  .refine((value) => {
    const day = new Date(value + "T00:00:00.000Z").getUTCDay();
    return day >= 1 && day <= 5;
  }, "Unpaid leave must be requested for a Monday–Friday workday");

const periodSchema = z.string()
  .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/, "Period must use YYYY-MM format with a valid month");

export const createUnpaidLeaveRequestSchema = z.object({
  date: dateOnlySchema,
  reason: z.string().trim().min(3).max(240)
}).strict();

const rangeBoundDateSchema = z.string()
  .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use a date in YYYY-MM-DD format (2000–2100)")
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Date must be a real calendar date");

export const createUnpaidLeaveRangeRequestSchema = z.object({
  startDate: rangeBoundDateSchema,
  endDate: rangeBoundDateSchema,
  reason: z.string().trim().min(3).max(240)
}).strict().superRefine((value, ctx) => {
  if (value.startDate > value.endDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date must be on or after the start date" });
    return;
  }
  if (value.startDate.slice(0, 7) !== value.endDate.slice(0, 7)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "A leave range must stay within one payroll month" });
    return;
  }
  const cursor = new Date(value.startDate + "T00:00:00.000Z");
  const end = new Date(value.endDate + "T00:00:00.000Z");
  let weekdays = 0;
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5) weekdays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (weekdays === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "The selected range must include at least one Monday-Friday workday" });
  }
});

export const unpaidLeaveListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  period: periodSchema.optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional()
}).strict();

export const rejectUnpaidLeaveSchema = z.object({
  decisionNote: z.string().trim().min(3).max(240)
}).strict();

export const unpaidLeaveIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid unpaid-leave request ID");

export function isWeekdayDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const day = parsed.getUTCDay();
  return day >= 1 && day <= 5;
}
