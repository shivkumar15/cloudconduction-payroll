import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  approveWfhRequest,
  createMyWfhRequest,
  listMyWfhRequests,
  listWfhRequests,
  rejectWfhRequest
} from "../controllers/wfhController.js";

const router = Router();

router.use(requireAuth);
router.get("/me", requireRole("employee"), listMyWfhRequests);
router.post("/", requireRole("employee"), createMyWfhRequest);
router.get("/", requireRole("admin"), listWfhRequests);
router.post("/:id/approve", requireRole("admin"), approveWfhRequest);
router.post("/:id/reject", requireRole("admin"), rejectWfhRequest);

export default router;
