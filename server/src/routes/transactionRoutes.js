import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getMyTransactions,
  getTransactionById,
  listTransactions,
  retrySimulatedTransaction,
  applyLocalPayoutEvent
} from "../controllers/transactionController.js";

const router = Router();

router.use(requireAuth);
router.get("/me", requireRole("employee"), getMyTransactions);
router.get("/", requireRole("admin"), listTransactions);
router.get("/:id", requireRole("admin"), getTransactionById);
router.post("/:id/retry", requireRole("admin"), retrySimulatedTransaction);
router.post("/:id/local-event", requireRole("admin"), applyLocalPayoutEvent);

export default router;
