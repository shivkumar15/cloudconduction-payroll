import { useEffect, useState } from "react";
import { Banknote, LogOut, ShieldCheck, UserRound } from "lucide-react";
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

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    let mounted = true;
    api.get("/employees/me")
      .then((response) => {
        if (mounted) setProfile(response.data.data);
      })
      .catch((error) => {
        if (mounted) setProfileError(error?.response?.data?.message || "Unable to load your employee profile.");
      })
      .finally(() => {
        if (mounted) setLoadingProfile(false);
      });
    return () => { mounted = false; };
  }, []);

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
          <div className="flex items-center gap-2">
            <Link to="/change-password" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">Change password</Link>
          <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50" type="button">
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-10 lg:px-8">
        <p className="text-sm font-semibold text-indigo-600">EMPLOYEE OVERVIEW</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Your employee profile</h1>
        <p className="mt-2 text-sm text-slate-600">{user?.email}</p>

        {loadingProfile && <p className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600" role="status">Loading your profile…</p>}
        {profileError && <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700" role="alert">{profileError}</p>}

        {profile && (
          <>
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><UserRound size={24} /></span>
                <div>
                  <h2 className="text-xl font-semibold">{profile.firstName} {profile.lastName}</h2>
                  <p className="mt-1 text-sm text-slate-500">{profile.employeeCode} · {profile.designation}</p>
                </div>
                <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{profile.employmentStatus}</span>
              </div>
              <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
                <div><p className="text-xs uppercase tracking-wide text-slate-500">Department</p><p className="mt-1 font-medium">{profile.department}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-500">Work email</p><p className="mt-1 break-all font-medium">{profile.workEmail}</p></div>
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-emerald-600" /> Monthly salary structure (demo)</div>
              <p className="mt-1 text-sm text-slate-500">These are salary inputs, not a processed payslip or a promise of payment.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Base salary</p><p className="mt-2 text-xl font-bold">{money(profile.salaryStructure.baseSalaryPaise)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Allowances</p><p className="mt-2 text-xl font-bold">{money(profile.salaryStructure.monthlyAllowancesPaise)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Deductions</p><p className="mt-2 text-xl font-bold">{money(profile.salaryStructure.monthlyDeductionsPaise)}</p></div>
              </div>
            </section>
          </>
        )}

        <p className="mt-5 text-xs leading-5 text-slate-500">You can see only your own employee profile. Payroll history and payslips will be added in later phases.</p>
      </section>
    </main>
  );
}
