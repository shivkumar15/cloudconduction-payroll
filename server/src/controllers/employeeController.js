import { Employee } from "../models/Employee.js";
import { User } from "../models/User.js";
import {
  createEmployeeSchema,
  employeeListQuerySchema,
  updateEmployeeSchema
} from "../validators/employeeSchemas.js";

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

function respondDuplicate(error, res, next) {
  if (error?.code === 11000) {
    const key = Object.keys(error.keyPattern || {})[0];
    const fieldMessage = key === "employeeCode"
      ? "Employee code is already in use"
      : key === "workEmail" || key === "email"
        ? "Work email is already in use"
        : "A record with these unique details already exists";
    return res.status(409).json({ success: false, message: fieldMessage });
  }
  return next(error);
}

function escapeRegex(value) {
  const special = "\\^$.*+?()[]{}|";
  return value.split("").map((character) => (
    special.includes(character) ? "\\" + character : character
  )).join("");
}

function serializeEmployee(employee) {
  if (typeof employee?.toPublicJSON === "function") return employee.toPublicJSON();

  return {
    id: employee._id.toString(),
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    workEmail: employee.workEmail,
    currency: employee.currency,
    department: employee.department,
    designation: employee.designation,
    salaryStructure: {
      baseSalaryPaise: employee.salaryStructure.baseSalaryPaise,
      monthlyAllowancesPaise: employee.salaryStructure.monthlyAllowancesPaise,
      monthlyDeductionsPaise: employee.salaryStructure.monthlyDeductionsPaise
    },
    employmentStatus: employee.employmentStatus,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt
  };
}

export async function listEmployees(req, res, next) {
  const parsed = employeeListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return respondInvalid(res, "Invalid employee filters", parsed.error.issues);
  }

  try {
    const { page, pageSize, q, department, employmentStatus } = parsed.data;
    const filter = {};

    if (q) {
      const escaped = escapeRegex(q);
      filter.$or = [
        { employeeCode: { $regex: escaped, $options: "i" } },
        { firstName: { $regex: escaped, $options: "i" } },
        { lastName: { $regex: escaped, $options: "i" } },
        { workEmail: { $regex: escaped, $options: "i" } }
      ];
    }
    if (department) {
      filter.department = { $regex: "^" + escapeRegex(department) + "$", $options: "i" };
    }
    if (employmentStatus) filter.employmentStatus = employmentStatus;

    const [rows, total] = await Promise.all([
      Employee.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Employee.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: rows.map(serializeEmployee),
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

export async function createEmployee(req, res, next) {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return respondInvalid(res, "Invalid employee data", parsed.error.issues);
  }

  const { initialPassword, ...employeeData } = parsed.data;
  let employee;

  try {
    const [existingEmployee, existingUser] = await Promise.all([
      Employee.findOne({
        $or: [
          { employeeCode: employeeData.employeeCode },
          { workEmail: employeeData.workEmail }
        ]
      }).select("_id"),
      User.findOne({ email: employeeData.workEmail }).select("_id")
    ]);

    if (existingEmployee) {
      return res.status(409).json({
        success: false,
        message: "Employee code or work email is already in use"
      });
    }
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this work email already exists"
      });
    }

    employee = await Employee.create(employeeData);
    try {
      const passwordHash = await User.hashPassword(initialPassword);
      await User.create({
        email: employeeData.workEmail,
        passwordHash,
        role: "employee",
        employeeId: employee._id,
        isActive: true,
        mustChangePassword: true
      });
    } catch (error) {
      await Employee.deleteOne({ _id: employee._id });
      throw error;
    }

    return res.status(201).json({
      success: true,
      data: serializeEmployee(employee)
    });
  } catch (error) {
    return respondDuplicate(error, res, next);
  }
}

export async function getEmployeeById(req, res, next) {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    return res.status(200).json({ success: true, data: serializeEmployee(employee) });
  } catch (error) {
    return next(error);
  }
}

export async function getMyEmployeeProfile(req, res, next) {
  try {
    if (!req.authUser.employeeId) {
      return res.status(404).json({
        success: false,
        message: "No employee profile is linked to this account"
      });
    }

    const employee = await Employee.findById(req.authUser.employeeId);
    if (!employee || employee.employmentStatus !== "active") {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found"
      });
    }
    return res.status(200).json({ success: true, data: serializeEmployee(employee) });
  } catch (error) {
    return next(error);
  }
}

async function applyEmploymentStatus(employee, nextStatus) {
  const previousStatus = employee.employmentStatus;
  if (previousStatus === nextStatus) return;

  // Invalidate existing sessions whenever employment access is changed.
  const userUpdate = await User.updateOne(
    { employeeId: employee._id },
    { $set: { isActive: nextStatus === "active" }, $inc: { tokenVersion: 1 } }
  );

  if (userUpdate.matchedCount !== 1) {
    const error = new Error("Linked employee login account was not found");
    error.status = 409;
    throw error;
  }

  employee.employmentStatus = nextStatus;
  try {
    await employee.save();
  } catch (error) {
    // Compensate the account-status change if saving the employee record fails.
    await User.updateOne(
      { employeeId: employee._id },
      { $set: { isActive: previousStatus === "active" }, $inc: { tokenVersion: 1 } }
    );
    throw error;
  }
}

export async function updateEmployee(req, res, next) {
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return respondInvalid(res, "Invalid employee update", parsed.error.issues);
  }

  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const updates = parsed.data;
    const requestedStatus = updates.employmentStatus;
    delete updates.employmentStatus;
    Object.assign(employee, updates);

    if (requestedStatus && requestedStatus !== employee.employmentStatus) {
      // Validate changed fields before changing the linked login's access state.
      await employee.validate();
      await applyEmploymentStatus(employee, requestedStatus);
    } else {
      await employee.save();
    }

    return res.status(200).json({ success: true, data: serializeEmployee(employee) });
  } catch (error) {
    return respondDuplicate(error, res, next);
  }
}

export async function deactivateEmployee(req, res, next) {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    await applyEmploymentStatus(employee, "inactive");
    return res.status(200).json({
      success: true,
      message: "Employee deactivated; their login sessions have been invalidated",
      data: serializeEmployee(employee)
    });
  } catch (error) {
    return respondDuplicate(error, res, next);
  }
}
