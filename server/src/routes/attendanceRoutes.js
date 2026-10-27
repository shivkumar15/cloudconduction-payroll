import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  checkInWfhAttendance,
  checkOutWfhAttendance,
  correctAttendanceCheckout,
  listAttendance,
  listMyAttendance
} from "../controllers/attendanceController.js";

const router = Router();

router.use(requireAuth);
router.get("/me", requireRole("employee"), listMyAttendance);
router.post("/check-in", requireRole("employee"), checkInWfhAttendance);
router.post("/check-out", requireRole("employee"), checkOutWfhAttendance);
router.get("/", requireRole("admin"), listAttendance);
router.post("/:id/correct-checkout", requireRole("admin"), correctAttendanceCheckout);

export default router;
