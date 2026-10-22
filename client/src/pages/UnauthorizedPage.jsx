import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5">
      <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-50 text-amber-700">
          <ShieldAlert size={24} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-bold">Access not permitted</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Your account does not have permission to open that section.
        </p>
        <Link to="/" className="mt-6 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
          Go to your dashboard
        </Link>
      </section>
    </main>
  );
}
