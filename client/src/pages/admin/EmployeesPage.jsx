import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, Pencil, Plus, Search, UserX, Users } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../services/api.js";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

function money(paise) {
  return currency.format((Number(paise) || 0) / 100);
}

function rupeesInput(paise) {
  return (Number(paise || 0) / 100).toFixed(2);
}

function rupeesToPaise(value) {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!match) throw new Error("Enter a non-negative amount with at most 2 decimal places.");
  return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
}

function responseMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

function localDateInput(value = new Date()) {
  return value.getFullYear() + "-" +
    String(value.getMonth() + 1).padStart(2, "0") + "-" +
    String(value.getDate()).padStart(2, "0");
}

const emptyCreateForm = {
  employeeCode: "",
  employmentStartDate: localDateInput(),
  firstName: "",
  lastName: "",
  workEmail: "",
  department: "",
  designation: "",
  baseSalary: "25000.00",
  allowances: "0.00",
  deductions: "0.00",
  initialPassword: ""
};

function EmployeeFields({ form, setForm, includeAccountPassword = false }) {
  const [showInitialPassword, setShowInitialPassword] = useState(false);

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  const textFields = [
    ["employeeCode", "Employee code", "EMP-1001"],
    ["firstName", "First name", "Rahul"],
    ["lastName", "Last name", "Kumar"],
    ["workEmail", "Work email", "rahul@example.com"],
    ["department", "Department", "Engineering"],
    ["designation", "Designation", "Software Engineer"]
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {textFields.filter(([name]) => includeAccountPassword || name !== "employeeCode").map(([name, label, placeholder]) => (
        <label key={name} className={name === "workEmail" && !includeAccountPassword ? "sm:col-span-2" : ""}>
          <span className={labelClass}>{label}</span>
          <input
            className={fieldClass}
            name={name}
            value={form[name] || ""}
            placeholder={placeholder}
            onChange={change}
            required
            maxLength={name === "employeeCode" ? 20 : name === "workEmail" ? 254 : 80}
            autoComplete="off"
            disabled={!includeAccountPassword && name === "workEmail"}
          />
        </label>
      ))}
      <div className="sm:col-span-2">
        <p className="text-xs leading-5 text-slate-500">Work email is the login identity and cannot be edited after the account is created. Employee codes are stored in uppercase.</p>
      </div>
      <label className="sm:col-span-2">
        <span className={labelClass}>Employment start date</span>
        <input
          className={fieldClass}
          type="date"
          name="employmentStartDate"
          value={form.employmentStartDate || ""}
          onChange={change}
          min="1900-01-01"
          max="2100-12-31"
          required
        />
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          Included from the month containing this date. The current rule calculates a full month without salary proration. The date is locked after the employee appears in a saved payroll run.
        </span>
      </label>
      <label>
        <span className={labelClass}>Base salary (₹ per month)</span>
        <input className={fieldClass} type="number" min="0" max="100000000" step="0.01" name="baseSalary" value={form.baseSalary || ""} onChange={change} required />
      </label>
      <label>
        <span className={labelClass}>Monthly allowances (₹)</span>
        <input className={fieldClass} type="number" min="0" max="100000000" step="0.01" name="allowances" value={form.allowances || ""} onChange={change} required />
      </label>
      <label>
        <span className={labelClass}>Monthly deductions (₹)</span>
        <input className={fieldClass} type="number" min="0" max="100000000" step="0.01" name="deductions" value={form.deductions || ""} onChange={change} required />
      </label>
      {includeAccountPassword && (
        <label>
          <span className={labelClass}>Initial password</span>
          <span className="relative block">
            <input
              className={fieldClass + " pr-12"}
              type={showInitialPassword ? "text" : "password"}
              name="initialPassword"
              value={form.initialPassword || ""}
              onChange={change}
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowInitialPassword((current) => !current)}
              aria-label={showInitialPassword ? "Hide initial password" : "Show initial password"}
              aria-pressed={showInitialPassword}
              className="absolute inset-y-0 right-0 inline-flex items-center justify-center rounded-r-lg px-3 text-slate-500 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            >
              {showInitialPassword
                ? <EyeOff size={18} aria-hidden="true" />
                : <Eye size={18} aria-hidden="true" />}
            </button>
          </span>
          <span className="mt-1 block text-xs text-slate-500">At least 12 characters. Use the eye button to verify your entry. Share it with the employee through a separate secure channel.</span>
        </label>
      )}
    </div>
  );
}

