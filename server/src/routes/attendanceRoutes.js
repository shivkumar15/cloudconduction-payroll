import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  checkInWfhAttendance,
  checkOutWfhAttendance,
  listAttendance,
  listMyAttendance
} from "../controllers/attendanceController.js";

const router = Router();

router.use(requireAuth);
router.get("/me", requireRole("employee"), listMyAttendance);
router.post("/check-in", requireRole("employee"), checkInWfhAttendance);
router.post("/check-out", requireRole("employee"), checkOutWfhAttendance);
router.get("/", requireRole("admin"), listAttendance);

export default router;
