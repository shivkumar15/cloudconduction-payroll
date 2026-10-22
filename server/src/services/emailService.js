import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export function isSmtpConfigured() {
  return Boolean(
    env.SMTP_HOST &&
    env.SMTP_PORT &&
    env.SMTP_USER &&
    env.SMTP_PASS &&
    env.MAIL_FROM
  );
}

export async function sendPasswordResetOtpEmail({ to, otp }) {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP is not configured");
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  });

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to,
    subject: "Your CloudConduction Payroll password reset code",
    text: [
      "We received a request to reset your CloudConduction Payroll password.",
      "",
      `Your one-time reset code is: ${otp}`,
      "",
      "This code expires in 10 minutes. It can be used only once.",
      "If you did not request this, you can ignore this email.",
      "",
      "For your security, do not share this code with anyone."
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto">
      <h2>Reset your CloudConduction Payroll password</h2>
      <p>We received a request to reset your password.</p>
      <p style="font-size:28px;letter-spacing:8px;font-weight:700">${otp}</p>
      <p>This one-time code expires in 10 minutes and can be used only once.</p>
      <p>If you did not request this, ignore this email. Never share the code.</p>
    </div>`
  });
}
