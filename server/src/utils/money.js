// Monetary values are persisted as integer paise, never floating-point rupees.
export const MAX_SALARY_COMPONENT_PAISE = 10_000_000_000; // ₹10 crore per component.

export function isValidPaise(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_SALARY_COMPONENT_PAISE;
}

/**
 * Demo monthly payroll formula:
 * gross = base salary + monthly allowances
 * net = gross - monthly deductions
 *
 * All values are integer paise. This deliberately does not model tax, EPF,
 * overtime, bonuses, unpaid leave or statutory compliance.
 */
export function calculateSalaryAmounts(salaryStructure) {
  if (!salaryStructure || typeof salaryStructure !== "object") {
    throw new TypeError("Salary structure is required");
  }

  const {
    baseSalaryPaise,
    monthlyAllowancesPaise,
    monthlyDeductionsPaise
  } = salaryStructure;

  if (!isValidPaise(baseSalaryPaise)) {
    throw new RangeError("Base salary must be a safe non-negative integer amount in paise");
  }
  if (!isValidPaise(monthlyAllowancesPaise)) {
    throw new RangeError("Monthly allowances must be a safe non-negative integer amount in paise");
  }
  if (!isValidPaise(monthlyDeductionsPaise)) {
    throw new RangeError("Monthly deductions must be a safe non-negative integer amount in paise");
  }

  const grossPayPaise = baseSalaryPaise + monthlyAllowancesPaise;
  if (!Number.isSafeInteger(grossPayPaise)) {
    throw new RangeError("Gross pay exceeds the safe integer range");
  }
  if (monthlyDeductionsPaise > grossPayPaise) {
    throw new RangeError("Monthly deductions cannot exceed gross pay");
  }

  const netPayPaise = grossPayPaise - monthlyDeductionsPaise;
  if (!Number.isSafeInteger(netPayPaise) || netPayPaise < 0) {
    throw new RangeError("Net pay is outside the supported range");
  }

  return {
    baseSalaryPaise,
    monthlyAllowancesPaise,
    grossPayPaise,
    monthlyDeductionsPaise,
    netPayPaise
  };
}
