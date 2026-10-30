import { useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import api from "../../services/api.js";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

function money(paise) {
  return currency.format((Number(paise) || 0) / 100);
}

function getErrorMessage(error) {
  return error?.response?.data?.message
    || "Unable to generate AI insights. Check the API status and try again.";
}

function makeOfflineInsightResult(currentRun, previousRun) {
  const current = {
    employeeCount: Number(currentRun.employeeCount) || 0,
    totalGrossPayPaise: Number(currentRun.totalGrossPayPaise) || 0,
    totalDeductionsPaise: Number(currentRun.totalDeductionsPaise) || 0,
    totalNetPayPaise: Number(currentRun.totalNetPayPaise) || 0
  };

  const previous = previousRun ? {
    employeeCount: Number(previousRun.employeeCount) || 0,
    totalGrossPayPaise: Number(previousRun.totalGrossPayPaise) || 0,
    totalDeductionsPaise: Number(previousRun.totalDeductionsPaise) || 0,
    totalNetPayPaise: Number(previousRun.totalNetPayPaise) || 0
  } : null;

  function difference(value, previousValue) {
    const absolute = value - previousValue;
    return {
      absolute,
      percent: previousValue === 0 ? null : Math.round((absolute / previousValue) * 10_000) / 100
    };
  }

  const comparison = previousRun ? {
    period: previousRun.period,
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
  } : null;

  const netChange = comparison?.changes.totalNetPayPaise;
  const direction = netChange
    ? netChange.absolute > 0 ? "increased" : netChange.absolute < 0 ? "decreased" : "was unchanged"
    : "";

  const observations = comparison
    ? [
      "Net payroll " + direction + " by " + money(Math.abs(netChange.absolute))
        + (netChange.percent === null
          ? " compared with " + comparison.period + "; a percentage change is unavailable because the previous net payroll was zero."
          : " (" + netChange.percent + "%) compared with " + comparison.period + "."),
      "The saved employee count changed by "
        + comparison.changes.employeeCount.absolute
        + " compared with the previous finalized period."
    ]
    : [
      "No earlier finalized period is available in the loaded records, so no period-over-period comparison is shown."
    ];

  return {
    period: currentRun.period,
    currency: currentRun.currency || "INR",
    metrics: {
      period: currentRun.period,
      currency: currentRun.currency || "INR",
      current,
      comparison
    },
    insights: {
      summary: "Finalized payroll for " + currentRun.period + " records net payroll of "
        + money(current.totalNetPayPaise) + " across " + current.employeeCount + " employee(s)."
        + (comparison ? " The comparison period is " + comparison.period + "." : ""),
      observations,
      itemsToReview: [
        "Verify the displayed totals against the finalized payroll register before making administrative decisions.",
        "Check whether changes in employee count and payroll totals match approved staffing and salary updates."
      ],
      limitations: "This summary is calculated locally from saved aggregate totals; Gemini was not called. It does not inspect individual employee records."
    },
    provider: "Offline",
    generatedAt: new Date().toISOString(),
    disclaimer: "Advisory information only. Verify all values against source records. This is not tax, legal, or compliance advice."
  };
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 break-words text-base font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function InsightList({ title, items, emptyText }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {items.length === 0
        ? <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
        : <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={title + "-" + index} className="flex gap-2 text-sm leading-6 text-slate-700">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>}
    </section>
  );
}

export default function AiPayrollInsightsPanel({ runs }) {
  const finalizedRuns = useMemo(() => runs
    .filter((run) => run.status === "finalized")
    .slice()
    .sort((a, b) => b.period.localeCompare(a.period)), [runs]);

  const [periodChoice, setPeriodChoice] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedPeriod = finalizedRuns.some((run) => run.period === periodChoice)
    ? periodChoice
    : finalizedRuns[0]?.period || "";
  const displayedResult = result?.period === selectedPeriod ? result : null;

  function changePeriod(event) {
    setPeriodChoice(event.target.value);
    setResult(null);
    setError("");
  }

  async function generateInsights() {
    if (!selectedPeriod || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await api.get("/ai-insights", {
        params: { period: selectedPeriod },
        timeout: 20_000
      });
      setResult(response.data.data || null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  function showOfflineInsights() {
    if (!selectedPeriod || loading) return;

    const currentRun = finalizedRuns.find((run) => run.period === selectedPeriod);
    if (!currentRun) {
      setError("Select a finalized payroll period to run offline analysis.");
      return;
    }

    const previousRun = finalizedRuns.find((run) => run.period < selectedPeriod) || null;
    setError("");
    setResult(makeOfflineInsightResult(currentRun, previousRun));
  }

  return (
    <section className="mt-6 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
            <Sparkles size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">AI · Advisory only</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">AI payroll insights</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Ask Gemini to explain aggregate trends from a finalized payroll period and the previous finalized period.
              The application calculates all financial totals; AI cannot change payroll records.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:max-w-sm">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Finalized period</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
              value={selectedPeriod}
              onChange={changePeriod}
              disabled={finalizedRuns.length === 0 || loading}
            >
              {finalizedRuns.length === 0
                ? <option value="">No finalized periods</option>
                : finalizedRuns.map((run) => (
                  <option key={run.id} value={run.period}>{run.period}</option>
                ))}
            </select>
          </label>
          <button
            type="button"
            onClick={generateInsights}
            disabled={!selectedPeriod || loading}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? <><RefreshCw size={15} className="animate-spin" aria-hidden="true" /> Generating…</>
              : <><Sparkles size={15} aria-hidden="true" /> Generate with Gemini</>}
          </button>
          <button
            type="button"
            onClick={showOfflineInsights}
            disabled={!selectedPeriod || loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run offline analysis (no API call)
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
        Generate with Gemini sends aggregate metrics to the configured AI provider. Run offline analysis uses saved totals locally and makes no API call. Billing remains disabled; use synthetic test payroll data until production privacy and compliance controls are reviewed.
      </div>

      {finalizedRuns.length === 0 && (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          Finalize a payroll period before generating insights. Draft and approved runs are not eligible.
        </p>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <p className="mt-4 text-sm text-slate-600" role="status">
          Waiting for Gemini to analyse aggregate metrics. No employee-level records are sent.
        </p>
      )}

      {displayedResult && (
        <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">{displayedResult.period} summary</h3>
              {displayedResult.provider === "Offline"
                ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Offline analysis</span>
                : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Gemini · Generated</span>}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{displayedResult.insights.summary}</p>
            <p className="mt-2 text-xs text-slate-500">
              Generated {new Date(displayedResult.generatedAt).toLocaleString("en-IN")}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">Application-calculated totals</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Employees" value={displayedResult.metrics.current.employeeCount} />
              <Metric label="Gross payroll" value={money(displayedResult.metrics.current.totalGrossPayPaise)} />
              <Metric label="Deductions" value={money(displayedResult.metrics.current.totalDeductionsPaise)} />
              <Metric label="Net payroll" value={money(displayedResult.metrics.current.totalNetPayPaise)} />
            </div>
          </div>

          {displayedResult.metrics.comparison && (
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Compared with {displayedResult.metrics.comparison.period}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Net payroll change: {money(displayedResult.metrics.comparison.changes.totalNetPayPaise.absolute)}
                {" "}({displayedResult.metrics.comparison.changes.totalNetPayPaise.percent === null
                  ? "percentage unavailable because previous net payroll was zero"
                  : displayedResult.metrics.comparison.changes.totalNetPayPaise.percent + "%"}).
              </p>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <InsightList
              title="Observations"
              items={displayedResult.insights.observations}
              emptyText="Gemini returned no observations."
            />
            <InsightList
              title="Items to review"
              items={displayedResult.insights.itemsToReview}
              emptyText="Gemini suggested no additional checks."
            />
          </div>

          <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            {displayedResult.insights.limitations} {displayedResult.disclaimer}
          </p>
        </div>
      )}
    </section>
  );
}
