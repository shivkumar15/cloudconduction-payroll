import { useState } from "react";
import { ArrowLeft, Banknote, CircleAlert, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../services/api.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const fieldClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 pr-12 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  placeholder,
  minLength = 1
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={128}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClass}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "Hide " + label.toLowerCase() : "Show " + label.toLowerCase()}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 inline-flex items-center justify-center rounded-r-xl px-3 text-slate-500 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (newPassword.length < 12) {
      setError("Choose a new password with at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("Choose a new password that differs from your current password.");
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.post("/auth/change-password", {
        currentPassword,
        newPassword
      });
      updateUser(data.user);
      navigate(data.user.role === "admin" ? "/admin" : "/employee", { replace: true });
    } catch (requestError) {
      const status = requestError?.response?.status;
      if (status === 400) {
        setError(requestError.response.data?.message || "The current password is incorrect or the new password is invalid.");
      } else if (status === 409) {
        setError("Your session changed. Please sign in again and retry.");
      } else {
        setError("Unable to change the password right now. Please try again.");
      }
    } finally {
      setBusy(false);
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
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">Protect your account</p>
          <h1 className="mt-5 text-4xl font-bold leading-tight xl:text-5xl">Your password belongs to you.</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            Use a private password that only you know. The administrator does not need to know your final password.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-slate-300">
            <ShieldCheck size={18} className="text-emerald-400" />
            Passwords are stored as secure hashes
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
            <p className="text-sm font-semibold text-indigo-600">
              {user?.mustChangePassword ? "FIRST SIGN-IN SECURITY" : "ACCOUNT SECURITY"}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">
              {user?.mustChangePassword ? "Set your personal password" : "Change your password"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {user?.mustChangePassword
                ? "Your administrator provided a temporary password. Change it now before accessing the workspace."
                : "Enter your current password and choose a new one that only you know."}
            </p>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
              <PasswordField
                id="current-password"
                label={user?.mustChangePassword ? "Temporary password from admin" : "Current password"}
                value={currentPassword}
                onChange={setCurrentPassword}
                visible={showCurrent}
                onToggle={() => setShowCurrent((current) => !current)}
                autoComplete="current-password"
                placeholder="Enter your current password"
              />
              <PasswordField
                id="new-password"
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                visible={showNew}
                onToggle={() => setShowNew((current) => !current)}
                autoComplete="new-password"
                placeholder="At least 12 characters"
                minLength={12}
              />
              <PasswordField
                id="confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                visible={showConfirm}
                onToggle={() => setShowConfirm((current) => !current)}
                autoComplete="new-password"
                placeholder="Enter the new password again"
                minLength={12}
              />

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
                  <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
                {busy ? "Changing password…" : "Save new password"}
              </button>
              {!user?.mustChangePassword && (
                <div className="text-center">
                  <Link to={user?.role === "admin" ? "/admin" : "/employee"} className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                    <ArrowLeft size={16} aria-hidden="true" /> Back to workspace
                  </Link>
                </div>
              )}
            </form>

            <p className="mt-5 text-xs leading-5 text-slate-500">
              The change invalidates your other active sessions. This browser receives a new session so you can continue securely.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
