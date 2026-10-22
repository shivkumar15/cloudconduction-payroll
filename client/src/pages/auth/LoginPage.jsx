import { useState } from "react";
import { Banknote, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!loading && user) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/employee"} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const signedInUser = await login({ email: normalizedEmail, password });
      const fallback = signedInUser.role === "admin" ? "/admin" : "/employee";
      const requestedPath = location.state?.from?.pathname;
      const safePath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
        ? requestedPath
        : fallback;

      navigate(safePath, { replace: true });
    } catch {
      setError("Unable to sign in with those details. Check your email and password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-slate-950 p-10 text-white lg:flex xl:p-14">
        <Link to="/" className="flex w-fit items-center gap-3" aria-label="CloudConduction Payroll home">
          <span className="grid size-11 place-items-center rounded-xl bg-indigo-500">
            <Banknote size={23} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-bold tracking-tight">CloudConduction</span>
            <span className="block text-xs text-slate-400">Payroll workspace</span>
          </span>
        </Link>
        <div className="max-w-lg pb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">Payroll, made clear</p>
          <h1 className="mt-5 text-4xl font-bold leading-tight xl:text-5xl">
            One workspace for payroll and people.
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            Manage employee records, review payroll activity, and understand salary costs through a clear dashboard.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-slate-300">
            <ShieldCheck size={18} className="text-emerald-400" />
            Demo environment · simulated payments only
          </div>
        </div>
        <p className="text-xs text-slate-500">CloudConduction Payroll · Portfolio project</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-xl bg-indigo-600 text-white">
              <Banknote size={23} aria-hidden="true" />
            </span>
            <div>
              <p className="font-bold tracking-tight">CloudConduction</p>
              <p className="text-xs text-slate-500">Payroll workspace</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-indigo-600">WELCOME BACK</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Sign in to your account</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use the account provisioned for your role. Public registration is disabled.
            </p>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  maxLength={254}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  placeholder="Enter your password"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
                  <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-slate-500">
            Demo application only. No real payments are made.
          </p>
        </div>
      </section>
    </main>
  );
}
