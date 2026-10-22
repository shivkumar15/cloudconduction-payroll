import { Activity, Banknote, LogOut, ShieldCheck, Users, UserRoundCog } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";

const metrics = [
  { label: "Total employees", value: "—", note: "Employee count will be connected to the API next", icon: Users },
  { label: "Payroll this month", value: "₹—", note: "No payroll processed yet", icon: Banknote },
  { label: "Simulated transactions", value: "—", note: "Payment engine not configured", icon: Activity }
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    try {
      await logout();
    } catch {
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
              Manage the payroll workflow, employee records and simulated transactions from one workspace.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 sm:self-auto">
            <ShieldCheck size={17} className="text-emerald-600" />
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

        <section className="mt-6 grid gap-4 md:grid-cols-[1.5fr_1fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><UserRoundCog size={22} /></span>
              <div>
                <h2 className="text-lg font-semibold">Employee management</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Create employee records with linked employee logins, manage salary structures, search and filter records, and deactivate access when an employee leaves.</p>
                <Link to="/admin/employees" className="mt-4 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Manage employees</Link>
              </div>
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Demo boundary</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Salary values are synthetic demo data. Statutory tax calculations and real salary transfers are not implemented.</p>
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Payroll totals and transaction cards remain placeholders until later phases.</p>
          </article>
        </section>
      </section>
    </main>
  );
}
