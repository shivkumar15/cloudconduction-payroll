import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  approveUnpaidLeaveRequest,
  createMyUnpaidLeaveRequest,
  listMyUnpaidLeaveRequests,
  listUnpaidLeaveRequests,
  rejectUnpaidLeaveRequest
} from "../controllers/unpaidLeaveController.js";

const router = Router();

router.use(requireAuth);
router.get("/me", requireRole("employee"), listMyUnpaidLeaveRequests);
router.post("/", requireRole("employee"), createMyUnpaidLeaveRequest);
router.get("/", requireRole("admin"), listUnpaidLeaveRequests);
router.post("/:id/approve", requireRole("admin"), approveUnpaidLeaveRequest);
router.post("/:id/reject", requireRole("admin"), rejectUnpaidLeaveRequest);

export default router;
