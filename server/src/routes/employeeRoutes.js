import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  requireEmployeeReadAccess,
  validateEmployeeIdParam
} from "../middleware/employeeAccess.js";
import {
  createEmployee,
  deactivateEmployee,
  getEmployeeById,
  getMyEmployeeProfile,
  listEmployees,
  updateEmployee
} from "../controllers/employeeController.js";

const router = Router();

router.use(requireAuth);
router.get("/me", requireRole("employee"), getMyEmployeeProfile);
router.get("/", requireRole("admin"), listEmployees);
router.post("/", requireRole("admin"), createEmployee);
router.get("/:id", validateEmployeeIdParam, requireEmployeeReadAccess, getEmployeeById);
router.patch("/:id", validateEmployeeIdParam, requireRole("admin"), updateEmployee);
router.delete("/:id", validateEmployeeIdParam, requireRole("admin"), deactivateEmployee);

export default router;