function getSalaryStructure(form) {
  return {
    baseSalaryPaise: rupeesToPaise(form.baseSalary),
    monthlyAllowancesPaise: rupeesToPaise(form.allowances),
    monthlyDeductionsPaise: rupeesToPaise(form.deductions)
  };
}

function EmployeeEditor({ employee, onCancel, onSaved }) {
  const [form, setForm] = useState(() => ({
    firstName: employee.firstName,
    lastName: employee.lastName,
    workEmail: employee.workEmail,
    department: employee.department,
    designation: employee.designation,
    baseSalary: rupeesInput(employee.salaryStructure.baseSalaryPaise),
    allowances: rupeesInput(employee.salaryStructure.monthlyAllowancesPaise),
    deductions: rupeesInput(employee.salaryStructure.monthlyDeductionsPaise),
    employmentStartDate: employee.employmentStartDate || employee.createdAt?.slice(0, 10) || localDateInput(),
    employmentStatus: employee.employmentStatus
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.patch("/employees/" + employee.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        department: form.department.trim(),
        designation: form.designation.trim(),
        salaryStructure: getSalaryStructure(form),
        employmentStartDate: form.employmentStartDate,
        employmentStatus: form.employmentStatus
      });
      onSaved("Employee record updated.");
    } catch (requestError) {
      setError(responseMessage(requestError, "Unable to update employee."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Edit {employee.employeeCode}</h3>
          <p className="mt-1 text-xs text-slate-600">Email and employee code are fixed identity fields.</p>
        </div>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-slate-600 underline">Cancel</button>
      </div>
      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
      <EmployeeFields form={form} setForm={setForm} />
      <label className="mt-4 block max-w-xs">
        <span className={labelClass}>Employment status</span>
        <select className={fieldClass} name="employmentStatus" value={form.employmentStatus} onChange={(event) => setForm((current) => ({ ...current, employmentStatus: event.target.value }))}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      <button type="submit" disabled={saving} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [draftFilters, setDraftFilters] = useState({ q: "", department: "", employmentStatus: "" });
  const [activeFilters, setActiveFilters] = useState({ q: "", department: "", employmentStatus: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [editingEmployee, setEditingEmployee] = useState(null);

  const loadEmployees = useCallback(async (page = 1, filters = activeFilters) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/employees", {
        params: {
          page,
          pageSize: 10,
          q: filters.q || undefined,
          department: filters.department || undefined,
          employmentStatus: filters.employmentStatus || undefined
        }
      });
      setEmployees(response.data.data);
      setPagination(response.data.pagination);
    } catch (requestError) {
      setError(responseMessage(requestError, "Unable to load employee records."));
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilters]);

  useEffect(() => {
    void loadEmployees(1, activeFilters);
  }, [loadEmployees, activeFilters]);

  function changeFilter(event) {
    setDraftFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function applyFilters(event) {
    event.preventDefault();
    setNotice("");
    setEditingEmployee(null);
    setActiveFilters({ ...draftFilters });
  }

  async function createEmployee(event) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setNotice("");
    try {
      await api.post("/employees", {
        employeeCode: createForm.employeeCode.trim(),
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        workEmail: createForm.workEmail.trim(),
        department: createForm.department.trim(),
        designation: createForm.designation.trim(),
        salaryStructure: getSalaryStructure(createForm),
        employmentStartDate: createForm.employmentStartDate,
        initialPassword: createForm.initialPassword
      });
      setCreateForm(emptyCreateForm);
      setShowCreate(false);
      setNotice("Employee created and login account provisioned.");
      await loadEmployees(1, activeFilters);
    } catch (requestError) {
      setCreateError(responseMessage(requestError, "Unable to create employee. Check the fields and try again."));
    } finally {
      setCreating(false);
    }
  }

  async function deactivate(employee) {
    const confirmed = window.confirm("Deactivate " + employee.firstName + " " + employee.lastName + "? Their existing login sessions will be invalidated.");
    if (!confirmed) return;
    setNotice("");
    setError("");
    try {
      await api.delete("/employees/" + employee.id);
      setNotice(employee.firstName + " " + employee.lastName + " was deactivated.");
      await loadEmployees(pagination.page, activeFilters);
    } catch (requestError) {
      setError(responseMessage(requestError, "Unable to deactivate employee."));
    }
  }

  function startEditing(employee) {
    setEditingEmployee(employee);
    setNotice("");
  }

  function saveNotice(message) {
    setEditingEmployee(null);
    setNotice(message);
    void loadEmployees(pagination.page, activeFilters);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-indigo-600">
            <ArrowLeft size={17} aria-hidden="true" /> Back to dashboard
          </Link>
          <span className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700"><Users size={17} /> Employee management</span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-indigo-600">PHASE 3</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Employees</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Manage employee profiles, salary structures, and linked login access. Use synthetic test records until production data controls are reviewed.</p>
          </div>
          <button type="button" onClick={() => { setShowCreate((value) => !value); setCreateError(""); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
            <Plus size={17} /> {showCreate ? "Close form" : "Add employee"}
          </button>
        </div>

        {notice && <p className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status"><CheckCircle2 size={18} />{notice}</p>}
        {error && <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}

        {showCreate && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-lg font-semibold">Create employee and login</h2>
            <p className="mt-1 text-sm text-slate-600">The account is created with employee-only permissions. The initial password is never shown again; share it separately and ask the employee to reset it.</p>
            {createError && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{createError}</p>}
            <form onSubmit={createEmployee} className="mt-5">
              <EmployeeFields form={createForm} setForm={setCreateForm} includeAccountPassword />
              <button type="submit" disabled={creating} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">
                {creating ? "Creating…" : "Create employee"}
              </button>
            </form>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <form onSubmit={applyFilters} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
            <label>
              <span className={labelClass}>Search</span>
              <span className="relative block">
                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input className={fieldClass + " pl-9"} name="q" value={draftFilters.q} onChange={changeFilter} placeholder="Name, email or employee code" maxLength={100} />
              </span>
            </label>
            <label>
              <span className={labelClass}>Department</span>
              <input className={fieldClass} name="department" value={draftFilters.department} onChange={changeFilter} placeholder="Any department" maxLength={80} />
            </label>
            <label>
              <span className={labelClass}>Status</span>
              <select className={fieldClass} name="employmentStatus" value={draftFilters.employmentStatus} onChange={changeFilter}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Apply filters</button>
          </form>
        </section>

        {editingEmployee && (
          <EmployeeEditor
            key={editingEmployee.id}
            employee={editingEmployee}
            onCancel={() => setEditingEmployee(null)}
            onSaved={saveNotice}
          />
        )}

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
            <h2 className="font-semibold">Employee records</h2>
            <p className="text-sm text-slate-500">{pagination.total} total record{pagination.total === 1 ? "" : "s"}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Employee</th>
                  <th className="px-5 py-3 font-semibold">Department</th>
                  <th className="px-5 py-3 font-semibold">Start date</th>
                  <th className="px-5 py-3 font-semibold">Base salary</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500" role="status">Loading employee records…</td></tr>}
                {!loading && employees.length === 0 && <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500">No employees found. Add a synthetic employee or adjust your filters.</td></tr>}
                {!loading && employees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{employee.firstName} {employee.lastName}</p>
                      <p className="mt-1 text-xs text-slate-500">{employee.employeeCode} · {employee.workEmail}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{employee.department}</p>
                      <p className="mt-1 text-xs text-slate-500">{employee.designation}</p>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-700">{employee.employmentStartDate || "—"}</td>
                    <td className="px-5 py-4 font-medium tabular-nums">{money(employee.salaryStructure.baseSalaryPaise)}</td>
                    <td className="px-5 py-4">
                      <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (employee.employmentStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{employee.employmentStatus}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => startEditing(employee)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"><Pencil size={14} /> Edit</button>
                        {employee.employmentStatus === "active" && (
                          <button type="button" onClick={() => void deactivate(employee)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><UserX size={14} /> Deactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500">Page {pagination.page} of {Math.max(pagination.totalPages, 1)} · {pagination.pageSize} per page</p>
            <div className="flex gap-2">
              <button type="button" disabled={loading || pagination.page <= 1} onClick={() => void loadEmployees(pagination.page - 1, activeFilters)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
              <button type="button" disabled={loading || pagination.page >= pagination.totalPages} onClick={() => void loadEmployees(pagination.page + 1, activeFilters)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">Next <ChevronRight size={16} /></button>
            </div>
          </div>
        </section>

        <p className="mt-5 text-xs leading-5 text-slate-500">Salary components use integer paise at the API boundary. The current formula does not calculate statutory tax, and payout records do not transfer money. Do not enter real employee data until production privacy, security and compliance controls have been reviewed.</p>
      </section>
    </main>
  );
}
