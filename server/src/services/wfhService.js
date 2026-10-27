const INDIA_TIME_ZONE = "Asia/Kolkata";
const MAX_WFH_REQUEST_DAYS_AHEAD = 365;

export function getIndiaBusinessDate(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("A valid current time is required");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export function addDateOnlyDays(dateOnly, amount) {
  if (typeof dateOnly !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) || !Number.isSafeInteger(amount)) {
    throw new TypeError("A date-only value and whole-day offset are required");
  }
  const value = new Date(dateOnly + "T00:00:00.000Z");
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== dateOnly) {
    throw new TypeError("A real YYYY-MM-DD date is required");
  }
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function isWfhRequestDateAllowed(dateOnly, businessDate = getIndiaBusinessDate()) {
  if (typeof dateOnly !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return false;
  const parsed = new Date(dateOnly + "T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateOnly) return false;
  return dateOnly >= businessDate && dateOnly <= addDateOnlyDays(businessDate, MAX_WFH_REQUEST_DAYS_AHEAD);
}

export function dateOnlyToUtcDate(dateOnly) {
  if (typeof dateOnly !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new TypeError("A valid date-only value is required");
  }
  const date = new Date(dateOnly + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateOnly) {
    throw new TypeError("A real YYYY-MM-DD date is required");
  }
  return date;
}

export function getAttendancePeriodBounds(period) {
  if (typeof period !== "string" || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(period)) {
    throw new TypeError("A valid YYYY-MM payroll period is required");
  }
  const [year, month] = period.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1))
  };
}
