import { User } from "../models/User.js";
import { env } from "../config/env.js";
import {
  confirmPasswordResetSchema,
  requestPasswordResetSchema
} from "../validators/passwordResetSchemas.js";
import { isSmtpConfigured, sendPasswordResetOtpEmail } from "../services/emailService.js";
import {
  generatePasswordResetOtp,
  hashPasswordResetOtp,
  passwordResetOtpMatches
} from "../utils/passwordResetOtp.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const GENERIC_REQUEST_MESSAGE = "If an active account exists for that email, a reset code will be sent.";
const INVALID_OTP_MESSAGE = "The reset code is invalid or expired. Request a new code and try again.";

export async function requestPasswordReset(req, res, next) {
  const parsed = requestPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email address."
    });
  }

  // Fail consistently when the deployment has no mail configuration; do not query users first.
  if (!isSmtpConfigured()) {
    return res.status(503).json({
      success: false,
      message: "Password reset email is not configured on this server yet."
    });
  }

  try {
    const now = new Date();
    const user = await User.findOne({
      email: parsed.data.email,
      isActive: true
    }).select("+passwordResetRequestedAt +passwordResetOtpHash +passwordResetExpiresAt +passwordResetAttempts");

    // A generic response prevents account enumeration.
    if (!user) {
      return res.status(202).json({ success: true, message: GENERIC_REQUEST_MESSAGE });
    }

    if (
      user.passwordResetRequestedAt &&
      now.getTime() - user.passwordResetRequestedAt.getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      return res.status(202).json({ success: true, message: GENERIC_REQUEST_MESSAGE });
    }

    const otp = generatePasswordResetOtp();
    user.passwordResetOtpHash = hashPasswordResetOtp(user._id.toString(), otp);
    user.passwordResetExpiresAt = new Date(now.getTime() + OTP_TTL_MS);
    user.passwordResetAttempts = 0;
    user.passwordResetRequestedAt = now;
    await user.save();

    try {
      await sendPasswordResetOtpEmail({ to: user.email, otp });
    } catch (mailError) {
      // Do not expose whether the address exists or leak OTP/mail details to the client.
      await User.updateOne(
        { _id: user._id, passwordResetOtpHash: user.passwordResetOtpHash },
        {
          $set: {
            passwordResetOtpHash: null,
            passwordResetExpiresAt: null,
            passwordResetAttempts: 0
          }
        }
      );
      console.error("Password reset email delivery failed:", mailError?.message || "unknown mail error");
    }

    return res.status(202).json({ success: true, message: GENERIC_REQUEST_MESSAGE });
  } catch (error) {
    return next(error);
  }
}

export async function confirmPasswordReset(req, res, next) {
  const parsed = confirmPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email, 6-digit code, and a password of at least 12 characters."
    });
  }

  try {
    const user = await User.findOne({ email: parsed.data.email, isActive: true })
      .select("+passwordResetOtpHash +passwordResetExpiresAt +passwordResetAttempts");

    const now = new Date();
    if (
      !user ||
      !user.passwordResetOtpHash ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt <= now ||
      user.passwordResetAttempts >= MAX_OTP_ATTEMPTS
    ) {
      return res.status(400).json({ success: false, message: INVALID_OTP_MESSAGE });
    }

    const matches = passwordResetOtpMatches(
      user._id.toString(),
      parsed.data.otp,
      user.passwordResetOtpHash
    );

    if (!matches) {
      await User.updateOne(
        {
          _id: user._id,
          passwordResetOtpHash: user.passwordResetOtpHash,
          passwordResetExpiresAt: { $gt: now },
          passwordResetAttempts: { $lt: MAX_OTP_ATTEMPTS }
        },
        { $inc: { passwordResetAttempts: 1 } }
      );
      return res.status(400).json({ success: false, message: INVALID_OTP_MESSAGE });
    }

    const passwordHash = await User.hashPassword(parsed.data.newPassword);
    // Conditional update consumes the OTP atomically. Concurrent confirmations cannot reuse it.
    const result = await User.updateOne(
      {
        _id: user._id,
        passwordResetOtpHash: user.passwordResetOtpHash,
        passwordResetExpiresAt: { $gt: new Date() },
        passwordResetAttempts: { $lt: MAX_OTP_ATTEMPTS }
      },
      {
        $set: {
          passwordHash,
          passwordResetOtpHash: null,
          passwordResetExpiresAt: null,
          passwordResetAttempts: 0,
          passwordResetRequestedAt: null
        },
        $inc: { tokenVersion: 1 }
      }
    );

    if (result.modifiedCount !== 1) {
      return res.status(400).json({ success: false, message: INVALID_OTP_MESSAGE });
    }

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. Please sign in using your new password."
    });
  } catch (error) {
    return next(error);
  }
}
