import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  approvePayrollRun,
  createPayrollRun,
  finalizePayrollRun,
  getMyPayroll,
  getPayrollRun,
  listPayrollRuns,
  previewPayroll,
  simulatePayrollTransactions
} from "../controllers/payrollController.js";

const router = Router();

router.use(requireAuth);
router.get("/me", requireRole("employee"), getMyPayroll);
router.get("/", requireRole("admin"), listPayrollRuns);
router.post("/preview", requireRole("admin"), previewPayroll);
router.post("/runs", requireRole("admin"), createPayrollRun);
router.get("/runs/:id", requireRole("admin"), getPayrollRun);
router.post("/runs/:id/approve", requireRole("admin"), approvePayrollRun);
router.post("/runs/:id/simulate-transactions", requireRole("admin"), simulatePayrollTransactions);
router.post("/runs/:id/finalize", requireRole("admin"), finalizePayrollRun);

export default router;
