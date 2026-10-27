import mongoose from "mongoose";
import { Employee } from "../models/Employee.js";
import { PayrollRun } from "../models/PayrollRun.js";
import { UnpaidLeaveRequest } from "../models/UnpaidLeaveRequest.js";
import { EmployeeDayReservation } from "../models/EmployeeDayReservation.js";
import { WfhRequest } from "../models/WfhRequest.js";
import {
  createUnpaidLeaveRequestSchema,
  rejectUnpaidLeaveSchema,
  unpaidLeaveIdSchema,
  unpaidLeaveListQuerySchema
} from "../validators/unpaidLeaveSchemas.js";
import { dateToPayrollPeriod, getPayrollPeriodBounds } from "../services/unpaidLeaveService.js";

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

function respondRequest(request) {
  return request.toPublicJSON();
}

function isValidRequestId(id) {
  return unpaidLeaveIdSchema.safeParse(id).success && mongoose.isValidObjectId(id);
}

function periodForDate(dateOnly) {
  return dateOnly.slice(0, 7);
}

async function periodIsLocked(period) {
  return Boolean(await PayrollRun.exists({ period }));
}

function effectiveStartDate(employee) {
  const value = employee.employmentStartDate || employee.createdAt;
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString().slice(0, 10)
    : null;
}

export async function createMyUnpaidLeaveRequest(req, res, next) {
  const parsed = createUnpaidLeaveRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return respondInvalid(res, "Invalid unpaid-leave request", parsed.error.issues);
  }

  if (!req.authUser.employeeId) {
    return res.status(404).json({ success: false, message: "No employee profile is linked to this account" });
  }

  const { date, reason } = parsed.data;
  const period = periodForDate(date);

  try {
    const employee = await Employee.findById(req.authUser.employeeId);
    if (!employee || employee.employmentStatus !== "active") {
      return res.status(404).json({ success: false, message: "Active employee profile not found" });
    }

    const startDate = effectiveStartDate(employee);
    if (startDate && date < startDate) {
      return res.status(400).json({
        success: false,
        message: "Unpaid leave cannot be requested before the employment start date"
      });
    }

    const existingWfh = await WfhRequest.exists({
      employeeId: employee._id,
      date: new Date(date + "T00:00:00.000Z"),
      status: { $in: ["pending", "approved"] }
    });
    if (existingWfh) {
      return res.status(409).json({
        success: false,
        code: "EMPLOYEE_DATE_ALREADY_RESERVED",
        message: "This date already has a pending or approved WFH request"
      });
    }

    if (await periodIsLocked(period)) {
      return res.status(409).json({
        success: false,
        code: "PAYROLL_PERIOD_LOCKED",
        message: "A payroll run already exists for this month. Contact the payroll administrator to resolve a correction."
      });
    }

    const dateValue = new Date(date + "T00:00:00.000Z");
    const request = new UnpaidLeaveRequest({
      employeeId: employee._id,
      date: dateValue,
      reason,
      status: "pending",
      requestedBy: req.authUser._id
    });

    // Reserve the employee/date before saving the request. This unique registry
    // prevents competing WFH and unpaid-leave requests for the same day.
    await EmployeeDayReservation.create({
      employeeId: employee._id,
      date: dateValue,
      kind: "unpaid_leave",
      requestId: request._id
    });

    try {
      await request.save();
    } catch (saveError) {
      await EmployeeDayReservation.deleteOne({
        employeeId: employee._id,
        date: dateValue,
        kind: "unpaid_leave",
        requestId: request._id
      });
      throw saveError;
    }

    // Close the check/write race with payroll-run creation. If the period became
    // locked during insertion, remove both the still-pending request and reservation.
    if (await periodIsLocked(period)) {
      await Promise.all([
        UnpaidLeaveRequest.deleteOne({ _id: request._id, status: "pending" }),
        EmployeeDayReservation.deleteOne({
          employeeId: employee._id,
          date: dateValue,
          kind: "unpaid_leave",
          requestId: request._id
        })
      ]);
      return res.status(409).json({
        success: false,
        code: "PAYROLL_PERIOD_LOCKED",
        message: "A payroll run was created while this request was submitted. Refresh and try another period."
      });
    }

    return res.status(201).json({ success: true, data: respondRequest(request) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        code: "EMPLOYEE_DATE_ALREADY_RESERVED",
        message: "A leave or WFH request already exists for this employee and date"
      });
    }
    return next(error);
  }
}

export async function listMyUnpaidLeaveRequests(req, res, next) {
  if (!req.authUser.employeeId) {
    return res.status(404).json({ success: false, message: "No employee profile is linked to this account" });
  }

  try {
    const rows = await UnpaidLeaveRequest.find({ employeeId: req.authUser.employeeId })
      .sort({ date: -1, createdAt: -1 })
      .limit(100);
    return res.status(200).json({ success: true, data: rows.map(respondRequest) });
  } catch (error) {
    return next(error);
  }
}

