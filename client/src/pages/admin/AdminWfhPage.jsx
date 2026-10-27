import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock3, RefreshCw, X, XCircle, ClipboardCheck
} from "lucide-react";
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

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" });
}

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) + " IST";
}

function localInputToIndiaIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    throw new Error("Enter a valid date and time in India time.");
  }
  const withSeconds = value.length === 16 ? value + ":00" : value;
  const parsed = new Date(withSeconds + "+05:30");
  if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid India date and time.");
  return parsed.toISOString();
}

function StatusBadge({ status }) {
  const classes = {
    pending: "bg-amber-50 text-amber-800",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-rose-50 text-rose-700",
    checked_in: "bg-amber-50 text-amber-800",
    completed: "bg-emerald-50 text-emerald-700",
    corrected: "bg-indigo-50 text-indigo-700"
  };
  return <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + (classes[status] || "bg-slate-100 text-slate-700")}>{status.replaceAll("_", " ")}</span>;
}

export default function AdminWfhPage() {
  const [period, setPeriod] = useState(currentPeriod);
  const [requestStatus, setRequestStatus] = useState("pending");
  const [attendanceStatus, setAttendanceStatus] = useState("");
  const [requests, setRequests] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [requestTotal, setRequestTotal] = useState(0);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [correctedCheckout, setCorrectedCheckout] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionError, setCorrectionError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [requestResponse, attendanceResponse] = await Promise.all([
        api.get("/wfh", { params: { page: 1, pageSize: 100, period: period || undefined, status: requestStatus || undefined } }),
        api.get("/attendance", { params: { page: 1, pageSize: 100, period: period || undefined, status: attendanceStatus || undefined } })
      ]);
      setRequests(Array.isArray(requestResponse.data.data) ? requestResponse.data.data : []);
      setAttendance(Array.isArray(attendanceResponse.data.data) ? attendanceResponse.data.data : []);
      setRequestTotal(requestResponse.data.pagination?.total || 0);
      setAttendanceTotal(attendanceResponse.data.pagination?.total || 0);
    } catch (loadError) {
      setError(responseMessage(loadError, "Unable to load WFH requests and attendance."));
      setRequests([]);
      setAttendance([]);
      setRequestTotal(0);
      setAttendanceTotal(0);
    } finally {
      setLoading(false);
    }
  }, [period, requestStatus, attendanceStatus]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeoutId = window.setTimeout(() => setNotice(""), 6500);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  async function decideRequest(request, decision) {
    let decisionNote = "";
    if (decision === "reject") {
      const value = window.prompt("Enter a reason for rejecting this WFH request (3–240 characters):");
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
        "/wfh/" + request.id + "/" + decision,
        decision === "reject" ? { decisionNote } : {}
      );
      setNotice(decision === "approve"
        ? "WFH request for " + response.data.data.date + " approved."
        : "WFH request for " + response.data.data.date + " rejected. The date is available for another request type.");
      await loadData();
    } catch (decisionError) {
      setError(responseMessage(decisionError, "Unable to update the WFH request."));
    } finally {
      setBusyId("");
    }
  }

  function openCorrection(record) {
    setCorrectionTarget(record);
    setCorrectedCheckout("");
    setCorrectionReason("");
    setCorrectionError("");
  }

  async function submitCorrection(event) {
    event.preventDefault();
    if (!correctionTarget) return;
    setCorrectionError("");
    setError("");
    if (!correctedCheckout || correctionReason.trim().length < 3) {
      setCorrectionError("Enter the corrected checkout time in India time and a reason of at least 3 characters.");
      return;
    }

    setBusyId(correctionTarget.id);
    try {
      let checkedOutAt;
      try {
        checkedOutAt = localInputToIndiaIso(correctedCheckout);
      } catch (parseError) {
        setCorrectionError(parseError.message);
        setBusyId("");
        return;
      }
      const response = await api.post("/attendance/" + correctionTarget.id + "/correct-checkout", {
        checkedOutAt,
        reason: correctionReason.trim()
      });
      const updated = response.data.data;
      setAttendance((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setNotice("Attendance checkout corrected and audit note recorded.");
      setCorrectionTarget(null);
      setCorrectedCheckout("");
      setCorrectionReason("");
      await loadData();
    } catch (correctionFailure) {
      setCorrectionError(responseMessage(correctionFailure, "Unable to correct the attendance record."));
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-indigo-600">
            <ArrowLeft size={17} aria-hidden="true" /> Back to dashboard
          </Link>
          <span className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-800">
            <ClipboardCheck size={14} aria-hidden="true" /> WFH attendance
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold text-indigo-600">PHASE 6.6 · EMPLOYEE ATTENDANCE</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">WFH requests & attendance</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Approve date-specific WFH requests and review server-recorded check-ins/check-outs. This workflow does not verify physical location.</p>
          </div>
          <label className="block w-full max-w-xs">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Period</span>
            <input className={fieldClass} type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </label>
        </div>

        {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}</div>}
        {notice && (
          <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:justify-end sm:px-6">
            <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-sm text-emerald-900 shadow-2xl" role="status" aria-live="polite">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={19} aria-hidden="true" />
              <p className="min-w-0 flex-1">{notice}</p>
              <button type="button" className={buttonClass} onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={16} aria-hidden="true" /></button>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <article className={cardClass}><p className="text-sm text-slate-500">Matching requests</p><p className="mt-2 text-3xl font-bold">{loading ? "…" : requestTotal}</p></article>
          <article className={cardClass}><p className="text-sm text-slate-500">Attendance records</p><p className="mt-2 text-3xl font-bold">{loading ? "…" : attendanceTotal}</p></article>
          <article className={cardClass}><p className="text-sm text-slate-500">Open check-outs shown</p><p className="mt-2 text-3xl font-bold">{loading ? "…" : attendance.filter((item) => !item.checkedOutAt).length}</p></article>
        </div>

        <section className={"mt-6 " + cardClass}>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-lg font-semibold">WFH requests</h2>
              <p className="mt-1 text-sm text-slate-500">Approve or reject pending requests. Approvals are only possible before the requested business date and before its payroll period is locked.</p>
            </div>
            <label className="block w-full max-w-xs">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Request status</span>
              <select className={fieldClass} value={requestStatus} onChange={(event) => setRequestStatus(event.target.value)}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>
          {loading && <p className="mt-4 text-sm text-slate-500" role="status">Loading WFH requests…</p>}
          {!loading && requests.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">No WFH requests match this period and status.</p>}
          {!loading && requests.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Employee</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Reason</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Decision note</th><th className="px-3 py-3">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {requests.map((request) => <tr key={request.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3"><p className="font-semibold">{request.employee?.firstName} {request.employee?.lastName}</p><p className="text-xs text-slate-500">{request.employee?.employeeCode} · {request.employee?.department}</p></td>
                  <td className="whitespace-nowrap px-3 py-3">{formatDate(request.date)}</td>
                  <td className="max-w-sm break-words px-3 py-3">{request.reason}</td>
                  <td className="px-3 py-3"><StatusBadge status={request.status} /></td>
                  <td className="max-w-xs break-words px-3 py-3 text-slate-500">{request.decisionNote || "—"}</td>
                  <td className="min-w-44 px-3 py-3">
                    {request.status === "pending" ? <div className="flex flex-wrap gap-2">
                      <button type="button" className={primaryButton} disabled={busyId !== ""} onClick={() => void decideRequest(request, "approve")}><CheckCircle2 size={14} aria-hidden="true" /> {busyId === request.id ? "Saving…" : "Approve"}</button>
                      <button type="button" className={dangerButton} disabled={busyId !== ""} onClick={() => void decideRequest(request, "reject")}><XCircle size={14} aria-hidden="true" /> Reject</button>
                    </div> : <span className="text-xs text-slate-500">Decision recorded</span>}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>

        <section className={"mt-6 " + cardClass}>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-lg font-semibold">Attendance records</h2>
              <p className="mt-1 text-sm text-slate-500">Server timestamps are displayed in Asia/Kolkata. Admin corrections require a reason and are permanently marked in the record.</p>
            </div>
            <div className="flex items-end gap-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Attendance status</span>
                <select className={fieldClass} value={attendanceStatus} onChange={(event) => setAttendanceStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="checked_in">Checked in</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <button type="button" className={buttonClass} onClick={() => void loadData()} disabled={loading}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>
            </div>
          </div>
          {loading && <p className="mt-4 text-sm text-slate-500" role="status">Loading attendance…</p>}
          {!loading && attendance.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">No attendance records for this period.</p>}
          {!loading && attendance.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Employee</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Check in (IST)</th><th className="px-3 py-3">Check out (IST)</th><th className="px-3 py-3">Status / correction</th><th className="px-3 py-3">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {attendance.map((record) => <tr key={record.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3"><p className="font-semibold">{record.employee?.firstName} {record.employee?.lastName}</p><p className="text-xs text-slate-500">{record.employee?.employeeCode} · {record.employee?.department}</p></td>
                  <td className="whitespace-nowrap px-3 py-3">{formatDate(record.date)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatDateTime(record.checkedInAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatDateTime(record.checkedOutAt)}</td>
                  <td className="min-w-48 px-3 py-3"><StatusBadge status={record.status} />{record.correctedBy && <p className="mt-1 max-w-xs break-words text-xs text-slate-500">{record.correctionNote} · corrected {formatDateTime(record.correctedAt)}</p>}</td>
                  <td className="px-3 py-3">{!record.checkedOutAt && <button type="button" className={primaryButton} disabled={busyId !== ""} onClick={() => openCorrection(record)}>Correct checkout</button>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>
      </section>

      {correctionTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4">
          <form onSubmit={submitCorrection} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" aria-labelledby="attendance-correction-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="attendance-correction-title" className="text-lg font-semibold">Correct missed checkout</h2>
                <p className="mt-1 text-sm text-slate-500">{correctionTarget.employee?.firstName} {correctionTarget.employee?.lastName} · {formatDate(correctionTarget.date)}</p>
              </div>
              <button type="button" className={buttonClass} onClick={() => setCorrectionTarget(null)} aria-label="Cancel correction"><X size={16} /></button>
            </div>
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
              Enter the actual check-out time in India Standard Time. The server validates that it is after check-in, not in the future, and on the same India business date. The audit note records that this was an administrator correction.
            </div>
            {correctionError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{correctionError}</p>}
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium">Corrected check-out (IST)</span>
              <input className={fieldClass} type="datetime-local" step="1" required value={correctedCheckout} onChange={(event) => setCorrectedCheckout(event.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium">Reason for correction</span>
              <textarea className={fieldClass} rows={3} minLength={3} maxLength={240} required value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Why is this check-out being corrected?" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={buttonClass} onClick={() => setCorrectionTarget(null)}>Cancel</button>
              <button type="submit" className={primaryButton} disabled={busyId !== ""}>{busyId === correctionTarget.id ? "Saving…" : "Save correction"}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
