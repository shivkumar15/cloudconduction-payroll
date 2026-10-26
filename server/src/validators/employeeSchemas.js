import { z } from "zod";
import { MAX_SALARY_COMPONENT_PAISE } from "../utils/money.js";

const amountPaiseSchema = z.number()
  .int()
  .min(0)
  .max(MAX_SALARY_COMPONENT_PAISE);

export const salaryStructureSchema = z.object({
  baseSalaryPaise: amountPaiseSchema,
  monthlyAllowancesPaise: amountPaiseSchema,
  monthlyDeductionsPaise: amountPaiseSchema
}).strict().superRefine((salary, ctx) => {
  const gross = salary.baseSalaryPaise + salary.monthlyAllowancesPaise;
  if (salary.monthlyDeductionsPaise > gross) {
    ctx.addIssue({
      code: "custom",
      path: ["monthlyDeductionsPaise"],
      message: "Monthly deductions cannot exceed base salary plus allowances"
    });
  }
});

const employmentStartDateSchema = z.string()
  .regex(/^(19\d{2}|20\d{2}|2100)-\d{2}-\d{2}$/, "Use a date from 1900–2100 in YYYY-MM-DD format")
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Employment start date must be a real calendar date");

const employeeFields = {
  employeeCode: z.string().trim().min(3).max(20)
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]{2,19}$/, "Use 3–20 letters, numbers, or hyphens")
    .transform((code) => code.toUpperCase()),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  workEmail: z.string().trim().email().max(254)
    .transform((email) => email.toLowerCase()),
  department: z.string().trim().min(2).max(80),
  designation: z.string().trim().min(2).max(80),
  salaryStructure: salaryStructureSchema
};

export const createEmployeeSchema = z.object({
  ...employeeFields,
  employmentStartDate: employmentStartDateSchema,
  initialPassword: z.string().min(12).max(128)
}).strict();

export const updateEmployeeSchema = z.object({
  firstName: employeeFields.firstName.optional(),
  lastName: employeeFields.lastName.optional(),
  department: employeeFields.department.optional(),
  designation: employeeFields.designation.optional(),
  salaryStructure: employeeFields.salaryStructure.optional(),
  employmentStartDate: employmentStartDateSchema.optional(),
  employmentStatus: z.enum(["active", "inactive"]).optional()
}).strict().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "At least one editable field must be provided"
    });
  }
});

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(100).optional().default(""),
  department: z.string().trim().min(1).max(80).optional(),
  employmentStatus: z.enum(["active", "inactive"]).optional()
}).strict();
