const PERIOD_PATTERN = /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/;
const TOTAL_FIELDS = [
  "totalGrossPayPaise",
  "totalDeductionsPaise",
  "totalNetPayPaise"
];

function summarizeFinalizedRun(run, label) {
  if (!run || typeof run !== "object" || Array.isArray(run)) {
    throw new TypeError(label + " payroll run is required");
  }

  if (typeof run.period !== "string" || !PERIOD_PATTERN.test(run.period)) {
    throw new TypeError(label + " payroll period must use YYYY-MM format with a valid month");
  }

  if (run.status !== "finalized") {
    throw new RangeError(label + " payroll run must be finalized before insights can be generated");
  }

  if (run.currency !== "INR") {
    throw new TypeError(label + " payroll currency must be INR");
  }

  if (!Number.isSafeInteger(run.employeeCount) || run.employeeCount < 1) {
    throw new TypeError(label + " employee count must be a positive safe integer");
  }

  const summary = {
    period: run.period,
    currency: run.currency,
    employeeCount: run.employeeCount
  };

  for (const field of TOTAL_FIELDS) {
    if (!Number.isSafeInteger(run[field]) || run[field] < 0) {
      throw new TypeError(label + " " + field + " must be a non-negative safe integer in paise");
    }
    summary[field] = run[field];
  }

  // Intentionally select only aggregate fields. Never pass the payroll run's
  // employee-level items, names, IDs, or salary line items into the insight layer.
  return summary;
}

function percentageChange(current, previous) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10_000) / 100;
}

function difference(current, previous) {
  const delta = current - previous;
  return {
    absolute: delta,
    percent: percentageChange(current, previous)
  };
}

/**
 * Build the minimum aggregate-only payload permitted for AI Payroll Insights.
 * The caller must fetch finalized payroll runs; this helper rejects any other
 * status and never copies employee-level or other untrusted document fields.
 */
export function buildPayrollInsightMetrics({ currentRun, previousRun = null } = {}) {
  const current = summarizeFinalizedRun(currentRun, "Current");
  let comparison = null;

  if (previousRun !== null) {
    const previous = summarizeFinalizedRun(previousRun, "Previous");

    if (previous.period >= current.period) {
      throw new RangeError("Previous payroll period must be earlier than the current period");
    }
    if (previous.currency !== current.currency) {
      throw new RangeError("Payroll periods must use the same currency for comparison");
    }

    comparison = {
      period: previous.period,
      employeeCount: previous.employeeCount,
      totalGrossPayPaise: previous.totalGrossPayPaise,
      totalDeductionsPaise: previous.totalDeductionsPaise,
      totalNetPayPaise: previous.totalNetPayPaise,
      changes: {
        employeeCount: difference(current.employeeCount, previous.employeeCount),
        totalGrossPayPaise: difference(current.totalGrossPayPaise, previous.totalGrossPayPaise),
        totalDeductionsPaise: difference(current.totalDeductionsPaise, previous.totalDeductionsPaise),
        totalNetPayPaise: difference(current.totalNetPayPaise, previous.totalNetPayPaise)
      }
    };
  }

  return {
    period: current.period,
    currency: current.currency,
    current: {
      employeeCount: current.employeeCount,
      totalGrossPayPaise: current.totalGrossPayPaise,
      totalDeductionsPaise: current.totalDeductionsPaise,
      totalNetPayPaise: current.totalNetPayPaise
    },
    comparison
  };
}
