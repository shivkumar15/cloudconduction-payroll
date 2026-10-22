import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  confirmPasswordReset,
  requestPasswordReset
} from "../controllers/passwordResetController.js";

const router = Router();

const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password reset requests. Please try again later."
  }
});

const resetConfirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many reset attempts. Please try again later."
  }
});

router.post("/request", resetRequestLimiter, requestPasswordReset);
router.post("/confirm", resetConfirmLimiter, confirmPasswordReset);

export default router;
