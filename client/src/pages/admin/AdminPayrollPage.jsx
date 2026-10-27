import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BarChart3, CheckCircle2, ChevronLeft, ChevronRight,
  AlertCircle, Download, FileCheck, Play, RefreshCw, ShieldAlert, Sparkles, X,
  Users, Wallet
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from "recharts";
import api from "../../services/api.js";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

function money(paise) {
  return currency.format((Number(paise) || 0) / 100);
}

function currentPeriod() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

function responseMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[-=+@]/.test(text)) text = "'" + text;
  return "\"" + text.replace(/"/g, "\"\"") + "\"";
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }) {
  const classes = {
    draft: "bg-slate-100 text-slate-700",
    approved: "bg-blue-50 text-blue-700",
    finalized: "bg-emerald-50 text-emerald-700",
    succeeded: "bg-emerald-50 text-emerald-700",
    failed: "bg-rose-50 text-rose-700"
  };
  return <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + (classes[status] || "bg-slate-100 text-slate-700")}>{status}</span>;
}

const cardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function AdminPayrollPage() {
  const [period, setPeriod] = useState(currentPeriod);
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [preview, setPreview] = useState(null);
  const [failCodes, setFailCodes] = useState("");
  const [transactionStatus, setTransactionStatus] = useState("");
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactions, setTransactions] = useState([]);
  const [transactionPagination, setTransactionPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [pageError, setPageError] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [toastLeaving, setToastLeaving] = useState(false);

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    setPageError("");
    try {
      const response = await api.get("/payroll", { params: { page: 1, pageSize: 100 } });
      const rows = Array.isArray(response.data.data) ? response.data.data : [];
      setRuns(rows);
      setSelectedRunId((current) => {
        if (current && rows.some((run) => run.id === current)) return current;
        const samePeriod = rows.find((run) => run.period === period);
        return samePeriod?.id || "";
      });
    } catch (error) {
      setPageError(responseMessage(error, "Unable to load payroll runs."));
      setRuns([]);
    } finally {
      setLoadingRuns(false);
    }
  }, [period]);

  const loadTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    setTransactionError("");
    try {
      const response = await api.get("/transactions", {
        params: {
          page: transactionPage,
          pageSize: 25,
          period: period || undefined,
          status: transactionStatus || undefined
        }
      });
      setTransactions(Array.isArray(response.data.data) ? response.data.data : []);
      setTransactionPagination(response.data.pagination || { page: transactionPage, pageSize: 25, total: 0, totalPages: 0 });
    } catch (error) {
      setTransactionError(responseMessage(error, "Unable to load simulated transactions."));
      setTransactions([]);
      setTransactionPagination({ page: transactionPage, pageSize: 25, total: 0, totalPages: 0 });
    } finally {
      setLoadingTransactions(false);
    }
  }, [period, transactionPage, transactionStatus]);

  useEffect(() => { void loadRuns(); }, [loadRuns]);
  useEffect(() => { void loadTransactions(); }, [loadTransactions]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) || null,
    [runs, selectedRunId]
  );

  const chartData = useMemo(() => runs
    .slice()
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-6)
    .map((run) => ({
      period: run.period,
      netPay: Math.round(run.totalNetPayPaise / 100),
      deductions: Math.round(run.totalDeductionsPaise / 100)
    })), [runs]);

  const currentPeriodRun = runs.find((run) => run.period === currentPeriod());
  const latestNetPay = currentPeriodRun ? money(currentPeriodRun.totalNetPayPaise) : "—";
  const failedVisible = transactions.filter((transaction) => transaction.status === "failed").length;
  const toastError = actionError || pageError || transactionError;
  const toastMessage = toastError || notice;
  const hasToastError = Boolean(toastError);

  useEffect(() => {
    if (!notice || actionError || pageError || transactionError) {
      setToastLeaving(false);
      return undefined;
    }

    setToastLeaving(false);
    const leaveTimeoutId = window.setTimeout(() => setToastLeaving(true), 6200);
    const dismissTimeoutId = window.setTimeout(() => setNotice(""), 6500);

    return () => {
      window.clearTimeout(leaveTimeoutId);
      window.clearTimeout(dismissTimeoutId);
    };
  }, [notice, actionError, pageError, transactionError]);

  async function runAction(key, action, fallbackMessage) {
    setBusyAction(key);
    setActionError("");
    setPageError("");
    setNotice("");
    try {
      const response = await action();
      setNotice(response?.data?.message || fallbackMessage);
      await Promise.all([loadRuns(), loadTransactions()]);
    } catch (error) {
      setActionError(responseMessage(error, "The action could not be completed. Refresh and try again."));
    } finally {
      setBusyAction("");
    }
  }

  async function requestPreview() {
    setBusyAction("preview");
    setActionError("");
    setNotice("");
    try {
      const response = await api.post("/payroll/preview", { period });
      setPreview(response.data.data);
    } catch (error) {
      setPreview(null);
      setActionError(responseMessage(error, "Unable to preview payroll. Check that active employees exist."));
    } finally {
      setBusyAction("");
    }
  }

  async function createRun() {
    await runAction(
      "create",
      async () => {
        const response = await api.post("/payroll/runs", { period });
        setSelectedRunId(response.data.data.id);
        setPreview(null);
        return response;
      },
      "Draft payroll run created."
    );
  }

  async function approveRun() {
    if (!selectedRun) return;
    await runAction(
      "approve",
      () => api.post("/payroll/runs/" + selectedRun.id + "/approve", {}),
      "Payroll run approved."
    );
  }

  async function simulateTransactions() {
    if (!selectedRun) return;
    const failEmployeeCodes = failCodes
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    await runAction(
      "simulate",
      async () => {
        const response = await api.post(
          "/payroll/runs/" + selectedRun.id + "/simulate-transactions",
          { failEmployeeCodes }
        );
        const summary = response.data.summary;
        if (summary) {
          response.data.message = "Simulation finished: " + summary.succeeded + " succeeded, " + summary.failed + " failed. No money was transferred.";
        }
        return response;
      },
      "Simulated transactions processed. No money was transferred."
    );
  }

  async function finalizeRun() {
    if (!selectedRun) return;
    const confirmed = window.confirm("Finalize " + selectedRun.period + " payroll? This is a one-way demo workflow transition after all simulated transactions succeed.");
    if (!confirmed) return;
    await runAction(
      "finalize",
      () => api.post("/payroll/runs/" + selectedRun.id + "/finalize", {}),
      "Payroll run finalized."
    );
  }

  async function retryTransaction(transactionId) {
    await runAction(
      "retry-" + transactionId,
      () => api.post("/transactions/" + transactionId + "/retry", {}),
      "Simulated transaction retry completed. No money was transferred."
    );
  }

  function selectRun(run) {
    setSelectedRunId(run.id);
    setPeriod(run.period);
    setPreview(null);
    setActionError("");
    setNotice("");
    setTransactionPage(1);
  }

  function changePeriod(event) {
    const nextPeriod = event.target.value;
    setPeriod(nextPeriod);
    setTransactionPage(1);
    setPreview(null);
    setActionError("");
    const existing = runs.find((run) => run.period === nextPeriod);
    setSelectedRunId(existing?.id || "");
  }

  function exportTransactions() {
    const rows = [
      ["Period", "Employee code", "Employee name", "Amount INR", "Status", "Attempts", "Simulated reference", "Last attempt"],
      ...transactions.map((item) => [
        item.period,
        item.employeeCode,
        item.employeeName,
        (item.amountPaise / 100).toFixed(2),
        item.status,
        item.attemptCount,
        item.simulatedReference,
        item.lastAttemptAt
      ])
    ];
    downloadCsv("simulated-transactions-" + period + ".csv", rows);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-indigo-600">
            <ArrowLeft size={17} aria-hidden="true" /> Back to dashboard
          </Link>
          <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-amber-800">
            Simulation only · No real transfers
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold text-indigo-600">PHASE 6 · PAYROLL WORKSPACE</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Payroll & transactions</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Preview saved salary structures, create and approve monthly runs, then test the payment lifecycle with simulated transactions.
            </p>
          </div>
          <label className="block w-full max-w-xs">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Payroll period</span>
            <input className={fieldClass} type="month" value={period} onChange={changePeriod} />
          </label>
        </div>

        {toastMessage && (
          <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:justify-end sm:px-6">
            <div
              key={(hasToastError ? "error-" : "success-") + toastMessage}
              className={
                "payroll-toast-enter pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden rounded-2xl border p-4 pl-5 pr-3 text-sm shadow-2xl shadow-slate-950/15 ring-1 ring-white/70 backdrop-blur-xl " +
                (toastLeaving ? "payroll-toast-leave " : "") +
                (hasToastError
                  ? "border-rose-200 bg-gradient-to-br from-white via-white to-rose-50 text-rose-950"
                  : "border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50 text-emerald-950")
              }
              role={hasToastError ? "alert" : "status"}
              aria-live={hasToastError ? "assertive" : "polite"}
              aria-atomic="true"
            >
              <span
                aria-hidden="true"
                className={
                  "absolute inset-y-0 left-0 w-1 " +
                  (hasToastError
                    ? "bg-gradient-to-b from-rose-400 via-rose-500 to-orange-400"
                    : "bg-gradient-to-b from-emerald-400 via-teal-500 to-indigo-500")
                }
              />
              <div
                className={
                  "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm " +
                  (hasToastError
                    ? "bg-rose-100 text-rose-700 ring-1 ring-rose-200/80"
                    : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80")
                }
              >
                {hasToastError
                  ? <AlertCircle size={20} aria-hidden="true" />
                  : <CheckCircle2 className="payroll-toast-icon-pop" size={20} aria-hidden="true" />}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold tracking-tight">{hasToastError ? "Action needs attention" : "All done!"}</p>
                  <span
                    className={
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] " +
                      (hasToastError ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")
                    }
                  >
                    {!hasToastError && <Sparkles size={11} aria-hidden="true" />}
                    {hasToastError ? "Action required" : "Success"}
                  </span>
                </div>
                <p className="mt-1.5 break-words leading-5 text-slate-700">{toastMessage}</p>
                {!hasToastError && <p className="mt-2 text-[11px] font-medium text-slate-500">Closing automatically</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setActionError("");
                  setPageError("");
                  setTransactionError("");
                  setNotice("");
                  setToastLeaving(false);
                }}
                className="ml-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition duration-200 hover:rotate-90 hover:bg-white hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Dismiss notification"
                title="Dismiss notification"
              >
                <X size={17} aria-hidden="true" />
              </button>
              {!hasToastError && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-emerald-100/80" aria-hidden="true">
                  <div className="payroll-toast-progress h-full rounded-r-full bg-gradient-to-r from-emerald-400 via-teal-500 to-indigo-500" />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className={cardClass}>
            <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Payroll runs loaded</p><Wallet size={19} className="text-indigo-600" aria-hidden="true" /></div>
            <p className="mt-4 text-3xl font-bold">{loadingRuns ? "…" : runs.length}</p>
            <p className="mt-1 text-xs text-slate-500">Most recent 100 saved runs</p>
          </article>
          <article className={cardClass}>
            <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Current-month payroll snapshot</p><BarChart3 size={19} className="text-indigo-600" aria-hidden="true" /></div>
            <p className="mt-4 text-2xl font-bold">{latestNetPay}</p>
            <p className="mt-1 text-xs text-slate-500">{currentPeriodRun ? "Saved snapshot for " + currentPeriodRun.period : "No saved run for " + currentPeriod()}</p>
          </article>
          <article className={cardClass}>
            <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Period transactions</p><Users size={19} className="text-indigo-600" aria-hidden="true" /></div>
            <p className="mt-4 text-3xl font-bold">{loadingTransactions ? "…" : transactionPagination.total}</p>
            <p className="mt-1 text-xs text-slate-500">Matching {period} filters</p>
          </article>
          <article className={cardClass}>
            <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Failed on this page</p><ShieldAlert size={19} className="text-rose-600" aria-hidden="true" /></div>
            <p className="mt-4 text-3xl font-bold">{loadingTransactions ? "…" : failedVisible}</p>
            <p className="mt-1 text-xs text-slate-500">Retry failed simulation records below</p>
          </article>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <section className={cardClass}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-lg font-semibold">Payroll workflow</h2>
                <p className="mt-1 text-sm text-slate-500">The server validates every state change and prevents duplicate monthly runs.</p>
              </div>
              <button type="button" onClick={requestPreview} disabled={busyAction !== ""} className={secondaryButton}>
                <RefreshCw size={16} aria-hidden="true" /> {busyAction === "preview" ? "Calculating…" : "Preview period"}
              </button>
            </div>

            {preview && (
              <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">Preview · {preview.period}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Not yet saved. Gross = base salary + allowances; deductions include fixed deductions and approved unpaid leave.</p>
                    {(preview.pendingUnpaidLeaveRequestsCount || 0) > 0 && (
                      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                        {preview.pendingUnpaidLeaveRequestsCount} unpaid-leave request(s) still need an admin decision for this period. Resolve them before creating the payroll snapshot.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={createRun}
                    disabled={
                      busyAction !== ""
                      || runs.some((run) => run.period === period)
                      || preview.canCreateRun === false
                      || (preview.pendingUnpaidLeaveRequestsCount || 0) > 0
                    }
                    className={primaryButton}
                  >
                    <FileCheck size={16} aria-hidden="true" /> {busyAction === "create" ? "Creating…" : "Create draft run"}
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Employees</p><p className="mt-1 text-lg font-bold">{preview.employeeCount}</p></div>
                  <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Gross payroll</p><p className="mt-1 text-lg font-bold">{money(preview.totalGrossPayPaise)}</p></div>
                  <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Deductions</p><p className="mt-1 text-lg font-bold">{money(preview.totalDeductionsPaise)}</p></div>
                  <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Net payroll</p><p className="mt-1 text-lg font-bold">{money(preview.totalNetPayPaise)}</p></div>
                </div>
                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Fixed deductions</th><th className="px-3 py-2 text-right">Unpaid leave</th><th className="px-3 py-2 text-right">Leave deduction</th><th className="px-3 py-2 text-right">Total deductions</th><th className="px-3 py-2 text-right">Net</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.items.map((item) => <tr key={item.employeeId}>
                        <td className="px-3 py-2"><p className="font-medium">{item.employeeName}</p><p className="text-xs text-slate-500">{item.employeeCode} · {item.department}</p></td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(item.grossPayPaise)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(item.fixedMonthlyDeductionsPaise ?? item.monthlyDeductionsPaise)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{item.unpaidLeaveDays || 0}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(item.unpaidLeaveDeductionPaise || 0)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(item.monthlyDeductionsPaise)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{money(item.netPayPaise)}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-800">Saved payroll runs</h3>
              {loadingRuns && <p className="mt-3 text-sm text-slate-500" role="status">Loading saved payroll runs…</p>}
              {!loadingRuns && runs.length === 0 && <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No payroll runs yet. Select a period and preview it to begin.</p>}
              {!loadingRuns && runs.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Period</th><th className="px-3 py-3">Employees</th><th className="px-3 py-3 text-right">Deductions</th><th className="px-3 py-3 text-right">Net pay</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Action</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {runs.map((run) => <tr key={run.id} className={run.id === selectedRunId ? "bg-indigo-50/60" : ""}>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold">{run.period}</td>
                        <td className="px-3 py-3">{run.employeeCount}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{money(run.totalDeductionsPaise)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{money(run.totalNetPayPaise)}</td>
                        <td className="px-3 py-3"><StatusBadge status={run.status} /></td>
                        <td className="px-3 py-3"><button type="button" className="text-sm font-semibold text-indigo-700 hover:underline" onClick={() => selectRun(run)}>View</button></td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold">Net payroll & deductions</h2>
            <p className="mt-1 text-sm text-slate-500">Latest saved periods; amounts are shown in rupees, based on persisted payroll snapshots.</p>
            {chartData.length === 0
              ? <p className="mt-6 rounded-lg bg-slate-50 p-5 text-sm text-slate-600">A chart will appear after you save a payroll run.</p>
              : <div className="mt-5 h-72 w-full" role="img" aria-label="Bar chart comparing net payroll and deductions across the latest saved periods">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => "₹" + Number(value).toLocaleString("en-IN")} width={82} />
                    <Tooltip formatter={(value) => currency.format(Number(value))} />
                    <Legend />
                    <Bar dataKey="netPay" name="Net pay (₹)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="deductions" name="Deductions (₹)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold">Selected run</h3>
              {!selectedRun && <p className="mt-2 text-sm text-slate-500">Choose an existing run or create a draft from a preview.</p>}
              {selectedRun && <>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-semibold">{selectedRun.period} payroll</p><p className="mt-1 text-xs text-slate-500">{selectedRun.employeeCount} employees · created {formatDate(selectedRun.createdAt)}</p></div>
                  <StatusBadge status={selectedRun.status} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Gross total</p><p className="mt-1 font-bold">{money(selectedRun.totalGrossPayPaise)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Net total</p><p className="mt-1 font-bold">{money(selectedRun.totalNetPayPaise)}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedRun.status === "draft" && <button type="button" disabled={busyAction !== ""} onClick={approveRun} className={primaryButton}><CheckCircle2 size={16} /> {busyAction === "approve" ? "Approving…" : "Approve run"}</button>}
                  {selectedRun.status === "approved" && <button type="button" disabled={busyAction !== ""} onClick={simulateTransactions} className={primaryButton}><Play size={16} /> {busyAction === "simulate" ? "Simulating…" : "Simulate payments"}</button>}
                  {selectedRun.status === "approved" && <button type="button" disabled={busyAction !== ""} onClick={finalizeRun} className={secondaryButton}><FileCheck size={16} /> {busyAction === "finalize" ? "Finalizing…" : "Finalize run"}</button>}
                </div>
                {selectedRun.status === "approved" && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <label className="block text-sm font-semibold text-amber-950" htmlFor="failure-codes">Optional demo failure scenario</label>
                  <input id="failure-codes" className={"mt-2 " + fieldClass} value={failCodes} onChange={(event) => setFailCodes(event.target.value)} placeholder="EMP-1001, EMP-1002" />
                  <p className="mt-1 text-xs leading-5 text-amber-900">Comma-separated employee codes will be marked failed on their first simulation attempt. Leave blank for all-success simulation. This only tests the workflow; no money moves. Retrying an existing failed record is available in the transactions table.</p>
                </div>}
                {selectedRun.status === "finalized" && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">This payroll snapshot is finalized. Employee accounts can now view their own pay history.</p>}
                <div className="mt-5 max-h-72 overflow-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 uppercase text-slate-500"><tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">Allowance</th><th className="px-3 py-2 text-right">Fixed deductions</th><th className="px-3 py-2 text-right">Unpaid days</th><th className="px-3 py-2 text-right">Leave deduction</th><th className="px-3 py-2 text-right">Total deductions</th><th className="px-3 py-2 text-right">Net</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedRun.items.map((item) => <tr key={item.employeeId}>
                        <td className="px-3 py-2"><p className="font-semibold">{item.employeeName}</p><p className="text-slate-500">{item.employeeCode}</p></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{money(item.baseSalaryPaise)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{money(item.monthlyAllowancesPaise)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{money(item.fixedMonthlyDeductionsPaise ?? item.monthlyDeductionsPaise)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{item.unpaidLeaveDays || 0}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{money(item.unpaidLeaveDeductionPaise || 0)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{money(item.monthlyDeductionsPaise)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{money(item.netPayPaise)}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              </>}
            </div>
          </section>
        </div>

        <section className={"mt-6 " + cardClass}>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-lg font-semibold">Simulated transactions</h2>
              <p className="mt-1 text-sm text-slate-500">View outcomes, reference IDs and attempt history. Failed transactions can be retried without creating duplicates.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="transaction-status-filter">Filter transaction status</label>
              <select id="transaction-status-filter" className={fieldClass + " min-w-36"} value={transactionStatus} onChange={(event) => { setTransactionStatus(event.target.value); setTransactionPage(1); }}>
                <option value="">All statuses</option>
                <option value="succeeded">Succeeded</option>
                <option value="failed">Failed</option>
              </select>
              <button type="button" onClick={exportTransactions} disabled={transactions.length === 0} className={secondaryButton}><Download size={16} /> Export page CSV</button>
            </div>
          </div>

          {loadingTransactions && <p className="mt-4 text-sm text-slate-500" role="status">Loading transactions…</p>}
          {!loadingTransactions && !transactionError && transactions.length === 0 && <p className="mt-4 rounded-lg bg-slate-50 p-5 text-sm text-slate-600">No simulated transactions match this period and status. Approve a payroll run and choose Simulate payments to create records.</p>}
          {!loadingTransactions && transactions.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Employee</th><th className="px-3 py-3">Period</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Attempts</th><th className="px-3 py-3">Last attempt</th><th className="px-3 py-3">Actions / history</th></tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {transactions.map((transaction) => <tr key={transaction.id} className="align-top">
                  <td className="px-3 py-3"><p className="font-semibold">{transaction.employeeName}</p><p className="text-xs text-slate-500">{transaction.employeeCode}</p></td>
                  <td className="whitespace-nowrap px-3 py-3">{transaction.period}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{money(transaction.amountPaise)}</td>
                  <td className="px-3 py-3"><StatusBadge status={transaction.status} /><p className="mt-1 text-xs text-slate-500">Simulation</p></td>
                  <td className="px-3 py-3 text-center">{transaction.attemptCount}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{formatDate(transaction.lastAttemptAt)}</td>
                  <td className="min-w-48 px-3 py-3">
                    {transaction.status === "failed" && <button type="button" disabled={busyAction !== ""} onClick={() => retryTransaction(transaction.id)} className="mb-2 inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                      <RefreshCw size={13} aria-hidden="true" /> {busyAction === "retry-" + transaction.id ? "Retrying…" : "Retry simulation"}
                    </button>}
                    <details className="text-xs">
                      <summary className="cursor-pointer font-semibold text-indigo-700">Attempt history</summary>
                      <div className="mt-2 space-y-2">
                        <p className="break-all text-slate-500">Ref: {transaction.simulatedReference}</p>
                        {transaction.failureCode && <p className="text-rose-700">Failure: {transaction.failureCode}</p>}
                        {transaction.attemptHistory.map((attempt) => <div key={attempt.attemptNumber} className="rounded bg-slate-50 p-2">
                          <p className="font-semibold">Attempt {attempt.attemptNumber} · {attempt.status}</p>
                          <p className="mt-1 text-slate-600">{attempt.message}</p>
                          <p className="mt-1 text-slate-500">{formatDate(attempt.attemptedAt)}</p>
                        </div>)}
                      </div>
                    </details>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <span>{transactionPagination.total} matching transaction record(s) · page {transactionPagination.page} of {Math.max(1, transactionPagination.totalPages)}</span>
            <div className="flex items-center gap-2">
              <button type="button" className={secondaryButton} disabled={transactionPage <= 1 || loadingTransactions} onClick={() => setTransactionPage((page) => Math.max(1, page - 1))}><ChevronLeft size={16} /> Previous</button>
              <button type="button" className={secondaryButton} disabled={transactionPage >= transactionPagination.totalPages || loadingTransactions || transactionPagination.totalPages === 0} onClick={() => setTransactionPage((page) => page + 1)}>Next <ChevronRight size={16} /></button>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">These entries are generated by the simulation adapter only. They are not bank transactions, payment confirmations, or proof of a real salary transfer.</p>
        </section>

        <div className="mt-6 flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          <p>Amounts are illustrative. The simplified formula excludes tax, EPF, statutory deductions, overtime, bonuses and leave proration. Finalization is enforced by the server and requires every employee transaction to have succeeded in simulation.</p>
        </div>
      </section>
    </main>
  );
}
