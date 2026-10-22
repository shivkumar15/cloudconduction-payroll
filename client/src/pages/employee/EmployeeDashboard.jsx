import { Banknote, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";

export default function EmployeeDashboard() {
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
              <p className="text-xs text-slate-500">Employee workspace</p>
            </div>
          </div>
          <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50" type="button">
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-10 lg:px-8">
        <p className="text-sm font-semibold text-indigo-600">EMPLOYEE OVERVIEW</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome to your payroll workspace</h1>
        <p className="mt-2 text-sm text-slate-600">{user?.email}</p>
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck size={18} className="text-emerald-600" aria-hidden="true" />
            Your session is authenticated
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Your own profile, salary history and payslips will appear here after employee records are implemented. Access to other employees’ records will be blocked by the API.
          </p>
        </section>
      </section>
    </main>
  );
}
