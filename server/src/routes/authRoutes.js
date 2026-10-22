import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { changePassword, getCurrentUser, login, logout } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import passwordResetRoutes from "./passwordResetRoutes.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later."
  }
});

router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.get("/me", requireAuth, getCurrentUser);
router.post("/change-password", requireAuth, changePassword);
router.use("/password-reset", passwordResetRoutes);

export default router;
