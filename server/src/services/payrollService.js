import { calculateSalaryAmounts } from "../utils/money.js";
import { calculateUnpaidLeaveDeductionPaise, getWorkingDaysInPeriod } from "./unpaidLeaveService.js";

function addSafeAmounts(left, right, label) {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(label + " exceeds the safe integer range");
  }
  return total;
}

export function getPayrollEligibilityFilter(period) {
  if (typeof period !== "string" || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(period)) {
    throw new TypeError("A valid YYYY-MM payroll period is required");
  }

  const [year, month] = period.split("-").map(Number);
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return {
    employmentStatus: "active",
    $or: [
      { employmentStartDate: { $lte: periodEnd } },
      { employmentStartDate: { $exists: false }, createdAt: { $lte: periodEnd } }
    ]
  };
}

function employeeLeaveDays(employee, unpaidLeaveDaysByEmployeeId) {
  const id = employee._id.toString();
  const days = unpaidLeaveDaysByEmployeeId instanceof Map
    ? unpaidLeaveDaysByEmployeeId.get(id) || 0
    : unpaidLeaveDaysByEmployeeId?.[id] || 0;

  if (!Number.isSafeInteger(days) || days < 0) {
    throw new RangeError("Approved unpaid-leave day count must be a safe non-negative integer");
  }
  return days;
}

export function calculatePayrollItem(employee, options = {}) {
  if (!employee || !employee._id) {
    throw new TypeError("An employee record with an ID is required");
  }
  if (employee.employmentStatus !== "active") {
    throw new RangeError("Only active employees can be included in payroll");
  }

  const salary = calculateSalaryAmounts(employee.salaryStructure);
  const fixedMonthlyDeductionsPaise = salary.monthlyDeductionsPaise;
  const unpaidLeaveDays = employeeLeaveDays(employee, options.unpaidLeaveDaysByEmployeeId);
  const unpaidLeaveDeductionPaise = unpaidLeaveDays === 0
    ? 0
    : calculateUnpaidLeaveDeductionPaise({
      monthlyGrossPayPaise: salary.grossPayPaise,
      unpaidLeaveDays,
      period: options.period
    });
  const monthlyDeductionsPaise = addSafeAmounts(
    fixedMonthlyDeductionsPaise,
    unpaidLeaveDeductionPaise,
    "Combined deductions"
  );

  if (monthlyDeductionsPaise > salary.grossPayPaise) {
    throw new RangeError(
      "Combined fixed and unpaid-leave deductions exceed gross pay for employee " + employee.employeeCode
    );
  }

  return {
    employeeId: employee._id,
    employeeCode: employee.employeeCode,
    employeeName: [employee.firstName, employee.lastName].filter(Boolean).join(" "),
    department: employee.department,
    designation: employee.designation,
    currency: employee.currency || "INR",
    baseSalaryPaise: salary.baseSalaryPaise,
    monthlyAllowancesPaise: salary.monthlyAllowancesPaise,
    grossPayPaise: salary.grossPayPaise,
    fixedMonthlyDeductionsPaise,
    unpaidLeaveDays,
    unpaidLeaveDeductionPaise,
    monthlyDeductionsPaise,
    netPayPaise: salary.grossPayPaise - monthlyDeductionsPaise
  };
}

export function buildPayrollSnapshot(employees, options = {}) {
  if (!Array.isArray(employees)) {
    throw new TypeError("Employees must be supplied as an array");
  }

  if (options.period && options.unpaidLeaveDaysByEmployeeId) {
    const maximumDays = getWorkingDaysInPeriod(options.period);
    for (const days of options.unpaidLeaveDaysByEmployeeId.values?.() || []) {
      if (days > maximumDays) {
        throw new RangeError("Unpaid-leave days cannot exceed the working days in the payroll month");
      }
    }
  }

  const activeEmployees = employees
    .filter((employee) => employee.employmentStatus === "active")
    .slice()
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  const items = activeEmployees.map((employee) => calculatePayrollItem(employee, options));
  const totals = items.reduce((accumulator, item) => ({
    totalGrossPayPaise: addSafeAmounts(
      accumulator.totalGrossPayPaise,
      item.grossPayPaise,
      "Total gross pay"
    ),
    totalDeductionsPaise: addSafeAmounts(
      accumulator.totalDeductionsPaise,
      item.monthlyDeductionsPaise,
      "Total deductions"
    ),
    totalNetPayPaise: addSafeAmounts(
      accumulator.totalNetPayPaise,
      item.netPayPaise,
      "Total net pay"
    )
  }), {
    totalGrossPayPaise: 0,
    totalDeductionsPaise: 0,
    totalNetPayPaise: 0
  });

  return {
    currency: "INR",
    employeeCount: items.length,
    items,
    ...totals
  };
}

const PAYROLL_TRANSITIONS = Object.freeze({
  approve: Object.freeze({ from: "draft", to: "approved" }),
  finalize: Object.freeze({ from: "approved", to: "finalized" })
});

export function getPayrollTransition(currentStatus, action) {
  const transition = PAYROLL_TRANSITIONS[action];
  if (!transition || transition.from !== currentStatus) return null;
  return transition;
}
