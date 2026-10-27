export function parsePayrollPeriod(period) {
  if (typeof period !== "string" || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(period)) {
    throw new TypeError("A valid YYYY-MM payroll period is required");
  }
  const [year, month] = period.split("-").map(Number);
  return { year, month };
}

export function getPayrollPeriodBounds(period) {
  const { year, month } = parsePayrollPeriod(period);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1))
  };
}

export function getWorkingDaysInPeriod(period) {
  const { year, month } = parsePayrollPeriod(period);
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  const monthIndex = month - 1;
  let count = 0;

  while (cursor.getUTCMonth() === monthIndex) {
    const weekday = cursor.getUTCDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return count;
}

export function getWeekdayDatesInRange(startDate, endDate) {
  const isValidDateOnly = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate) || startDate > endDate) {
    throw new RangeError("A valid ordered date range is required");
  }
  if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
    throw new RangeError("Unpaid-leave ranges must stay within one payroll month");
  }

  const cursor = new Date(startDate + "T00:00:00.000Z");
  const end = new Date(endDate + "T00:00:00.000Z");
  const dates = [];
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday >= 1 && weekday <= 5) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (dates.length === 0) throw new RangeError("The selected range contains no Monday-Friday workdays");
  return dates;
}

export function dateToPayrollPeriod(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("A valid date is required");
  }
  return date.toISOString().slice(0, 7);
}

export function calculateUnpaidLeaveDeductionPaise({ monthlyGrossPayPaise, unpaidLeaveDays, period }) {
  if (!Number.isSafeInteger(monthlyGrossPayPaise) || monthlyGrossPayPaise < 0) {
    throw new RangeError("Monthly gross pay must be a safe non-negative integer amount in paise");
  }
  if (!Number.isSafeInteger(unpaidLeaveDays) || unpaidLeaveDays < 0) {
    throw new RangeError("Unpaid-leave days must be a safe non-negative integer");
  }

  const workingDays = getWorkingDaysInPeriod(period);
  if (unpaidLeaveDays > workingDays) {
    throw new RangeError("Unpaid-leave days cannot exceed the working days in the payroll month");
  }
  if (workingDays === 0) {
    throw new RangeError("The payroll month has no configured working days");
  }
  if (unpaidLeaveDays === 0 || monthlyGrossPayPaise === 0) return 0;

  // BigInt avoids precision loss when multiplying large safe-integer paise values.
  const numerator = BigInt(monthlyGrossPayPaise) * BigInt(unpaidLeaveDays);
  const denominator = BigInt(workingDays);
  let rounded = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n >= denominator) rounded += 1n;

  const result = Number(rounded);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError("Unpaid-leave deduction exceeds the safe integer range");
  }
  return result;
}
