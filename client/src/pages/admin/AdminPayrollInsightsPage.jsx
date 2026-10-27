import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../services/api.js";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

function money(paise) {
  return Number.isSafeInteger(paise) ? currency.format(paise / 100) : "—";
}

function currentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year + "-" + month;
}

function StatCard({ label, value, note }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </article>
  );
}

function InsightCard({ insight }) {
  const styles = {
    high: "border-rose-200 bg-rose-50 text-rose-950",
    review: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-slate-200 bg-white text-slate-900"
  };
  const labelStyles = {
    high: "bg-rose-100 text-rose-800",
    review: "bg-amber-100 text-amber-900",
    info: "bg-slate-100 text-slate-700"
  };

  return (
    <article className={"rounded-2xl border p-5 shadow-sm " + (styles[insight.severity] || styles.info)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{insight.title}</h3>
        <span className={"rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide " + (labelStyles[insight.severity] || labelStyles.info)}>
          {insight.severity === "high" ? "Priority review" : insight.severity === "review" ? "Review" : "Note"}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6">{insight.summary}</p>
      <div className="mt-4 border-t border-current/10 pt-3">
        <p className="text-xs font-bold uppercase tracking-wide opacity-70">Suggested next step</p>
        <p className="mt-1 text-sm leading-6">{insight.action}</p>
      </div>
    </article>
  );
}

export default function AdminPayrollInsightsPage() {
  const [period, setPeriod] = useState(currentPeriod);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadInsights = useCallback(async (targetPeriod) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.post("/payroll-insights", { period: targetPeriod });
      setReport(response.data.data || null);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to load payroll insights. Refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInsights(currentPeriod());
  }, [loadInsights]);

  const selected = useMemo(
    () => report?.periods?.find((item) => item.period === report.period) || null,
    [report]
  );
  const latestPrevious = useMemo(
    () => report?.periods?.slice().reverse().find((item) => item.hasSavedRun && item.period !== report.period) || null,
    [report]
  );
  const modeText = report?.mode === "ai"
    ? "AI-generated advisory"
    : report?.mode === "disabled"
      ? "AI disabled · rule-based guidance"
      : "Fallback guidance";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-indigo-600">
            <ArrowLeft size={17} aria-hidden="true" /> Back to dashboard
          </Link>
          <span className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-800">
            <Sparkles size={15} aria-hidden="true" /> Advisory only
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold text-indigo-600">PHASE 6.7 · AGGREGATE ANALYTICS</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">AI Payroll Insights</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Review period-level patterns and possible areas for human follow-up. Insights never modify payroll values, approve runs or change transaction statuses.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <label className="block min-w-48 flex-1">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Payroll period</span>
              <input
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void loadInsights(period)}
              disabled={loading || !period}
              className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
              {loading ? "Analyzing…" : "Generate insights"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
            {error}
          </div>
        )}

        {report?.message && (
          <div className={"mt-6 flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 " + (
            report.mode === "ai"
              ? "border-indigo-200 bg-indigo-50 text-indigo-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          )} role="status">
            {report.mode === "ai" ? <CheckCircle2 size={19} className="mt-0.5 shrink-0" aria-hidden="true" /> : <TriangleAlert size={19} className="mt-0.5 shrink-0" aria-hidden="true" />}
            <div>
              <p className="font-semibold">{modeText}</p>
              <p className="mt-1">{report.message}</p>
            </div>
          </div>
        )}

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Employees in saved snapshot"
            value={selected?.hasSavedRun ? String(selected.employeeCount) : "—"}
            note={selected?.hasSavedRun ? "Employee count captured in " + period : "No saved payroll snapshot for " + period}
          />
          <StatCard
            label="Gross payroll"
            value={selected?.hasSavedRun ? money(selected.totalGrossPayPaise) : "—"}
            note="Saved snapshot · INR"
          />
          <StatCard
            label="Deductions"
            value={selected?.hasSavedRun ? money(selected.totalDeductionsPaise) : "—"}
            note={selected?.hasSavedRun ? selected.unpaidLeaveDays + " approved unpaid-leave day(s)" : "No saved deduction totals"}
          />
          <StatCard
            label="Net payroll"
            value={selected?.hasSavedRun ? money(selected.totalNetPayPaise) : "—"}
            note={selected?.hasSavedRun ? "Saved snapshot · INR" : "Preview and save a run to populate metrics"}
          />
        </div>

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Review observations</h2>
              <p className="mt-1 text-sm text-slate-500">Suggestions based only on saved aggregate totals and simulated transaction counts.</p>
            </div>
            {report?.mode && <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{modeText}</span>}
          </div>

          {loading && !report ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500" role="status">Loading aggregate payroll metrics…</div>
          ) : report?.insights?.length ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {report.insights.map((insight, index) => <InsightCard key={insight.title + "-" + index} insight={insight} />)}
            </div>
          ) : !loading && !error ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Generate insights to view period-level observations.</div>
          ) : null}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Three-period overview</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Only saved payroll-run aggregates and current simulated transaction statuses are shown. Missing periods are not filled with invented values.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-3 font-semibold">Period</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-semibold">Run status</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-semibold">Net payroll</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-semibold">Transactions</th>
                  <th className="border-b border-slate-200 px-3 py-3 font-semibold">Failed</th>
                </tr>
              </thead>
              <tbody>
                {(report?.periods || []).map((item) => (
                  <tr key={item.period}>
                    <td className="border-b border-slate-100 px-3 py-3 font-medium">{item.period}</td>
                    <td className="border-b border-slate-100 px-3 py-3 capitalize">{item.hasSavedRun ? item.status : "No saved run"}</td>
                    <td className="border-b border-slate-100 px-3 py-3 tabular-nums">{item.hasSavedRun ? money(item.totalNetPayPaise) : "—"}</td>
                    <td className="border-b border-slate-100 px-3 py-3 tabular-nums">{item.transactions.total}</td>
                    <td className="border-b border-slate-100 px-3 py-3 tabular-nums">{item.transactions.failed}</td>
                  </tr>
                ))}
                {(!report?.periods || report.periods.length === 0) && (
                  <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-500">No report loaded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {latestPrevious && selected?.hasSavedRun && (
            <p className="mt-3 text-xs text-slate-500">Nearest earlier saved period available for comparison: {latestPrevious.period}.</p>
          )}
        </section>

        <p className="mt-6 text-xs leading-5 text-slate-500">
          Data minimization: the server sends only company-level period aggregates to the AI provider. Employee names, emails, codes, IDs, individual salary rows, leave dates and reasons are excluded. Insights are advisory, and provider access is optional.
        </p>
      </section>
    </main>
  );
}
