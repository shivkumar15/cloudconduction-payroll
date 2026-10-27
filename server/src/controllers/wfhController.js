import mongoose from "mongoose";
import { Employee } from "../models/Employee.js";
import { PayrollRun } from "../models/PayrollRun.js";
import { WfhRequest } from "../models/WfhRequest.js";
import { AttendanceRecord } from "../models/AttendanceRecord.js";
import { UnpaidLeaveRequest } from "../models/UnpaidLeaveRequest.js";
import { EmployeeDayReservation } from "../models/EmployeeDayReservation.js";
import {
  createWfhRequestSchema,
  rejectWfhSchema,
  wfhIdSchema,
  wfhListQuerySchema
} from "../validators/wfhSchemas.js";
import { dateOnlyToUtcDate, getAttendancePeriodBounds, getIndiaBusinessDate, isWfhRequestDateAllowed } from "../services/wfhService.js";
import { dateToPayrollPeriod } from "../services/unpaidLeaveService.js";

function respondInvalid(res, message, issues) {
  return res.status(400).json({
    success: false,
    message,
    errors: issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
  });
}

function respondRequest(request) {
  return request.toPublicJSON();
}

function isValidRequestId(id) {
  return wfhIdSchema.safeParse(id).success && mongoose.isValidObjectId(id);
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

async function releaseReservation(request) {
  await EmployeeDayReservation.deleteOne({
    employeeId: request.employeeId,
    date: request.date,
    kind: "wfh",
    requestId: request._id
  });
}

export async function createMyWfhRequest(req, res, next) {
  const parsed = createWfhRequestSchema.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, "Invalid WFH request", parsed.error.issues);
  if (!req.authUser.employeeId) {
    return res.status(404).json({ success: false, message: "No employee profile is linked to this account" });
  }

  const { date, reason } = parsed.data;
  const period = periodForDate(date);
  const dateValue = dateOnlyToUtcDate(date);

  try {
    const employee = await Employee.findById(req.authUser.employeeId);
    if (!employee || employee.employmentStatus !== "active") {
      return res.status(404).json({ success: false, message: "Active employee profile not found" });
    }

    if (!isWfhRequestDateAllowed(date, getIndiaBusinessDate())) {
      return res.status(400).json({
        success: false,
        code: "WFH_DATE_OUT_OF_RANGE",
        message: "WFH can be requested for today or a date within the next 90 days"
      });
    }

    const startDate = effectiveStartDate(employee);
    if (startDate && date < startDate) {
      return res.status(400).json({ success: false, message: "WFH cannot be requested before the employment start date" });
    }

    if (await periodIsLocked(period)) {
      return res.status(409).json({
        success: false,
        code: "PAYROLL_PERIOD_LOCKED",
        message: "A payroll run already exists for this month; no new WFH requests can be created for the period"
      });
    }

    const existingLeave = await UnpaidLeaveRequest.exists({
      employeeId: employee._id,
      date: dateValue,
      status: { $in: ["pending", "approved"] }
    });
    if (existingLeave) {
      return res.status(409).json({
        success: false,
        code: "EMPLOYEE_DATE_ALREADY_RESERVED",
        message: "This date already has a pending or approved unpaid-leave request"
      });
    }

    // The shared unique registry blocks a pending/approved unpaid-leave request
    // from being created for the same employee/date, including concurrent requests.
    const request = new WfhRequest({
      employeeId: employee._id,
      date: dateValue,
      reason,
      status: "pending",
      requestedBy: req.authUser._id
    });

    await EmployeeDayReservation.create({
      employeeId: employee._id,
      date: dateValue,
      kind: "wfh",
      requestId: request._id
    });

    try {
      await request.save();
    } catch (saveError) {
      await releaseReservation(request);
      throw saveError;
    }

    if (await periodIsLocked(period)) {
      await Promise.all([
        WfhRequest.deleteOne({ _id: request._id, status: "pending" }),
        releaseReservation(request)
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

export async function listMyWfhRequests(req, res, next) {
  if (!req.authUser.employeeId) {
    return res.status(404).json({ success: false, message: "No employee profile is linked to this account" });
  }
  try {
    const rows = await WfhRequest.find({ employeeId: req.authUser.employeeId })
      .sort({ date: -1, createdAt: -1 })
      .limit(100);
    return res.status(200).json({ success: true, data: rows.map(respondRequest), businessDate: getIndiaBusinessDate() });
  } catch (error) {
    return next(error);
  }
}

export async function listWfhRequests(req, res, next) {
  const parsed = wfhListQuerySchema.safeParse(req.query);
  if (!parsed.success) return respondInvalid(res, "Invalid WFH filters", parsed.error.issues);

  try {
    const { page, pageSize, period, status } = parsed.data;
    const filter = {};
    if (status) filter.status = status;
    if (period) {
      const bounds = getAttendancePeriodBounds(period);
      filter.date = { $gte: bounds.start, $lt: bounds.end };
    }
    const [rows, total] = await Promise.all([
      WfhRequest.find(filter)
        .populate("employeeId", "employeeCode firstName lastName department")
        .sort({ date: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      WfhRequest.countDocuments(filter)
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

async function decideWfhRequest(req, res, next, decision) {
  if (!isValidRequestId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid WFH request ID" });
  }

  let decisionNote = "";
  if (decision === "rejected") {
    const parsed = rejectWfhSchema.safeParse(req.body || {});
    if (!parsed.success) return respondInvalid(res, "A rejection reason of 3–240 characters is required", parsed.error.issues);
    decisionNote = parsed.data.decisionNote;
  } else if (req.body && Object.keys(req.body).length > 0) {
    return respondInvalid(res, "Approval does not accept client-controlled decision fields", [{
      path: [],
      message: "Send an empty JSON body"
    }]);
  }

  try {
    const current = await WfhRequest.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: "WFH request not found" });
    if (current.status !== "pending") {
      return res.status(409).json({ success: false, message: "Only pending WFH requests can be decided" });
    }

    const period = dateToPayrollPeriod(current.date);
    if (await periodIsLocked(period)) {
      return res.status(409).json({
        success: false,
        code: "PAYROLL_PERIOD_LOCKED",
        message: "A payroll run already exists for this month; the WFH request is locked"
      });
    }

    const reservation = await EmployeeDayReservation.findOne({
      employeeId: current.employeeId,
      date: current.date,
      kind: "wfh",
      requestId: current._id
    });
    if (!reservation) {
      return res.status(409).json({
        success: false,
        code: "EMPLOYEE_DATE_RESERVATION_MISSING",
        message: "This request has no active day reservation; ask an administrator to review it"
      });
    }

    if (decision === "approved") {
      const employee = await Employee.findById(current.employeeId);
      if (!employee || employee.employmentStatus !== "active") {
        return res.status(409).json({ success: false, message: "Only active employees can have WFH approved" });
      }
      const dateOnly = current.date.toISOString().slice(0, 10);
      if (!isWfhRequestDateAllowed(dateOnly, getIndiaBusinessDate())) {
        return res.status(409).json({
          success: false,
          message: "WFH must be approved on or before its date and within the 90-day request window"
        });
      }
      const startDate = effectiveStartDate(employee);
      if (startDate && dateOnly < startDate) {
        return res.status(409).json({ success: false, message: "WFH date is before the employee's start date" });
      }
      const existingLeave = await UnpaidLeaveRequest.exists({
        employeeId: current.employeeId,
        date: current.date,
        status: { $in: ["pending", "approved"] }
      });
      if (existingLeave) {
        return res.status(409).json({
          success: false,
          code: "EMPLOYEE_DATE_ALREADY_RESERVED",
          message: "This date has a pending or approved unpaid-leave request"
        });
      }
      if (await AttendanceRecord.exists({ wfhRequestId: current._id })) {
        return res.status(409).json({ success: false, message: "WFH request already has attendance; approval cannot be changed" });
      }
    }

    const updated = await WfhRequest.findOneAndUpdate(
      { _id: current._id, status: "pending" },
      { $set: { status: decision, decidedBy: req.authUser._id, decidedAt: new Date(), decisionNote } },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(409).json({ success: false, message: "Request status changed; refresh and retry" });
    }

    if (await periodIsLocked(period)) {
      await WfhRequest.updateOne(
        { _id: updated._id, status: decision, decidedBy: req.authUser._id },
        { $set: { status: "pending", decidedBy: null, decidedAt: null, decisionNote: "" } }
      );
      return res.status(409).json({
        success: false,
        code: "PAYROLL_PERIOD_LOCKED",
        message: "Payroll was created while this request was being decided. Refresh; the request remains pending."
      });
    }

    if (decision === "rejected") await releaseReservation(updated);
    return res.status(200).json({ success: true, data: respondRequest(updated) });
  } catch (error) {
    return next(error);
  }
}

export async function approveWfhRequest(req, res, next) {
  return decideWfhRequest(req, res, next, "approved");
}

export async function rejectWfhRequest(req, res, next) {
  return decideWfhRequest(req, res, next, "rejected");
}
