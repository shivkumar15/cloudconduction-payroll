// Monetary values are persisted as integer paise, never floating-point rupees.
export const MAX_SALARY_COMPONENT_PAISE = 10_000_000_000; // ₹10 crore per component.

export function isValidPaise(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_SALARY_COMPONENT_PAISE;
}
