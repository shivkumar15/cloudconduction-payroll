import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, RefreshCw, X, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../services/api.js";

const cardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
const dangerButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50";

function currentPeriod() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

function responseMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

function dateLabel(value) {
  if (!value) return "—";
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" });
}

function StatusBadge({ status }) {
  const classes = {
    pending: "bg-amber-50 text-amber-800",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-rose-50 text-rose-700"
  };
  return <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize " + (classes[status] || "bg-slate-100 text-slate-700")}>{status}</span>;
}

export default function AdminUnpaidLeavePage() {
  const [period, setPeriod] = useState(currentPeriod);
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 100, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/unpaid-leave", {
        params: {
          page: 1,
          pageSize: 100,
          period: period || undefined,
          status: status || undefined
        }
      });
      setRequests(Array.isArray(response.data.data) ? response.data.data : []);
      setPagination(response.data.pagination || { total: 0, page: 1, pageSize: 100, totalPages: 0 });
    } catch (loadError) {
      setError(responseMessage(loadError, "Unable to load unpaid-leave requests."));
      setRequests([]);
      setPagination({ total: 0, page: 1, pageSize: 100, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [period, status]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeoutId = window.setTimeout(() => setNotice(""), 6500);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  async function decideRequest(request, decision) {
    let decisionNote = "";
    if (decision === "reject") {
      const value = window.prompt("Enter a reason for rejecting this unpaid-leave request (3–240 characters):");
      if (value === null) return;
      decisionNote = value.trim();
      if (decisionNote.length < 3 || decisionNote.length > 240) {
        setError("A rejection reason between 3 and 240 characters is required.");
        return;
      }
    }

    setBusyId(request.id);
    setError("");
    setNotice("");
    try {
      const response = await api.post(
        "/unpaid-leave/" + request.id + "/" + decision,
        decision === "reject" ? { decisionNote } : {}
      );
      const data = response.data.data;
      const date = data?.startDate && data?.endDate
        ? (data.startDate === data.endDate ? data.startDate : data.startDate + " – " + data.endDate)
        : data?.date || request.date;
      setNotice(
        decision === "approve"
          ? "Unpaid leave for " + date + " (" + (data?.workingDays || 1) + " weekday(s)) was approved. It is included in the payroll calculation only if the period is still open."
          : "Unpaid leave for " + date + " was rejected. It will not affect payroll."
      );
      await loadRequests();
    } catch (decisionError) {
      setError(responseMessage(decisionError, "Unable to update the unpaid-leave request."));
    } finally {
      setBusyId("");
    }
  }

  const displayedRequests = requests.filter((request, index, all) => {
    const groupKey = request.requestGroupId ? "group:" + request.requestGroupId : "single:" + request.id;
    return all.findIndex((other) => (
      (other.requestGroupId ? "group:" + other.requestGroupId : "single:" + other.id) === groupKey
    )) === index;
  });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-indigo-600">
            <ArrowLeft size={17} aria-hidden="true" /> Back to dashboard
          </Link>
          <span className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-amber-800">
            <Clock3 size={14} aria-hidden="true" /> Approval required
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <p className="text-sm font-semibold text-indigo-600">PHASE 6.5 · PAYROLL INPUTS</p>
        <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Unpaid-leave requests</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Review employee requests before creating the payroll snapshot. Pending requests block run creation; decisions are locked after a run exists.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 md:max-w-lg">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Payroll period</span>
              <input className={fieldClass} type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Status</span>
              <select className={fieldClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>
        </div>

        {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}</div>}
        {notice && (
          <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:justify-end sm:px-6">
            <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-sm text-emerald-900 shadow-2xl" role="status" aria-live="polite">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={19} aria-hidden="true" />
              <p className="min-w-0 flex-1">{notice}</p>
              <button type="button" className={buttonClass} onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={16} /></button>
            </div>
          </div>
        )}

        <div className={"mt-6 " + cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Requests</h2>
              <p className="mt-1 text-sm text-slate-500">{displayedRequests.length} request range(s) shown; {pagination.total} weekday record(s) match the filters.</p>
            </div>
            <button type="button" className={buttonClass} onClick={() => void loadRequests()} disabled={loading}>
              <RefreshCw size={15} aria-hidden="true" /> {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            This demo counts Monday–Friday dates as working days; public holidays and custom employee schedules are not modeled. Review the exact date before approval. A saved payroll run locks that month, and the server will reject late decisions.
          </div>

          {loading && <p className="mt-4 text-sm text-slate-500" role="status">Loading leave requests…</p>}
          {!loading && !error && requests.length === 0 && (
            <div className="mt-4 rounded-xl bg-slate-50 p-8 text-center">
              <CalendarDays size={26} className="mx-auto text-slate-400" aria-hidden="true" />
              <p className="mt-3 font-semibold">No requests found</p>
              <p className="mt-1 text-sm text-slate-500">Try another period or status filter.</p>
            </div>
          )}
          {!loading && requests.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Employee</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Reason</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Admin note</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {displayedRequests.map((request) => (
                    <tr key={request.id} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold">{request.employee?.firstName} {request.employee?.lastName}</p>
                        <p className="text-xs text-slate-500">{request.employee?.employeeCode} · {request.employee?.department}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">{request.rangeStart && request.rangeEnd ? (request.rangeStart === request.rangeEnd ? dateLabel(request.rangeStart) : dateLabel(request.rangeStart) + " – " + dateLabel(request.rangeEnd)) : dateLabel(request.date)}</td>
                      <td className="max-w-sm break-words px-3 py-3">{request.reason}</td>
                      <td className="px-3 py-3"><StatusBadge status={request.status} /></td>
                      <td className="max-w-xs break-words px-3 py-3 text-slate-500">{request.decisionNote || "—"}</td>
                      <td className="min-w-44 px-3 py-3">
                        {request.status === "pending" ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className={primaryButton} disabled={busyId !== ""} onClick={() => void decideRequest(request, "approve")}>
                              <CheckCircle2 size={14} aria-hidden="true" /> {busyId === request.id ? "Saving…" : "Approve"}
                            </button>
                            <button type="button" className={dangerButton} disabled={busyId !== ""} onClick={() => void decideRequest(request, "reject")}>
                              <XCircle size={14} aria-hidden="true" /> Reject
                            </button>
                          </div>
                        ) : <span className="text-xs text-slate-500">Decision recorded</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
