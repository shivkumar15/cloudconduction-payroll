import { useState } from "react";
import { ArrowLeft, Banknote, CheckCircle2, CircleAlert, Eye, EyeOff, LoaderCircle, MailCheck, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../services/api.js";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleRequestCode(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data } = await api.post("/auth/password-reset/request", { email: normalizedEmail });
      setEmail(normalizedEmail);
      setNotice(data.message || "If an active account exists for that email, a reset code will be sent.");
      setStep("confirm");
    } catch (requestError) {
      if (requestError?.response?.status === 503) {
        setError("Email password reset is not configured on this server. The application owner must configure SMTP settings first.");
      } else {
        setError("We could not start the password reset. Please check the email and try again later.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmReset(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (newPassword.length < 12) {
      setError("Choose a new password with at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.post("/auth/password-reset/confirm", {
        email: email.trim().toLowerCase(),
        otp,
        newPassword
      });
      setNotice(data.message || "Password reset successfully.");
      setStep("done");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      const status = requestError?.response?.status;
      if (status === 400) {
        setError(requestError.response.data?.message || "The code is invalid or expired. Request a new code.");
      } else if (status === 429) {
        setError("Too many attempts. Wait before trying again.");
      } else {
        setError("The password could not be reset right now. Please try again later.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-slate-950 p-10 text-white lg:flex xl:p-14">
        <Link to="/login" className="flex w-fit items-center gap-3" aria-label="Back to sign in">
          <span className="grid size-11 place-items-center rounded-xl bg-indigo-500">
            <Banknote size={23} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-bold tracking-tight">CloudConduction</span>
            <span className="block text-xs text-slate-400">Payroll workspace</span>
          </span>
        </Link>
        <div className="max-w-lg pb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">Account recovery</p>
          <h1 className="mt-5 text-4xl font-bold leading-tight xl:text-5xl">Secure access starts with you.</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            Reset codes expire after 10 minutes and can be used only once. Never share a code with anyone.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-slate-300">
            <ShieldCheck size={18} className="text-emerald-400" />
            Password reset by email OTP
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
            {step === "email" && (
              <>
                <div className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <MailCheck size={22} aria-hidden="true" />
                </div>
                <h2 className="mt-5 text-2xl font-bold tracking-tight">Reset your password</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Enter your account email. If it belongs to an active account, we will send a one-time code.
                </p>
                <form className="mt-7 space-y-5" onSubmit={handleRequestCode}>
                  <div>
                    <label htmlFor="reset-email" className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
                    <input
                      id="reset-email"
                      type="email"
                      autoComplete="username"
                      maxLength={254}
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                      placeholder="you@company.com"
                    />
                  </div>
                  <Feedback error={error} notice={notice} />
                  <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60">
                    {busy && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
                    {busy ? "Sending code…" : "Send reset code"}
                  </button>
                </form>
              </>
            )}

            {step === "confirm" && (
              <>
                <div className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <MailCheck size={22} aria-hidden="true" />
                </div>
                <h2 className="mt-5 text-2xl font-bold tracking-tight">Enter your reset code</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Enter the 6-digit code sent to <span className="font-medium text-slate-800">{email}</span>. It expires in 10 minutes.
                </p>
                <form className="mt-7 space-y-5" onSubmit={handleConfirmReset}>
                  <div>
                    <label htmlFor="reset-otp" className="mb-2 block text-sm font-medium text-slate-700">Email code</label>
                    <input
                      id="reset-otp"
                      name="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-lg tracking-[0.3em] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                      placeholder="000000"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-slate-700">New password</label>
                    <div className="relative">
                      <input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-3 pr-12 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                        placeholder="At least 12 characters"
                      />
                      <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide new password" : "Show new password"} aria-pressed={showPassword} className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-slate-500 hover:text-indigo-600">
                        {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-700">Confirm new password</label>
                    <div className="relative">
                      <input
                        id="confirm-password"
                        type={showConfirm ? "text" : "password"}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-3 pr-12 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                        placeholder="Enter the password again"
                      />
                      <button type="button" onClick={() => setShowConfirm((current) => !current)} aria-label={showConfirm ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirm} className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-slate-500 hover:text-indigo-600">
                        {showConfirm ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                  <Feedback error={error} notice={notice} />
                  <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60">
                    {busy && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
                    {busy ? "Resetting password…" : "Reset password"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => { setStep("email"); setOtp(""); setError(""); setNotice(""); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <ArrowLeft size={16} aria-hidden="true" /> Use a different email
                  </button>
                </form>
              </>
            )}

            {step === "done" && (
              <div className="text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 size={25} aria-hidden="true" />
                </div>
                <h2 className="mt-5 text-2xl font-bold tracking-tight">Password updated</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{notice}</p>
                <Link to="/login" className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700">
                  Back to sign in
                </Link>
              </div>
            )}
          </div>

          <p className="mt-5 text-center text-sm text-slate-500">
            <Link to="/login" className="inline-flex items-center gap-2 font-medium text-indigo-600 hover:text-indigo-700">
              <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function Feedback({ error, notice }) {
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
        <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }
  if (notice) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{notice}</span>
      </div>
    );
  }
  return null;
}
