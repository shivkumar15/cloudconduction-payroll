import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import LoginPage from "./pages/auth/LoginPage.jsx";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage.jsx";
import ChangePasswordPage from "./pages/auth/ChangePasswordPage.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import EmployeesPage from "./pages/admin/EmployeesPage.jsx";
import AdminPayrollPage from "./pages/admin/AdminPayrollPage.jsx";
import AdminUnpaidLeavePage from "./pages/admin/AdminUnpaidLeavePage.jsx";
import AdminWfhPage from "./pages/admin/AdminWfhPage.jsx";
import EmployeeDashboard from "./pages/employee/EmployeeDashboard.jsx";
import UnauthorizedPage from "./pages/UnauthorizedPage.jsx";

function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-5">
        <p className="text-sm text-slate-600" role="status">Loading your workspace…</p>
      </main>
    );
  }

  const destination = !user
    ? "/login"
    : user.mustChangePassword
      ? "/change-password"
      : user.role === "admin" ? "/admin" : "/employee";

  return <Navigate to={destination} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Route>
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/employees" element={<EmployeesPage />} />
        <Route path="/admin/payroll" element={<AdminPayrollPage />} />
        <Route path="/admin/unpaid-leave" element={<AdminUnpaidLeavePage />} />
        <Route path="/admin/wfh" element={<AdminWfhPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["employee"]} />}>
        <Route path="/employee" element={<EmployeeDashboard />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
