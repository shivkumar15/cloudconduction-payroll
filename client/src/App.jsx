import { Activity, ArrowUpRight, Banknote, Users, ShieldCheck } from "lucide-react";

const metrics = [
  { label: "Total employees", value: "—", note: "Connect employee records", icon: Users },
  { label: "Payroll this month", value: "₹—", note: "No payroll processed yet", icon: Banknote },
  { label: "Transactions", value: "—", note: "Simulated payments only", icon: Activity }
];

export default function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white">
              <Banknote size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="font-bold tracking-tight">CloudConduction</p>
              <p className="text-xs text-slate-500">Payroll workspace</p>
            </div>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Demo environment
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-indigo-600">OVERVIEW</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Payroll dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              A single workspace for employee records, payroll calculations, and simulated payment tracking.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 sm:self-auto">
            <ShieldCheck size={17} className="text-emerald-600" />
            Secure API foundation
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {metrics.map(({ label, value, note, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
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

        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-600">
            <ArrowUpRight size={22} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Your payroll workspace is ready to build</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            This first screen is intentionally connected to no fake financial totals. Next, we will add authentication,
            employee records, and real calculations backed by MongoDB.
          </p>
        </div>
      </section>
    </main>
  );
}
