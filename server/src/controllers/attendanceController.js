import mongoose from "mongoose";
import { AttendanceRecord } from "../models/AttendanceRecord.js";
import { Employee } from "../models/Employee.js";
import { EmployeeDayReservation } from "../models/EmployeeDayReservation.js";
import { PayrollRun } from "../models/PayrollRun.js";
import { UnpaidLeaveRequest } from "../models/UnpaidLeaveRequest.js";
import { WfhRequest } from "../models/WfhRequest.js";
import {
  attendanceIdSchema,
  attendanceListQuerySchema,
  attendancePunchBodySchema,
  correctAttendanceCheckoutSchema
} from "../validators/wfhSchemas.js";
import { dateOnlyToUtcDate, getAttendancePeriodBounds, getIndiaBusinessDate } from "../services/wfhService.js";

function respondInvalid(res, message, issues) {
  return res.status(400).json({
    success: false,
    message,
    errors: issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
  });
}

function respondAttendance(record) {
  return record.toPublicJSON();
}

async function getActiveEmployee(req, res) {
  if (!req.authUser.employeeId) {
    res.status(404).json({ success: false, message: "No employee profile is linked to this account" });
    return null;
  }
  const employee = await Employee.findById(req.authUser.employeeId);
  if (!employee || employee.employmentStatus !== "active") {
    res.status(404).json({ success: false, message: "Active employee profile not found" });
    return null;
  }
  return employee;
}

export async function checkInWfhAttendance(req, res, next) {
  const parsed = attendancePunchBodySchema.safeParse(req.body || {});
  if (!parsed.success) return respondInvalid(res, "Check-in does not accept client-controlled timestamps or fields", parsed.error.issues);

  try {
    const employee = await getActiveEmployee(req, res);
    if (!employee) return;
    const businessDate = getIndiaBusinessDate();
    const date = dateOnlyToUtcDate(businessDate);
    const period = businessDate.slice(0, 7);

    // Attendance is a non-financial record. An already approved WFH day can still
    // be recorded after payroll snapshot creation; attendance never rewrites pay.

    const request = await WfhRequest.findOne({ employeeId: employee._id, date, status: "approved" });
    if (!request) {
      return res.status(409).json({
        success: false,
        code: "APPROVED_WFH_REQUIRED",
        message: "You need an approved WFH request for today before checking in"
      });
    }

    const reservation = await EmployeeDayReservation.findOne({
      employeeId: employee._id,
      date,
      kind: "wfh",
      requestId: request._id
    });
    const unpaidLeaveConflict = await UnpaidLeaveRequest.exists({
      employeeId: employee._id,
      date,
      status: { $in: ["pending", "approved"] }
    });
    if (!reservation || unpaidLeaveConflict) {
      return res.status(409).json({
        success: false,
        code: "ATTENDANCE_DAY_NOT_RESERVED",
        message: "This date is not exclusively reserved for approved WFH"
      });
    }

    const checkedInAt = new Date();
    let record;
    try {
      record = await AttendanceRecord.create({
        employeeId: employee._id,
        date,
        mode: "wfh",
        wfhRequestId: request._id,
        checkedInAt,
        checkedOutAt: null
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          code: "ATTENDANCE_ALREADY_RECORDED",
          message: "Attendance has already been recorded for today"
        });
      }
      throw error;
    }

    // If payroll won the concurrent lock race, remove only the unclosed punch we
    // just inserted and fail closed rather than leave a post-snapshot attendance.
    if (await PayrollRun.exists({ period })) {
      await AttendanceRecord.deleteOne({
        _id: record._id,
        employeeId: employee._id,
        checkedInAt,
        checkedOutAt: null
      });
      return res.status(409).json({
        success: false,
        code: "PAYROLL_PERIOD_LOCKED",
        message: "Payroll was created while checking in. No attendance record was retained."
      });
    }

    return res.status(201).json({
      success: true,
      businessDate,
      message: "WFH check-in recorded by the server.",
      data: respondAttendance(record)
    });
  } catch (error) {
    return next(error);
  }
}

export async function checkOutWfhAttendance(req, res, next) {
  const parsed = attendancePunchBodySchema.safeParse(req.body || {});
  if (!parsed.success) return respondInvalid(res, "Check-out does not accept client-controlled timestamps or fields", parsed.error.issues);

  try {
    const employee = await getActiveEmployee(req, res);
    if (!employee) return;
    const businessDate = getIndiaBusinessDate();
    const date = dateOnlyToUtcDate(businessDate);
    const request = await WfhRequest.findOne({ employeeId: employee._id, date, status: "approved" });
    if (!request) {
      return res.status(409).json({
        success: false,
        code: "APPROVED_WFH_REQUIRED",
        message: "An approved WFH request for today is required to check out"
      });
    }

    const checkedOutAt = new Date();
    const updated = await AttendanceRecord.findOneAndUpdate(
      {
        employeeId: employee._id,
        date,
        wfhRequestId: request._id,
        checkedInAt: { $ne: null },
        checkedOutAt: null
      },
      { $set: { checkedOutAt } },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(409).json({
        success: false,
        code: "CHECK_IN_REQUIRED",
        message: "A check-in for today is required before checking out; repeated check-out is not allowed"
      });
    }

    return res.status(200).json({
      success: true,
      businessDate,
      message: "WFH check-out recorded by the server.",
      data: respondAttendance(updated)
    });
  } catch (error) {
    return next(error);
  }
}

