import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UIProvider } from './context/UIContext';
import Layout from './components/Layout/Layout';
import LoginPage from './pages/LoginPage';
import ForceChangePasswordPage from './pages/ForceChangePasswordPage';
import Dashboard from './pages/Dashboard';
import ExpenseListPage from './pages/ExpenseListPage';
import ExpenseFormPage from './pages/ExpenseFormPage';
import ExpenseViewPage from './pages/ExpenseViewPage';
import AdminEmployees    from './pages/Admin/AdminEmployees';
import AdminUsers        from './pages/Admin/AdminUsers';
import AdminCoordinators from './pages/Admin/AdminCoordinators';
import AdminProjects     from './pages/Admin/AdminProjects';
import AdminRates        from './pages/Admin/AdminRates';
import AdminMasterData   from './pages/Admin/AdminMasterData';
import AdminAuditLogs    from './pages/Admin/AdminAuditLogs';
import ProfilePage       from './pages/ProfilePage';

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>;
  if (!user)   return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login"
        element={user && !user.must_change_password ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/change-password"
        element={!user ? <Navigate to="/login" /> : <ForceChangePasswordPage />} />

      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="expenses"          element={<ExpenseListPage />} />
        <Route path="expenses/new"      element={<ExpenseFormPage />} />
        <Route path="expenses/:id/edit" element={<ExpenseFormPage />} />
        <Route path="expenses/:id"      element={<ExpenseViewPage />} />

        <Route path="admin/employees"
          element={<PrivateRoute roles={['admin','hr']}><AdminEmployees /></PrivateRoute>} />
        <Route path="admin/users"
          element={<PrivateRoute roles={['admin']}><AdminUsers /></PrivateRoute>} />
        <Route path="admin/coordinators"
          element={<PrivateRoute roles={['admin','hr']}><AdminCoordinators /></PrivateRoute>} />
        <Route path="admin/projects"
          element={<PrivateRoute roles={['admin','hr']}><AdminProjects /></PrivateRoute>} />
        <Route path="admin/rates"
          element={<PrivateRoute roles={['admin','hr']}><AdminRates /></PrivateRoute>} />
        <Route path="admin/master-data"
          element={<PrivateRoute roles={['admin','hr']}><AdminMasterData /></PrivateRoute>} />
        <Route path="admin/audit-logs"
          element={<PrivateRoute roles={['admin']}><AdminAuditLogs /></PrivateRoute>} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <UIProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </UIProvider>
    </AuthProvider>
  );
}
