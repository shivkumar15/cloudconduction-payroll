import { calculateSalaryAmounts } from "../utils/money.js";

function addSafeAmounts(left, right, label) {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(label + " exceeds the safe integer range");
  }
  return total;
}

export function calculatePayrollItem(employee) {
  if (!employee || !employee._id) {
    throw new TypeError("An employee record with an ID is required");
  }
  if (employee.employmentStatus !== "active") {
    throw new RangeError("Only active employees can be included in payroll");
  }

  const amounts = calculateSalaryAmounts(employee.salaryStructure);
  return {
    employeeId: employee._id,
    employeeCode: employee.employeeCode,
    employeeName: [employee.firstName, employee.lastName].filter(Boolean).join(" "),
    department: employee.department,
    designation: employee.designation,
    currency: employee.currency || "INR",
    ...amounts
  };
}

export function buildPayrollSnapshot(employees) {
  if (!Array.isArray(employees)) {
    throw new TypeError("Employees must be supplied as an array");
  }

  const activeEmployees = employees
    .filter((employee) => employee.employmentStatus === "active")
    .slice()
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  const items = activeEmployees.map(calculatePayrollItem);
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
