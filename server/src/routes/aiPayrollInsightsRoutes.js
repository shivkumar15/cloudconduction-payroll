import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getAiPayrollInsights } from "../controllers/aiPayrollInsightsController.js";

const router = Router();

const aiInsightsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    code: "AI_INSIGHTS_RATE_LIMITED",
    message: "AI insights are temporarily rate-limited to protect the Gemini free-tier quota. Try again later."
  }
});

router.get("/", requireAuth, requireRole("admin"), aiInsightsLimiter, getAiPayrollInsights);

export default router;
