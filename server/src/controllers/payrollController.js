import mongoose from "mongoose";
import { Employee } from "../models/Employee.js";
import { PayrollRun } from "../models/PayrollRun.js";
import { PayrollTransaction } from "../models/PayrollTransaction.js";
import { UnpaidLeaveRequest } from "../models/UnpaidLeaveRequest.js";
import { getPayrollPeriodBounds } from "../services/unpaidLeaveService.js";
import { buildPayrollSnapshot, getPayrollEligibilityFilter, getPayrollTransition } from "../services/payrollService.js";
import {
  payrollListQuerySchema,
  payrollPeriodBodySchema
} from "../validators/payrollSchemas.js";

function respondInvalid(res, message, issues) {
  return res.status(400).json({
    success: false,
    message,
    errors: issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }))
  });
}

function respondRun(run) {
  return run.toPublicJSON();
}

async function getActiveEmployeeSnapshot(period) {
  return Employee.find(getPayrollEligibilityFilter(period))
    .sort({ employeeCode: 1 })
    .lean();
}

async function getUnpaidLeaveInputs(period, employees) {
  if (employees.length === 0) return { unpaidLeaveDaysByEmployeeId: new Map(), pendingCount: 0 };

  const bounds = getPayrollPeriodBounds(period);
  const filter = {
    employeeId: { $in: employees.map((employee) => employee._id) },
    date: { $gte: bounds.start, $lt: bounds.end }
  };
  const [approvedRequests, pendingCount] = await Promise.all([
    UnpaidLeaveRequest.find({ ...filter, status: "approved" }).select("employeeId date").lean(),
    UnpaidLeaveRequest.countDocuments({ ...filter, status: "pending" })
  ]);

  const unpaidLeaveDaysByEmployeeId = new Map();
  for (const request of approvedRequests) {
    const employeeId = request.employeeId.toString();
    unpaidLeaveDaysByEmployeeId.set(
      employeeId,
      (unpaidLeaveDaysByEmployeeId.get(employeeId) || 0) + 1
    );
  }

  return { unpaidLeaveDaysByEmployeeId, pendingCount };
}

function respondPayrollCalculationConflict(res, error) {
  if (!(error instanceof RangeError)) return null;
  return res.status(409).json({
    success: false,
    code: "PAYROLL_CALCULATION_REQUIRES_REVIEW",
    message: error.message
  });
}

export async function previewPayroll(req, res, next) {
  const parsed = payrollPeriodBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return respondInvalid(res, "Invalid payroll period", parsed.error.issues);
  }

  try {
    const employees = await getActiveEmployeeSnapshot(parsed.data.period);
    if (employees.length === 0) {
      return res.status(409).json({
        success: false,
        message: "No active employees are available for this payroll period"
      });
    }

    const leaveInputs = await getUnpaidLeaveInputs(parsed.data.period, employees);
    const snapshot = buildPayrollSnapshot(employees, {
      period: parsed.data.period,
      unpaidLeaveDaysByEmployeeId: leaveInputs.unpaidLeaveDaysByEmployeeId
    });
    return res.status(200).json({
      success: true,
      data: {
        period: parsed.data.period,
        currency: snapshot.currency,
        employeeCount: snapshot.employeeCount,
        totalGrossPayPaise: snapshot.totalGrossPayPaise,
        totalDeductionsPaise: snapshot.totalDeductionsPaise,
        totalNetPayPaise: snapshot.totalNetPayPaise,
        pendingUnpaidLeaveRequestsCount: leaveInputs.pendingCount,
        canCreateRun: leaveInputs.pendingCount === 0,
        items: snapshot.items.map((item) => ({
          ...item,
          employeeId: item.employeeId.toString()
        }))
      }
    });
  } catch (error) {
    const conflict = respondPayrollCalculationConflict(res, error);
    if (conflict) return conflict;
    return next(error);
  }
}