export async function correctAttendanceCheckout(req, res, next) {
  if (!attendanceIdSchema.safeParse(req.params.id).success || !mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid attendance record ID" });
  }
  const parsed = correctAttendanceCheckoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return respondInvalid(res, "Invalid attendance correction", parsed.error.issues);
  }

  try {
    const record = await AttendanceRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "Attendance record not found" });
    if (record.checkedOutAt) {
      return res.status(409).json({ success: false, message: "Attendance already has a check-out and cannot be corrected again" });
    }

    const correctedCheckout = new Date(parsed.data.checkedOutAt);
    const now = new Date();
    if (correctedCheckout <= record.checkedInAt || correctedCheckout > now) {
      return res.status(400).json({
        success: false,
        message: "Corrected check-out must be after check-in and cannot be in the future"
      });
    }
    const checkInDate = record.date.toISOString().slice(0, 10);
    if (getIndiaBusinessDate(correctedCheckout) !== checkInDate) {
      return res.status(400).json({
        success: false,
        message: "Corrected check-out must fall on the same India business date as the original check-in"
      });
    }

    const correctedAt = now;
    const updated = await AttendanceRecord.findOneAndUpdate(
      { _id: record._id, checkedOutAt: null },
      {
        $set: {
          checkedOutAt: correctedCheckout,
          correctedBy: req.authUser._id,
          correctedAt,
          correctionNote: parsed.data.reason
        }
      },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(409).json({ success: false, message: "Attendance was updated concurrently; refresh and try again" });
    }

    return res.status(200).json({
      success: true,
      message: "Attendance check-out corrected with an audit record.",
      data: respondAttendance(updated)
    });
  } catch (error) {
    return next(error);
  }
}

export async function listMyAttendance(req, res, next) {
  try {
    const employee = await getActiveEmployee(req, res);
    if (!employee) return;
    const parsed = attendanceListQuerySchema.safeParse(req.query);
    if (!parsed.success) return respondInvalid(res, "Invalid attendance filters", parsed.error.issues);

    const period = parsed.data.period || getIndiaBusinessDate().slice(0, 7);
    const bounds = getAttendancePeriodBounds(period);
    const filter = { employeeId: employee._id, date: { $gte: bounds.start, $lt: bounds.end } };
    if (parsed.data.status === "completed") filter.checkedOutAt = { $ne: null };
    if (parsed.data.status === "checked_in") filter.checkedOutAt = null;

    const records = await AttendanceRecord.find(filter).sort({ date: -1, createdAt: -1 }).limit(100);
    return res.status(200).json({
      success: true,
      businessDate: getIndiaBusinessDate(),
      data: records.map(respondAttendance)
    });
  } catch (error) {
    return next(error);
  }
}

export async function listAttendance(req, res, next) {
  const parsed = attendanceListQuerySchema.safeParse(req.query);
  if (!parsed.success) return respondInvalid(res, "Invalid attendance filters", parsed.error.issues);

  try {
    const period = parsed.data.period || getIndiaBusinessDate().slice(0, 7);
    const bounds = getAttendancePeriodBounds(period);
    const filter = { date: { $gte: bounds.start, $lt: bounds.end } };
    if (parsed.data.status === "completed") filter.checkedOutAt = { $ne: null };
    if (parsed.data.status === "checked_in") filter.checkedOutAt = null;
    const [records, total] = await Promise.all([
      AttendanceRecord.find(filter)
        .populate("employeeId", "employeeCode firstName lastName department")
        .sort({ date: -1, createdAt: -1, _id: -1 })
        .skip((parsed.data.page - 1) * parsed.data.pageSize)
        .limit(parsed.data.pageSize),
      AttendanceRecord.countDocuments(filter)
    ]);
    return res.status(200).json({
      success: true,
      businessDate: getIndiaBusinessDate(),
      data: records.map((record) => ({
        ...respondAttendance(record),
        employee: record.employeeId && record.employeeId._id ? {
          id: record.employeeId._id.toString(),
          employeeCode: record.employeeId.employeeCode,
          firstName: record.employeeId.firstName,
          lastName: record.employeeId.lastName,
          department: record.employeeId.department
        } : undefined
      })),
      pagination: { page: parsed.data.page, pageSize: parsed.data.pageSize, total, totalPages: Math.ceil(total / parsed.data.pageSize) }
    });
  } catch (error) {
    return next(error);
  }
}
