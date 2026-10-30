import { useEffect, useState } from "react";
import {
  Banknote, CalendarDays, Clock3, Download, Home, LayoutDashboard, LogIn, LogOut, Receipt, Send, ShieldCheck, UserRound
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import api from "../../services/api.js";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

function money(paise) {
  return currency.format((Number(paise) || 0) / 100);
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function responseMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function addDateOnlyDays(dateOnly, amount) {
  if (!dateOnly) return "";
  const value = new Date(dateOnly + "T00:00:00.000Z");
  if (Number.isNaN(value.getTime())) return "";
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
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
    finalized: "bg-emerald-50 text-emerald-700",
    succeeded: "bg-emerald-50 text-emerald-700",
    approved: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-800",
    rejected: "bg-rose-50 text-rose-700",
    failed: "bg-rose-50 text-rose-700"
  };
  return <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + (classes[status] || "bg-slate-100 text-slate-700")}>{status}</span>;
}

const cardClass = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState("overview");
  const [profile, setProfile] = useState(null);
  const [payrollHistory, setPayrollHistory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [unpaidLeaveRequests, setUnpaidLeaveRequests] = useState([]);
  const [loadingLeaveRequests, setLoadingLeaveRequests] = useState(true);
  const [unpaidLeaveError, setUnpaidLeaveError] = useState("");
  const [unpaidLeaveMessage, setUnpaidLeaveMessage] = useState("");
  const [unpaidLeaveStartDate, setUnpaidLeaveStartDate] = useState("");
  const [unpaidLeaveEndDate, setUnpaidLeaveEndDate] = useState("");
  const [unpaidLeaveReason, setUnpaidLeaveReason] = useState("");
  const [submittingUnpaidLeave, setSubmittingUnpaidLeave] = useState(false);
  const [wfhRequests, setWfhRequests] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [businessDate, setBusinessDate] = useState("");
  const [loadingWfh, setLoadingWfh] = useState(true);
  const [wfhError, setWfhError] = useState("");
  const [wfhMessage, setWfhMessage] = useState("");
  const [wfhDate, setWfhDate] = useState("");
  const [wfhReason, setWfhReason] = useState("");
  const [submittingWfh, setSubmittingWfh] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState("");

  useEffect(() => {
    let mounted = true;
    api.get("/employees/me")
      .then((response) => { if (mounted) setProfile(response.data.data); })
      .catch((error) => { if (mounted) setProfileError(responseMessage(error, "Unable to load your employee profile.")); })
      .finally(() => { if (mounted) setLoadingProfile(false); });

    api.get("/payroll/me")
      .then((response) => {
        if (!mounted) return;
        const records = Array.isArray(response.data.data) ? response.data.data : [];
        setPayrollHistory(records);
        setSelectedPayslip((current) => current || records[0] || null);
      })
      .catch((error) => { if (mounted) setHistoryError(responseMessage(error, "Unable to load your finalized payroll history.")); })
      .finally(() => { if (mounted) setLoadingHistory(false); });

    api.get("/transactions/me")
      .then((response) => { if (mounted) setTransactions(Array.isArray(response.data.data) ? response.data.data : []); })
      .catch((error) => { if (mounted) setTransactionError(responseMessage(error, "Unable to load your finalized transaction history.")); })
      .finally(() => { if (mounted) setLoadingTransactions(false); });

    api.get("/unpaid-leave/me")
      .then((response) => { if (mounted) setUnpaidLeaveRequests(Array.isArray(response.data.data) ? response.data.data : []); })
      .catch((error) => { if (mounted) setUnpaidLeaveError(responseMessage(error, "Unable to load your unpaid-leave requests.")); })
      .finally(() => { if (mounted) setLoadingLeaveRequests(false); });

    Promise.all([
      api.get("/wfh/me"),
      api.get("/attendance/me")
    ])
      .then(([wfhResponse, attendanceResponse]) => {
        if (!mounted) return;
        setWfhRequests(Array.isArray(wfhResponse.data.data) ? wfhResponse.data.data : []);
        setAttendanceRecords(Array.isArray(attendanceResponse.data.data) ? attendanceResponse.data.data : []);
        setBusinessDate(wfhResponse.data.businessDate || attendanceResponse.data.businessDate || "");
      })
      .catch((error) => {
        if (mounted) setWfhError(responseMessage(error, "Unable to load WFH requests or attendance."));
      })
      .finally(() => { if (mounted) setLoadingWfh(false); });

    return () => { mounted = false; };
  }, []);

  async function handleLogout() {
    try { await logout(); } catch {
      // The local UI session is cleared even if the API cannot be reached.
    }
  }

  async function submitUnpaidLeaveRequest(event) {
    event.preventDefault();
    setUnpaidLeaveError("");
    setUnpaidLeaveMessage("");
    setSubmittingUnpaidLeave(true);
    try {
      const response = await api.post("/unpaid-leave/range", {
        startDate: unpaidLeaveStartDate,
        endDate: unpaidLeaveEndDate,
        reason: unpaidLeaveReason.trim()
      });
      const result = response.data.data;
      const newRequests = Array.isArray(result?.requests) ? result.requests : [];
      setUnpaidLeaveRequests((current) => [...newRequests, ...current].sort((a, b) => b.date.localeCompare(a.date)));
      setUnpaidLeaveStartDate("");
      setUnpaidLeaveEndDate("");
      setUnpaidLeaveReason("");
      setUnpaidLeaveMessage("Your " + result.workingDays + "-weekday request (" + result.startDate + " to " + result.endDate + ") was submitted for admin approval. It will not affect payroll unless approved before the payroll snapshot is created.");
    } catch (error) {
      setUnpaidLeaveError(responseMessage(error, "Unable to submit the unpaid-leave request."));
    } finally {
      setSubmittingUnpaidLeave(false);
    }
  }

  async function submitWfhRequest(event) {
    event.preventDefault();
    setWfhError("");
    setWfhMessage("");
    setSubmittingWfh(true);
    try {
      const response = await api.post("/wfh", {
        date: wfhDate,
        reason: wfhReason.trim()
      });
      const request = response.data.data;
      setWfhRequests((current) => [request, ...current].sort((a, b) => b.date.localeCompare(a.date)));
      setWfhDate("");
      setWfhReason("");
      setWfhMessage("Your WFH request is pending admin approval. Check-in becomes available only after approval for that date.");
    } catch (error) {
      setWfhError(responseMessage(error, "Unable to submit the WFH request."));
    } finally {
      setSubmittingWfh(false);
    }
  }

  async function recordAttendancePunch(action) {
    setWfhError("");
    setWfhMessage("");
    setAttendanceBusy(action);
    try {
      const response = await api.post("/attendance/" + (action === "check-in" ? "check-in" : "check-out"), {});
      const record = response.data.data;
      setAttendanceRecords((current) => {
        const updated = current.filter((entry) => entry.id !== record.id);
        return [record, ...updated].sort((a, b) => b.date.localeCompare(a.date));
      });
      setBusinessDate(response.data.businessDate || businessDate);
      setWfhMessage(response.data.message || (action === "check-in" ? "Check-in recorded." : "Check-out recorded."));
    } catch (error) {
      setWfhError(responseMessage(error, "Unable to record attendance."));
    } finally {
      setAttendanceBusy("");
    }
  }

  function exportPayrollHistory() {
    const rows = [
      ["Period", "Employee code", "Department", "Base salary INR", "Allowances INR", "Gross pay INR", "Fixed deductions INR", "Unpaid leave days", "Unpaid leave deduction INR", "Total deductions INR", "Net pay INR", "Finalized date"],
      ...payrollHistory.map((record) => [
        record.period,
        record.item.employeeCode,
        record.item.department,
        (record.item.baseSalaryPaise / 100).toFixed(2),
        (record.item.monthlyAllowancesPaise / 100).toFixed(2),
        (record.item.grossPayPaise / 100).toFixed(2),
        ((record.item.fixedMonthlyDeductionsPaise ?? record.item.monthlyDeductionsPaise) / 100).toFixed(2),
        record.item.unpaidLeaveDays || 0,
        ((record.item.unpaidLeaveDeductionPaise || 0) / 100).toFixed(2),
        (record.item.monthlyDeductionsPaise / 100).toFixed(2),
        (record.item.netPayPaise / 100).toFixed(2),
        record.finalizedAt
      ])
    ];
    downloadCsv("my-finalized-payroll-history.csv", rows);
  }

  function exportTransactionHistory() {
    const rows = [
      ["Period", "Amount INR", "Status", "Simulated reference", "Attempts", "Last attempt"],
      ...transactions.map((transaction) => [
        transaction.period,
        (transaction.amountPaise / 100).toFixed(2),
        transaction.status,
        transaction.simulatedReference,
        transaction.attemptCount,
        transaction.lastAttemptAt
      ])
    ];
    downloadCsv("my-simulated-transaction-history.csv", rows);
  }

  const displayedUnpaidLeaveRequests = unpaidLeaveRequests.filter((request, index, all) => {
    const groupKey = request.requestGroupId ? "group:" + request.requestGroupId : "single:" + request.id;
    return all.findIndex((other) => (
      (other.requestGroupId ? "group:" + other.requestGroupId : "single:" + other.id) === groupKey
    )) === index;
  });
  const navigationItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "wfh", label: "WFH & attendance", icon: Home },
    { id: "leave", label: "Unpaid leave", icon: CalendarDays },
    { id: "payslips", label: "Payslips", icon: Receipt },
    { id: "transactions", label: "Transactions", icon: Clock3 }
  ];
  const validLeaveRange = Boolean(
    unpaidLeaveStartDate && unpaidLeaveEndDate &&
    unpaidLeaveStartDate <= unpaidLeaveEndDate &&
    unpaidLeaveStartDate.slice(0, 7) === unpaidLeaveEndDate.slice(0, 7)
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white"><Banknote size={22} aria-hidden="true" /></span>
            <div>
              <p className="font-bold tracking-tight">CloudConduction</p>
              <p className="text-xs text-slate-500">Employee workspace</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to="/change-password" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">Change password</Link>
            <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50" type="button">
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <p className="no-print text-sm font-semibold text-indigo-600">EMPLOYEE OVERVIEW</p>
        <h1 className="no-print mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Your payroll workspace</h1>
        <p className="no-print mt-2 text-sm text-slate-600">{user?.email}</p>

        {loadingProfile && <p className="no-print mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600" role="status">Loading your employee profile…</p>}
        {profileError && <p className="no-print mt-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700" role="alert">{profileError}</p>}

        {profile && (
          <section className={"no-print mt-6 " + cardClass}>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><UserRound size={24} aria-hidden="true" /></span>
              <div>
                <h2 className="text-xl font-semibold">{profile.firstName} {profile.lastName}</h2>
                <p className="mt-1 text-sm text-slate-500">{profile.employeeCode} · {profile.designation}</p>
              </div>
              <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold capitalize text-emerald-700">{profile.employmentStatus}</span>
            </div>
            <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Department</p><p className="mt-1 font-medium">{profile.department}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Work email</p><p className="mt-1 break-all font-medium">{profile.workEmail}</p></div>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-emerald-600" aria-hidden="true" /> Current monthly salary structure (demo)</div>
              <p className="mt-1 text-sm text-slate-500">These are salary inputs, not a processed payslip or a promise of payment.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Base salary</p><p className="mt-2 text-xl font-bold">{money(profile.salaryStructure.baseSalaryPaise)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Monthly allowances</p><p className="mt-2 text-xl font-bold">{money(profile.salaryStructure.monthlyAllowancesPaise)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Fixed monthly deductions</p><p className="mt-2 text-xl font-bold">{money(profile.salaryStructure.monthlyDeductionsPaise)}</p></div>
              </div>
            </div>
          </section>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="no-print rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-6 lg:self-start">
            <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-slate-400">Workspace</p>
            <nav aria-label="Employee workspace" className="flex gap-1 overflow-x-auto lg:flex-col">
              {navigationItems.map((item) => {
                const ItemIcon = item.icon;
                const selected = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    aria-current={selected ? "page" : undefined}
                    className={"flex min-w-max items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition lg:w-full " +
                      (selected ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900")}
                  >
                    <ItemIcon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="mt-4 hidden rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 lg:block">
              Choose a section to view requests, attendance, payslips or transaction records without a long scroll.
            </div>
          </aside>

          <div className="min-w-0">
            {activeSection === "overview" && (
              <section className={"no-print " + cardClass}>
                <p className="text-sm font-semibold text-indigo-600">AT A GLANCE</p>
                <h2 className="mt-2 text-xl font-bold">Welcome to your workspace</h2>
                <p className="mt-1 text-sm text-slate-600">Your profile and monthly salary summary stay visible above. Select a section from the menu to manage requests or review your records.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Finalized payslips</p>
                    <p className="mt-2 text-2xl font-bold">{payrollHistory.length}</p>
                    <button type="button" onClick={() => setActiveSection("payslips")} className="mt-2 text-sm font-semibold text-indigo-700 hover:underline">View payslips</button>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Pending unpaid leave groups</p>
                    <p className="mt-2 text-2xl font-bold">{displayedUnpaidLeaveRequests.filter((request) => request.status === "pending").length}</p>
                    <button type="button" onClick={() => setActiveSection("leave")} className="mt-2 text-sm font-semibold text-indigo-700 hover:underline">Manage leave requests</button>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Pending WFH requests</p>
                    <p className="mt-2 text-2xl font-bold">{wfhRequests.filter((request) => request.status === "pending").length}</p>
                    <button type="button" onClick={() => setActiveSection("wfh")} className="mt-2 text-sm font-semibold text-indigo-700 hover:underline">Open WFH & attendance</button>
                  </div>
                </div>
              </section>
            )}

        <section className={"no-print mt-6 " + cardClass + (activeSection === "wfh" ? "" : " hidden")}>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Home size={20} className="text-indigo-600" aria-hidden="true" /> Work-from-home attendance</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">Request a date within the next 365 days, wait for admin approval, then check in and out on the approved date. Timestamps come from the server.</p>
            </div>
            <div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900">
              Business date: {businessDate || "Loading…"}
            </div>
          </div>
          {wfhError && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{wfhError}</p>}
          {wfhMessage && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{wfhMessage}</p>}
          <form onSubmit={submitWfhRequest} className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Requested WFH date</span>
              <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" type="date" required min={businessDate || undefined} max={addDateOnlyDays(businessDate, 365) || undefined} value={wfhDate} onChange={(event) => setWfhDate(event.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Reason</span>
              <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" type="text" minLength={3} maxLength={240} required value={wfhReason} onChange={(event) => setWfhReason(event.target.value)} placeholder="Brief reason for working from home" />
            </label>
            <button type="submit" disabled={submittingWfh || loadingWfh || !wfhDate || wfhReason.trim().length < 3} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Send size={16} aria-hidden="true" /> {submittingWfh ? "Submitting…" : "Request WFH"}
            </button>
          </form>
          <p className="mt-3 text-xs leading-5 text-slate-500">This demo does not verify physical location. WFH attendance is a server-timestamped application record; it is not proof of where an employee is located. A date cannot be simultaneously reserved for WFH and unpaid leave.</p>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">My WFH requests</h3>
              {loadingWfh && <p className="mt-3 text-sm text-slate-500" role="status">Loading WFH requests and attendance…</p>}
              {!loadingWfh && wfhRequests.length === 0 && <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No WFH requests yet.</p>}
              {!loadingWfh && wfhRequests.length > 0 && <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Admin note</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {wfhRequests.map((request) => <tr key={request.id}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{request.date}</td>
                      <td className="max-w-xs break-words px-3 py-2">{request.reason}</td>
                      <td className="px-3 py-2"><StatusBadge status={request.status} /></td>
                      <td className="max-w-xs break-words px-3 py-2 text-slate-500">{request.decisionNote || "—"}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">My attendance</h3>
                <div className="flex gap-2">
                  <button type="button" className={buttonClass} disabled={loadingWfh || attendanceBusy !== "" || !wfhRequests.some((item) => item.date === businessDate && item.status === "approved") || attendanceRecords.some((item) => item.date === businessDate)} onClick={() => void recordAttendancePunch("check-in")}>
                    <LogIn size={15} aria-hidden="true" /> {attendanceBusy === "check-in" ? "Checking in…" : "Check in"}
                  </button>
                  <button type="button" className={buttonClass} disabled={loadingWfh || attendanceBusy !== "" || !attendanceRecords.some((item) => item.date === businessDate && !item.checkedOutAt)} onClick={() => void recordAttendancePunch("check-out")}>
                    <LogOut size={15} aria-hidden="true" /> {attendanceBusy === "check-out" ? "Checking out…" : "Check out"}
                  </button>
                </div>
              </div>
              {attendanceRecords.length === 0 && !loadingWfh && <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No attendance records for this month.</p>}
              {attendanceRecords.length > 0 && <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Check in</th><th className="px-3 py-2">Check out</th><th className="px-3 py-2">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {attendanceRecords.map((record) => <tr key={record.id}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{record.date}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDateTime(record.checkedInAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDateTime(record.checkedOutAt)}</td>
                      <td className="px-3 py-2"><StatusBadge status={record.status} />{record.correctedBy && <p className="mt-1 text-xs text-slate-500">Corrected: {record.correctionNote}</p>}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
            </div>
          </div>
        </section>

        <section className={"no-print mt-6 " + cardClass + (activeSection === "leave" ? "" : " hidden")}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays size={20} className="text-indigo-600" aria-hidden="true" /> Unpaid-leave requests</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">Select a start and end date in one payroll month. The system counts Monday–Friday dates in that range; the entire range is approved or rejected together.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"><Clock3 size={15} aria-hidden="true" /> Admin approval required</span>
          </div>
          {unpaidLeaveError && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{unpaidLeaveError}</p>}
          {unpaidLeaveMessage && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{unpaidLeaveMessage}</p>}
          <form onSubmit={submitUnpaidLeaveRequest} className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Start date</span>
              <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" type="date" required value={unpaidLeaveStartDate} onChange={(event) => {
                const value = event.target.value;
                setUnpaidLeaveStartDate(value);
                if (unpaidLeaveEndDate && (unpaidLeaveEndDate < value || unpaidLeaveEndDate.slice(0, 7) !== value.slice(0, 7))) setUnpaidLeaveEndDate("");
              }} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">End date</span>
              <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" type="date" required min={unpaidLeaveStartDate || undefined} max={unpaidLeaveStartDate ? new Date(Date.UTC(Number(unpaidLeaveStartDate.slice(0, 4)), Number(unpaidLeaveStartDate.slice(5, 7)), 0)).toISOString().slice(0, 10) : undefined} value={unpaidLeaveEndDate} onChange={(event) => setUnpaidLeaveEndDate(event.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Reason</span>
              <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" type="text" required minLength={3} maxLength={240} value={unpaidLeaveReason} onChange={(event) => setUnpaidLeaveReason(event.target.value)} placeholder="Brief reason for the request" />
            </label>
            <button type="submit" disabled={submittingUnpaidLeave || !validLeaveRange || unpaidLeaveReason.trim().length < 3} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Send size={16} aria-hidden="true" /> {submittingUnpaidLeave ? "Submitting…" : "Submit request"}
            </button>
          </form>
          <p className="mt-3 text-xs leading-5 text-slate-500">Only Monday–Friday dates in the selected range become leave days; weekends are skipped. Requests must stay within one payroll month, and public holidays/custom work schedules are not modeled. A request does not change your pay until an admin approves it and the period is still open; an existing payroll snapshot cannot be silently changed.</p>
          {loadingLeaveRequests && <p className="mt-4 text-sm text-slate-500" role="status">Loading your leave requests…</p>}
          {!loadingLeaveRequests && !unpaidLeaveError && displayedUnpaidLeaveRequests.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No unpaid-leave requests yet.</p>}
          {!loadingLeaveRequests && displayedUnpaidLeaveRequests.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Date range</th><th className="px-3 py-3">Reason</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Admin note</th></tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {displayedUnpaidLeaveRequests.map((request) => <tr key={request.requestGroupId || request.id}>
                  <td className="whitespace-nowrap px-3 py-3 font-medium">{request.rangeStart && request.rangeEnd ? (request.rangeStart === request.rangeEnd ? request.rangeStart : request.rangeStart + " – " + request.rangeEnd) : request.date}</td>
                  <td className="max-w-md px-3 py-3 break-words">{request.reason}</td>
                  <td className="px-3 py-3"><StatusBadge status={request.status} /></td>
                  <td className="max-w-md px-3 py-3 break-words text-sm text-slate-500">{request.decisionNote || "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>

        <section className={"no-print mt-6 " + cardClass + (activeSection === "payslips" ? "" : " hidden")}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Receipt size={20} className="text-indigo-600" aria-hidden="true" /> Finalized pay history</h2>
              <p className="mt-1 text-sm text-slate-500">Only your own finalized payroll snapshots appear here. Draft and approved payroll remain hidden.</p>
            </div>
            <button type="button" disabled={payrollHistory.length === 0} onClick={exportPayrollHistory} className={buttonClass}><Download size={16} aria-hidden="true" /> Export CSV</button>
          </div>
          {historyError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{historyError}</p>}
          {loadingHistory && <p className="mt-4 text-sm text-slate-500" role="status">Loading finalized pay history…</p>}
          {!loadingHistory && !historyError && payrollHistory.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No finalized payroll history yet. Your admin must complete the payroll simulation and finalize the run before a payslip becomes available.</p>}
          {!loadingHistory && payrollHistory.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Period</th><th className="px-4 py-3">Gross pay</th><th className="px-4 py-3">Deductions</th><th className="px-4 py-3 text-right">Net pay</th><th className="px-4 py-3">Finalized</th><th className="px-4 py-3">Payslip</th></tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {payrollHistory.map((record) => <tr key={record.runId} className={selectedPayslip?.runId === record.runId ? "bg-indigo-50/50" : ""}>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">{record.period}</td>
                  <td className="whitespace-nowrap px-4 py-3">{money(record.item.grossPayPaise)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{money(record.item.monthlyDeductionsPaise)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{money(record.item.netPayPaise)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(record.finalizedAt)}</td>
                  <td className="px-4 py-3"><button type="button" className="font-semibold text-indigo-700 hover:underline" onClick={() => setSelectedPayslip(record)}>View payslip</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>

        {activeSection === "payslips" && selectedPayslip && (
          <section className="payroll-payslip mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">CloudConduction · Demo statement</p>
                <h2 className="mt-2 text-2xl font-bold">Payslip · {selectedPayslip.period}</h2>
                <p className="mt-1 text-sm text-slate-500">Finalized on {formatDate(selectedPayslip.finalizedAt)}</p>
              </div>
              <div className="no-print flex flex-wrap gap-2">
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"><Download size={16} aria-hidden="true" /> Print / Save PDF</button>
                <button type="button" className={buttonClass} onClick={() => setSelectedPayslip(null)}>Close</button>
              </div>
            </div>
            <div className="mt-6 grid gap-4 border-y border-slate-200 py-5 sm:grid-cols-2">
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Employee name</p><p className="mt-1 font-semibold">{selectedPayslip.item.employeeName}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Employee code</p><p className="mt-1 font-semibold">{selectedPayslip.item.employeeCode}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Department</p><p className="mt-1 font-semibold">{selectedPayslip.item.department}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Designation</p><p className="mt-1 font-semibold">{selectedPayslip.item.designation}</p></div>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <tr><th className="py-3 text-left font-medium text-slate-600">Base salary</th><td className="py-3 text-right font-semibold tabular-nums">{money(selectedPayslip.item.baseSalaryPaise)}</td></tr>
                  <tr><th className="py-3 text-left font-medium text-slate-600">Monthly allowances</th><td className="py-3 text-right font-semibold tabular-nums">{money(selectedPayslip.item.monthlyAllowancesPaise)}</td></tr>
                  <tr><th className="py-3 text-left font-medium text-slate-600">Gross pay</th><td className="py-3 text-right font-semibold tabular-nums">{money(selectedPayslip.item.grossPayPaise)}</td></tr>
                  <tr><th className="py-3 text-left font-medium text-slate-600">Fixed monthly deductions</th><td className="py-3 text-right font-semibold tabular-nums">− {money(selectedPayslip.item.fixedMonthlyDeductionsPaise ?? selectedPayslip.item.monthlyDeductionsPaise)}</td></tr>
                  {(selectedPayslip.item.unpaidLeaveDays || 0) > 0 && <tr><th className="py-3 text-left font-medium text-slate-600">Unpaid leave ({selectedPayslip.item.unpaidLeaveDays} weekday(s))</th><td className="py-3 text-right font-semibold tabular-nums">− {money(selectedPayslip.item.unpaidLeaveDeductionPaise || 0)}</td></tr>}
                  <tr><th className="py-3 text-left font-semibold text-slate-800">Total deductions</th><td className="py-3 text-right font-semibold tabular-nums">− {money(selectedPayslip.item.monthlyDeductionsPaise)}</td></tr>
                  <tr className="border-t-2 border-slate-300"><th className="py-4 text-left text-base font-bold">Net pay (demo)</th><td className="py-4 text-right text-xl font-bold tabular-nums">{money(selectedPayslip.item.netPayPaise)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">Portfolio demo statement only. This uses a simplified salary formula and excludes income tax, EPF, statutory deductions, overtime, bonuses, public-holiday calendars and custom work schedules. Approved unpaid leave is prorated using this demo&apos;s Monday–Friday divisor. Any related transaction status is simulated; no money is transferred. This statement is not a statutory or tax-compliant payslip.</p>
          </section>
        )}

        <section className={"no-print mt-6 " + cardClass + (activeSection === "transactions" ? "" : " hidden")}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-lg font-semibold">Simulated transaction history</h2>
              <p className="mt-1 text-sm text-slate-500">Transaction records are visible only when their payroll run is finalized and always belong to your employee account.</p>
            </div>
            <button type="button" disabled={transactions.length === 0} onClick={exportTransactionHistory} className={buttonClass}><Download size={16} aria-hidden="true" /> Export CSV</button>
          </div>
          {transactionError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{transactionError}</p>}
          {loadingTransactions && <p className="mt-4 text-sm text-slate-500" role="status">Loading transaction history…</p>}
          {!loadingTransactions && !transactionError && transactions.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No finalized simulated transaction records are available yet.</p>}
          {!loadingTransactions && transactions.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Period</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Last attempt</th></tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {transactions.map((transaction) => <tr key={transaction.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">{transaction.period}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{money(transaction.amountPaise)}</td>
                  <td className="px-4 py-3"><StatusBadge status={transaction.status} /><p className="mt-1 text-xs text-slate-500">Simulation only</p></td>
                  <td className="px-4 py-3 text-center">{transaction.attemptCount}</td>
                  <td className="max-w-48 break-all px-4 py-3 text-xs text-slate-500">{transaction.simulatedReference}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(transaction.lastAttemptAt)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
          <p className="mt-4 text-xs leading-5 text-slate-500">If a finalized run has a failed simulation in this demo, contact the payroll administrator. This record is not proof of a bank transfer.</p>
        </section>
          </div>
        </div>
      </section>
    </main>
  );
}
