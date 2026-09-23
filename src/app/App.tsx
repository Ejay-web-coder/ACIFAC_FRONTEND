import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PASSWORD_CHANGE_EVENT, SESSION_ENDED_EVENT } from '../lib/api';
import { closeLiveUpdates } from '../lib/liveUpdates';
import { lazy, Suspense } from 'react';
import { Layout } from './components/Layout';
import { Toaster } from './components/ui/Toaster';
import { Login } from './components/Login';
import { fetchCurrentUser } from './services/authApi';

const AdminDashboard = lazy(() => import('../admin/pages/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const MemberDashboard = lazy(() => import('../member/pages/MemberDashboard').then((module) => ({ default: module.MemberDashboard })));
const MemberProfile = lazy(() => import('../member/pages/MemberProfile').then((module) => ({ default: module.MemberProfile })));
const LoanStatus = lazy(() => import('../member/pages/LoanStatus').then((module) => ({ default: module.LoanStatus })));
const Transaction = lazy(() => import('../member/pages/Transaction').then((module) => ({ default: module.Transaction })));
const MembershipManagement = lazy(() => import('../admin/pages/MembershipManagement').then((module) => ({ default: module.MembershipManagement })));
const LoansPayments = lazy(() => import('../admin/pages/LoansPayments').then((module) => ({ default: module.LoansPayments })));
const MachineryOperations = lazy(() => import('../admin/pages/MachineryOperations').then((module) => ({ default: module.MachineryOperations })));
const KadiwaStore = lazy(() => import('../admin/pages/KadiwaStore').then((module) => ({ default: module.KadiwaStore })));
const Analytics = lazy(() => import('../admin/pages/Analytics').then((module) => ({ default: module.Analytics })));
const OCRScanner = lazy(() => import('../admin/pages/OCRScanner').then((module) => ({ default: module.OCRScanner })));
const Settings = lazy(() => import('../admin/pages/Settings').then((module) => ({ default: module.Settings })));
const MemberSettings = lazy(() => import('../member/pages/MemberSettings').then((module) => ({ default: module.MemberSettings })));
const Savings = lazy(() => import('../admin/pages/Savings').then((module) => ({ default: module.Savings })));
const RentalBooking = lazy(() => import('../member/pages/RentalBooking').then((module) => ({ default: module.RentalBooking })));
const AccountManagement = lazy(() => import('../admin/pages/AccountManagement').then((module) => ({ default: module.AccountManagement })));

export type UserRole = 'admin' | 'member';

function RoleRoute({ userRole, allowedRole, children }: { userRole: UserRole; allowedRole: UserRole; children: ReactNode }) {
  return userRole === allowedRole ? children : <Navigate to={allowedRole === 'admin' ? '/admin-dashboard' : '/member-dashboard'} replace />;
}

// While the server requires a password change, only Settings is reachable
// (the backend enforces the same rule on every API request).
function PasswordChangeGate({ required, children }: { required: boolean; children: ReactNode }) {
  const location = useLocation();
  if (required && location.pathname !== '/settings') return <Navigate to="/settings" replace />;
  return children;
}

export default function App() {
  const [userRole, setUserRole] = useState<UserRole>('member');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then(({ user }) => {
        if (user?.role) {
          setUserRole(user.role === 'ADMIN' ? 'admin' : 'member');
          setMustChangePassword(Boolean(user.must_change_password));
          setIsAuthenticated(true);
        }
      })
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsAuthReady(true));
  }, []);

  useEffect(() => {
    const onSessionEnded = (event: Event) => {
      closeLiveUpdates();
      setIsAuthenticated((wasAuthenticated) => {
        if (wasAuthenticated) toast.error((event as CustomEvent<string>).detail || 'Your session has ended. Please sign in again.');
        return false;
      });
      setMustChangePassword(false);
    };
    const onPasswordChangeRequired = () => setMustChangePassword(true);
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);
    window.addEventListener(PASSWORD_CHANGE_EVENT, onPasswordChangeRequired);
    return () => {
      window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
      window.removeEventListener(PASSWORD_CHANGE_EVENT, onPasswordChangeRequired);
    };
  }, []);

  const handleLogin = (role: UserRole, requiresPasswordChange: boolean) => {
    setUserRole(role);
    setMustChangePassword(requiresPasswordChange);
    setIsAuthenticated(true);
  };

  if (!isAuthReady) return null;

  return (
    <BrowserRouter>
      <Toaster />
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading...</div>}>
        <Routes>
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to={userRole === 'admin' ? '/admin-dashboard' : '/member-dashboard'} replace />
            ) : (
              <Login onLogin={handleLogin} />
            )
          }
        />
        <Route path="/reset-password" element={<Login onLogin={handleLogin} />} />
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to={userRole === 'admin' ? '/admin-dashboard' : '/member-dashboard'} replace />
            ) : (
              <Login onLogin={handleLogin} />
            )
          }
        />
        <Route element={isAuthenticated ? <PasswordChangeGate required={mustChangePassword}><Layout userRole={userRole} setUserRole={setUserRole} setIsAuthenticated={setIsAuthenticated} /></PasswordChangeGate> : <Navigate to="/login" replace />}>
          <Route path="/admin-dashboard" element={<RoleRoute userRole={userRole} allowedRole="admin"><AdminDashboard /></RoleRoute>} />
          <Route path="/dashboard" element={<RoleRoute userRole={userRole} allowedRole="admin"><AdminDashboard /></RoleRoute>} />
          <Route path="/admin/accounts" element={<RoleRoute userRole={userRole} allowedRole="admin"><AccountManagement /></RoleRoute>} />
          <Route path="/member-dashboard" element={<RoleRoute userRole={userRole} allowedRole="member"><MemberDashboard userRole={userRole} /></RoleRoute>} />
          <Route path="/member-profile" element={<RoleRoute userRole={userRole} allowedRole="member"><MemberProfile userRole={userRole} /></RoleRoute>} />
          <Route path="/loan-status" element={<RoleRoute userRole={userRole} allowedRole="member"><LoanStatus userRole={userRole} /></RoleRoute>} />
          <Route path="/transaction" element={<RoleRoute userRole={userRole} allowedRole="member"><Transaction userRole={userRole} /></RoleRoute>} />
          <Route path="/rental-booking" element={<RoleRoute userRole={userRole} allowedRole="member"><RentalBooking userRole={userRole} /></RoleRoute>} />
          <Route path="/membership" element={<RoleRoute userRole={userRole} allowedRole="admin"><MembershipManagement userRole={userRole} /></RoleRoute>} />
          <Route path="/loans" element={<RoleRoute userRole={userRole} allowedRole="admin"><LoansPayments userRole={userRole} /></RoleRoute>} />
          <Route path="/machinery" element={<RoleRoute userRole={userRole} allowedRole="admin"><MachineryOperations userRole={userRole} /></RoleRoute>} />
          <Route path="/kadiwa" element={<RoleRoute userRole={userRole} allowedRole="admin"><KadiwaStore userRole={userRole} /></RoleRoute>} />
          <Route path="/analytics" element={<RoleRoute userRole={userRole} allowedRole="admin"><Analytics userRole={userRole} /></RoleRoute>} />
          <Route path="/ocr" element={<RoleRoute userRole={userRole} allowedRole="admin"><OCRScanner userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/savings" element={<RoleRoute userRole={userRole} allowedRole="admin"><Savings userRole={userRole} view="total" /></RoleRoute>} />
          <Route path="/admin/dashboard" element={<RoleRoute userRole={userRole} allowedRole="admin"><AdminDashboard /></RoleRoute>} />
          <Route path="/admin/members" element={<RoleRoute userRole={userRole} allowedRole="admin"><MembershipManagement userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/loans" element={<RoleRoute userRole={userRole} allowedRole="admin"><LoansPayments userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/machinery" element={<RoleRoute userRole={userRole} allowedRole="admin"><MachineryOperations userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/kadiwa" element={<RoleRoute userRole={userRole} allowedRole="admin"><KadiwaStore userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/analytics" element={<RoleRoute userRole={userRole} allowedRole="admin"><Analytics userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/ocr" element={<RoleRoute userRole={userRole} allowedRole="admin"><OCRScanner userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/settings" element={<RoleRoute userRole={userRole} allowedRole="admin"><Settings userRole={userRole} /></RoleRoute>} />
          <Route path="/member/dashboard" element={<RoleRoute userRole={userRole} allowedRole="member"><MemberDashboard userRole={userRole} /></RoleRoute>} />
          <Route path="/member/profile" element={<RoleRoute userRole={userRole} allowedRole="member"><MemberProfile userRole={userRole} /></RoleRoute>} />
          <Route path="/member/loans" element={<RoleRoute userRole={userRole} allowedRole="member"><LoanStatus userRole={userRole} /></RoleRoute>} />
          <Route path="/member/transactions" element={<RoleRoute userRole={userRole} allowedRole="member"><Transaction userRole={userRole} /></RoleRoute>} />
          <Route path="/member/rental-booking" element={<RoleRoute userRole={userRole} allowedRole="member"><RentalBooking userRole={userRole} /></RoleRoute>} />
          <Route path="/member/settings" element={<RoleRoute userRole={userRole} allowedRole="member"><MemberSettings mustChangePassword={mustChangePassword} /></RoleRoute>} />
          <Route path="/settings" element={userRole === 'admin' ? <Settings userRole={userRole} mustChangePassword={mustChangePassword} /> : <MemberSettings mustChangePassword={mustChangePassword} />} />
        </Route>
        <Route path="*" element={<Navigate to={isAuthenticated ? (userRole === 'admin' ? '/admin-dashboard' : '/member-dashboard') : '/login'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
