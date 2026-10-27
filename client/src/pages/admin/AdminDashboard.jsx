import { useEffect, useState } from "react";
import { Activity, ArrowRight, Banknote, CalendarDays, ClipboardCheck, LogOut, ShieldCheck, Users, UserCog, Wallet, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../services/api.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

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

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [employeeCount, setEmployeeCount] = useState(null);
  const [currentPayroll, setCurrentPayroll] = useState(null);
  const [transactionCount, setTransactionCount] = useState(null);
  const [failedTransactionCount, setFailedTransactionCount] = useState(null);

  useEffect(() => {
    let mounted = true;
    const period = currentPeriod();

    api.get("/employees", { params: { page: 1, pageSize: 1 } })
      .then((response) => { if (mounted) setEmployeeCount(response.data.pagination.total); })
      .catch(() => { if (mounted) setEmployeeCount(null); });

    api.get("/payroll", { params: { page: 1, pageSize: 100 } })
      .then((response) => {
        if (!mounted) return;
        const runs = Array.isArray(response.data.data) ? response.data.data : [];
        setCurrentPayroll(runs.find((run) => run.period === period) || null);
      })
      .catch(() => { if (mounted) setCurrentPayroll(null); });

    api.get("/transactions", { params: { page: 1, pageSize: 1, period } })
      .then((response) => { if (mounted) setTransactionCount(response.data.pagination.total); })
      .catch(() => { if (mounted) setTransactionCount(null); });

    api.get("/transactions", { params: { page: 1, pageSize: 1, period, status: "failed" } })
      .then((response) => { if (mounted) setFailedTransactionCount(response.data.pagination.total); })
      .catch(() => { if (mounted) setFailedTransactionCount(null); });

    return () => { mounted = false; };
  }, []);

  const metrics = [
    {
      label: "Total employees",
      value: employeeCount === null ? "—" : String(employeeCount),
      note: employeeCount === null ? "Unable to load employee count" : "From saved employee records",
      icon: Users
    },
    {
      label: "Current-month net payroll",
      value: currentPayroll ? money(currentPayroll.totalNetPayPaise) : "—",
      note: currentPayroll ? currentPayroll.period + " · " + currentPayroll.status : "No saved payroll run for " + currentPeriod(),
      icon: Banknote
    },
    {
      label: "Simulated transactions",
      value: transactionCount === null ? "—" : String(transactionCount),
      note: transactionCount === null ? "Unable to load transactions" : "Records for " + currentPeriod(),
      icon: Activity
    }
  ];

  async function handleLogout() {
    try { await logout(); } catch {
      // The local UI session is cleared even if the API cannot be reached.
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white">
              <Banknote size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="font-bold tracking-tight">CloudConduction</p>
              <p className="text-xs text-slate-500">Admin workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-56 truncate text-sm font-medium">{user?.email}</p>
              <p className="text-xs capitalize text-slate-500">{user?.role}</p>
            </div>
            <Link to="/change-password" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">Change password</Link>
            <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50" type="button">
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-indigo-600">ADMIN OVERVIEW</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Payroll dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Review saved payroll totals, manage employee records and operate the simulated payroll workflow.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 sm:self-auto">
            <ShieldCheck size={17} className="text-emerald-600" aria-hidden="true" />
            Authenticated admin
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {metrics.map(({ label, value, note, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-600">{label}</span>
                <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Icon size={20} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-5 text-3xl font-bold tracking-tight">{value}</p>
              <p className="mt-2 text-sm text-slate-500">{note}</p>
            </article>
          ))}
        </div>

        {failedTransactionCount > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p>{failedTransactionCount} failed simulated transaction(s) exist for {currentPeriod()}.</p>
            <Link to="/admin/payroll" className="inline-flex items-center gap-2 font-semibold underline">Review and retry <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Wallet size={22} aria-hidden="true" /></span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">Payroll & simulated transactions</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Preview a period, create and approve a payroll snapshot, simulate payment outcomes, retry failed simulation attempts and finalize the run.</p>
                <Link to="/admin/payroll" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Open payroll workspace <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><UserCog size={22} aria-hidden="true" /></span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">Employee management</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Create employee records and linked logins, maintain salary inputs, search and filter records, and deactivate/reactivate access.</p>
                <Link to="/admin/employees" className="mt-4 inline-flex rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Manage employees</Link>
              </div>
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-800"><CalendarDays size={22} aria-hidden="true" /></span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">Unpaid-leave approvals</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Review employee leave requests, approve or reject with a decision trail, and resolve pending requests before creating payroll snapshots.</p>
                <Link to="/admin/unpaid-leave" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Review requests <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><ClipboardCheck size={22} aria-hidden="true" /></span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">WFH & attendance</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Approve work-from-home requests, review server-timestamped attendance, and record an audited correction for a missed check-out.</p>
                <Link to="/admin/wfh" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Review attendance <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Sparkles size={22} aria-hidden="true" /></span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">AI Payroll Insights</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Review aggregate payroll trends and advisory warnings. The feature never changes salary values, approvals or simulated transaction statuses.</p>
                <Link to="/admin/payroll-insights" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Review insights <ArrowRight size={15} aria-hidden="true" /></Link>
              </div>
            </div>
          </article>
        </div>

        <p className="mt-6 text-xs leading-5 text-slate-500">This is a portfolio demo using synthetic salary data. The salary formula is simplified and payment outcomes are simulated; no money is transferred. The dashboard metrics are fetched from stored employee, payroll and transaction records rather than placeholder numbers.</p>
      </section>
    </main>
  );
}