export async function listUnpaidLeaveRequests(req, res, next) {
  const parsed = unpaidLeaveListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return respondInvalid(res, "Invalid unpaid-leave filters", parsed.error.issues);
  }

  try {
    const { page, pageSize, period, status } = parsed.data;
    const filter = {};
    if (status) filter.status = status;
    if (period) {
      const bounds = getPayrollPeriodBounds(period);
      filter.date = { $gte: bounds.start, $lt: bounds.end };
    }

    const [rows, total] = await Promise.all([
      UnpaidLeaveRequest.find(filter)
        .populate("employeeId", "employeeCode firstName lastName department")
        .sort({ date: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      UnpaidLeaveRequest.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: rows.map(respondRequest),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (error) {
    return next(error);
  }
}

async function decideRequest(req, res, next, decision) {
  if (!isValidRequestId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid unpaid-leave request ID" });
  }

  let decisionNote = "";
  if (decision === "rejected") {
    const parsed = rejectUnpaidLeaveSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return respondInvalid(res, "A rejection reason of 3–240 characters is required", parsed.error.issues);
    }
    decisionNote = parsed.data.decisionNote;
  } else if (req.body && Object.keys(req.body).length > 0) {
    return respondInvalid(res, "Approval does not accept client-controlled decision fields", [{
      path: [],
      message: "Send an empty JSON body"
    }]);
  }

  try {
    const current = await UnpaidLeaveRequest.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ success: false, message: "Unpaid-leave request not found" });
    }
    if (current.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Only pending unpaid-leave requests can be decided"
      });
    }

    const period = dateToPayrollPeriod(current.date);
    const reservation = await EmployeeDayReservation.findOne({
      employeeId: current.employeeId,
      date: current.date,
      kind: "unpaid_leave",
      requestId: current._id
    });
    if (!reservation) {
      return res.status(409).json({
        success: false,
        code: "EMPLOYEE_DATE_RESERVATION_MISSING",
        message: "This request has no active day reservation; ask an administrator to review it before deciding."
      });
    }
    if (await periodIsLocked(period)) {
      return res.status(409).json({
        success: false,
        code: "PAYROLL_PERIOD_LOCKED",
        message: "A payroll run already exists for this month; the request cannot be changed without a formal correction workflow"
      });
    }

    if (decision === "approved") {
      const existingWfh = await WfhRequest.exists({
        employeeId: current.employeeId,
        date: current.date,
        status: { $in: ["pending", "approved"] }
      });
      if (existingWfh) {
        return res.status(409).json({
          success: false,
          code: "EMPLOYEE_DATE_ALREADY_RESERVED",
          message: "This date has a pending or approved WFH request"
        });
      }
      const employee = await Employee.findById(current.employeeId);
      if (!employee || employee.employmentStatus !== "active") {
        return res.status(409).json({ success: false, message: "Only active employees can have unpaid leave approved" });
      }
      const startDate = effectiveStartDate(employee);
      if (startDate && current.date.toISOString().slice(0, 10) < startDate) {
        return res.status(409).json({ success: false, message: "Leave date is before the employee's start date" });
      }
    }

    const updated = await UnpaidLeaveRequest.findOneAndUpdate(
      { _id: current._id, status: "pending" },
      {
        $set: {
          status: decision,
          decidedBy: req.authUser._id,
          decidedAt: new Date(),
          decisionNote
        }
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(409).json({ success: false, message: "Request status changed; refresh and retry" });
    }

    // Re-check the period after the write. If a payroll run was created concurrently,
    // revert only this still-unconsumed decision and fail closed.
    if (await periodIsLocked(period)) {
      await UnpaidLeaveRequest.updateOne(
        { _id: updated._id, status: decision, decidedBy: req.authUser._id },
        { $set: { status: "pending", decidedBy: null, decidedAt: null, decisionNote: "" } }
      );
      return res.status(409).json({
        success: false,
        code: "PAYROLL_PERIOD_LOCKED",
        message: "Payroll was created while this request was being decided. Refresh; the request was not approved/rejected."
      });
    }

    if (decision === "rejected") {
      await EmployeeDayReservation.deleteOne({
        employeeId: updated.employeeId,
        date: updated.date,
        kind: "unpaid_leave",
        requestId: updated._id
      });
    }

    return res.status(200).json({ success: true, data: respondRequest(updated) });
  } catch (error) {
    return next(error);
  }
}

export async function approveUnpaidLeaveRequest(req, res, next) {
  return decideRequest(req, res, next, "approved");
}

export async function rejectUnpaidLeaveRequest(req, res, next) {
  return decideRequest(req, res, next, "rejected");
}