export async function listPayrollRuns(req, res, next) {
  const parsed = payrollListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return respondInvalid(res, "Invalid payroll filters", parsed.error.issues);
  }

  try {
    const { page, pageSize, period } = parsed.data;
    const filter = period ? { period } : {};
    const [runs, total] = await Promise.all([
      PayrollRun.find(filter)
        .sort({ period: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      PayrollRun.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: runs.map(respondRun),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function createPayrollRun(req, res, next) {
  const parsed = payrollPeriodBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return respondInvalid(res, "Invalid payroll period", parsed.error.issues);
  }

  try {
    const employees = await getActiveEmployeeSnapshot(parsed.data.period);
    if (employees.length === 0) {
      return res.status(409).json({
        success: false,
        message: "No active employees are available for this payroll period"
      });
    }

    const leaveInputs = await getUnpaidLeaveInputs(parsed.data.period, employees);
    if (leaveInputs.pendingCount > 0) {
      return res.status(409).json({
        success: false,
        code: "PENDING_UNPAID_LEAVE_REQUESTS",
        pendingCount: leaveInputs.pendingCount,
        message: "Resolve all pending unpaid-leave requests for this period before creating the payroll run"
      });
    }

    const snapshot = buildPayrollSnapshot(employees, {
      period: parsed.data.period,
      unpaidLeaveDaysByEmployeeId: leaveInputs.unpaidLeaveDaysByEmployeeId
    });
    const run = await PayrollRun.create({
      period: parsed.data.period,
      currency: snapshot.currency,
      status: "draft",
      employeeCount: snapshot.employeeCount,
      totalGrossPayPaise: snapshot.totalGrossPayPaise,
      totalDeductionsPaise: snapshot.totalDeductionsPaise,
      totalNetPayPaise: snapshot.totalNetPayPaise,
      items: snapshot.items,
      createdBy: req.authUser._id
    });

    return res.status(201).json({ success: true, data: respondRun(run) });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.period) {
      return res.status(409).json({
        success: false,
        message: "A payroll run already exists for this period"
      });
    }
    const conflict = respondPayrollCalculationConflict(res, error);
    if (conflict) return conflict;
    return next(error);
  }
}

export async function getPayrollRun(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid payroll run ID" });
    }

    const run = await PayrollRun.findById(req.params.id);
    if (!run) {
      return res.status(404).json({ success: false, message: "Payroll run not found" });
    }

    return res.status(200).json({ success: true, data: respondRun(run) });
  } catch (error) {
    return next(error);
  }
}

async function transitionPayrollRun(req, res, next, action) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid payroll run ID" });
    }

    const run = await PayrollRun.findById(req.params.id);
    if (!run) {
      return res.status(404).json({ success: false, message: "Payroll run not found" });
    }

    const transition = getPayrollTransition(run.status, action);
    if (!transition) {
      return res.status(409).json({
        success: false,
        message: "Payroll run cannot be " + action + " from status " + run.status
      });
    }

    if (action === "finalize") {
      const [transactionCount, succeededCount] = await Promise.all([
        PayrollTransaction.countDocuments({ payrollRunId: run._id }),
        PayrollTransaction.countDocuments({ payrollRunId: run._id, status: "succeeded" })
      ]);
      if (transactionCount !== run.employeeCount || succeededCount !== run.employeeCount) {
        return res.status(409).json({
          success: false,
          code: "SIMULATED_PAYMENTS_INCOMPLETE",
          message: "Every employee payment must have a successful simulation before finalizing payroll"
        });
      }
    }

    const now = new Date();
    const transitionFields = action === "approve"
      ? { approvedAt: now, approvedBy: req.authUser._id }
      : { finalizedAt: now, finalizedBy: req.authUser._id };

    // Conditional status match makes competing or repeated transitions safe.
    const updated = await PayrollRun.findOneAndUpdate(
      { _id: run._id, status: transition.from },
      { $set: { status: transition.to, ...transitionFields } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "Payroll run status changed; refresh and retry"
      });
    }

    return res.status(200).json({ success: true, data: respondRun(updated) });
  } catch (error) {
    return next(error);
  }
}

export async function approvePayrollRun(req, res, next) {
  return transitionPayrollRun(req, res, next, "approve");
}

export async function finalizePayrollRun(req, res, next) {
  return transitionPayrollRun(req, res, next, "finalize");
}

export async function getMyPayroll(req, res, next) {
  try {
    if (!req.authUser.employeeId) {
      return res.status(404).json({
        success: false,
        message: "No employee profile is linked to this account"
      });
    }

    // Draft and approved amounts remain admin-only until the run is finalized.
    const runs = await PayrollRun.find({
      status: "finalized",
      "items.employeeId": req.authUser.employeeId
    }).sort({ period: -1 });

    const data = [];
    for (const run of runs) {
      const item = run.items.find((entry) => entry.employeeId.toString() === req.authUser.employeeId.toString());
      if (!item) continue;
      data.push({
        runId: run._id.toString(),
        period: run.period,
        status: run.status,
        currency: run.currency,
        finalizedAt: run.finalizedAt,
        item: {
          employeeId: item.employeeId.toString(),
          employeeCode: item.employeeCode,
          employeeName: item.employeeName,
          department: item.department,
          designation: item.designation,
          currency: item.currency,
          baseSalaryPaise: item.baseSalaryPaise,
          monthlyAllowancesPaise: item.monthlyAllowancesPaise,
          grossPayPaise: item.grossPayPaise,
          fixedMonthlyDeductionsPaise: Number.isSafeInteger(item.fixedMonthlyDeductionsPaise)
            ? item.fixedMonthlyDeductionsPaise
            : item.monthlyDeductionsPaise,
          unpaidLeaveDays: Number.isSafeInteger(item.unpaidLeaveDays) ? item.unpaidLeaveDays : 0,
          unpaidLeaveDeductionPaise: Number.isSafeInteger(item.unpaidLeaveDeductionPaise)
            ? item.unpaidLeaveDeductionPaise
            : 0,
          monthlyDeductionsPaise: item.monthlyDeductionsPaise,
          netPayPaise: item.netPayPaise
        }
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}
