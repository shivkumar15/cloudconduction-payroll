import { z } from "zod";

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase())
}).strict();

export const confirmPasswordResetSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  newPassword: z.string().min(12).max(128)
}).strict();
