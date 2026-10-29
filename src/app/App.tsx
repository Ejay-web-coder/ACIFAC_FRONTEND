import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiError, PASSWORD_CHANGE_EVENT, SESSION_ENDED_EVENT } from '../lib/api';
import { closeLiveUpdates } from '../lib/liveUpdates';
import { lazy, Suspense } from 'react';
import { Layout } from './components/Layout';
import { Toaster } from './components/ui/Toaster';
import { Login } from './components/Login';
import { SessionTimeout } from './components/SessionTimeout';
import { ConfirmHost } from './components/common/ConfirmDialog';
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
const ActivityLog = lazy(() => import('../member/pages/ActivityLog').then((module) => ({ default: module.ActivityLog })));
const AccountManagement = lazy(() => import('../admin/pages/AccountManagement').then((module) => ({ default: module.AccountManagement })));
const Reports = lazy(() => import('../admin/pages/Reports').then((module) => ({ default: module.Reports })));
const Attendance = lazy(() => import('../admin/pages/Attendance').then((module) => ({ default: module.Attendance })));
const VendorKadiwa = lazy(() => import('../vendor/pages/VendorKadiwa').then((module) => ({ default: module.VendorKadiwa })));

/** vendor: a Kadiwa store vendor, who only sends the day's sales and expenses for review. */
export type UserRole = 'admin' | 'member' | 'vendor';

/** Where each role lands after signing in. */
export const homePath = (role: UserRole) => (role === 'admin' ? '/admin-dashboard' : role === 'vendor' ? '/vendor' : '/member-dashboard');
/** The app's role for the server's role on the account. */
export const roleFromServer = (role: string | undefined): UserRole | null => (role === 'ADMIN' ? 'admin' : role === 'MEMBER' ? 'member' : role === 'VENDOR' ? 'vendor' : null);

function RoleRoute({ userRole, allowedRole, children }: { userRole: UserRole; allowedRole: UserRole; children: ReactNode }) {
  return userRole === allowedRole ? children : <Navigate to={homePath(userRole)} replace />;
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
  // Why the last session ended (e.g. inactivity), shown on the login page.
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const isAuthenticatedRef = useRef(false);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    fetchCurrentUser()
      .then(({ user }) => {
        const role = roleFromServer(user?.role);
        if (role) {
          setUserRole(role);
          setMustChangePassword(Boolean(user?.must_change_password));
          setIsAuthenticated(true);
        }
      })
      .catch((error) => {
        setIsAuthenticated(false);
        // Reopened or refreshed after the server timed the session out.
        if (error instanceof ApiError && error.code === 'SESSION_IDLE_TIMEOUT') setLoginNotice(error.message);
      })
      .finally(() => setIsAuthReady(true));
  }, []);

  useEffect(() => {
    const onSessionEnded = (event: Event) => {
      const message = (event as CustomEvent<string>).detail || 'Your session has ended. Please sign in again.';
      closeLiveUpdates();
      if (isAuthenticatedRef.current) {
        toast.error(message);
        setLoginNotice(message);
      }
      setIsAuthenticated(false);
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
    setLoginNotice(null);
    setIsAuthenticated(true);
  };

  if (!isAuthReady) return null;

  return (
    <BrowserRouter>
      <Toaster />
      <ConfirmHost />
      {/* A Kadiwa vendor stays signed in until they log out: no inactivity countdown. */}
      {isAuthenticated && userRole !== 'vendor' && <SessionTimeout />}
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading...</div>}>
        <Routes>
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to={homePath(userRole)} replace />
            ) : (
              <Login onLogin={handleLogin} notice={loginNotice} />
            )
          }
        />
        <Route path="/reset-password" element={<Login onLogin={handleLogin} notice={loginNotice} />} />
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to={homePath(userRole)} replace />
            ) : (
              <Login onLogin={handleLogin} notice={loginNotice} />
            )
          }
        />
        {/* A Kadiwa vendor has one page, the day's sales form, without the menus. */}
        <Route path="/vendor" element={!isAuthenticated ? <Navigate to="/login" replace /> : <RoleRoute userRole={userRole} allowedRole="vendor"><VendorKadiwa /></RoleRoute>} />
        <Route element={isAuthenticated && userRole === 'vendor' ? <Navigate to="/vendor" replace /> : isAuthenticated ? <PasswordChangeGate required={mustChangePassword}><Layout userRole={userRole} setUserRole={setUserRole} setIsAuthenticated={setIsAuthenticated} /></PasswordChangeGate> : <Navigate to="/login" replace />}>
          <Route path="/admin-dashboard" element={<RoleRoute userRole={userRole} allowedRole="admin"><AdminDashboard /></RoleRoute>} />
          <Route path="/dashboard" element={<RoleRoute userRole={userRole} allowedRole="admin"><AdminDashboard /></RoleRoute>} />
          <Route path="/admin/accounts" element={<RoleRoute userRole={userRole} allowedRole="admin"><AccountManagement /></RoleRoute>} />
          <Route path="/member-dashboard" element={<RoleRoute userRole={userRole} allowedRole="member"><MemberDashboard userRole={userRole} /></RoleRoute>} />
          <Route path="/member-profile" element={<RoleRoute userRole={userRole} allowedRole="member"><MemberProfile userRole={userRole} /></RoleRoute>} />
          <Route path="/loan-status" element={<RoleRoute userRole={userRole} allowedRole="member"><LoanStatus userRole={userRole} /></RoleRoute>} />
          <Route path="/transaction" element={<RoleRoute userRole={userRole} allowedRole="member"><Transaction userRole={userRole} /></RoleRoute>} />
          <Route path="/rental-booking" element={<RoleRoute userRole={userRole} allowedRole="member"><RentalBooking userRole={userRole} /></RoleRoute>} />
          <Route path="/activity-log" element={<RoleRoute userRole={userRole} allowedRole="member"><ActivityLog /></RoleRoute>} />
          <Route path="/membership" element={<RoleRoute userRole={userRole} allowedRole="admin"><MembershipManagement userRole={userRole} /></RoleRoute>} />
          <Route path="/attendance" element={<RoleRoute userRole={userRole} allowedRole="admin"><Attendance userRole={userRole} /></RoleRoute>} />
          <Route path="/loans" element={<RoleRoute userRole={userRole} allowedRole="admin"><LoansPayments userRole={userRole} /></RoleRoute>} />
          <Route path="/machinery" element={<RoleRoute userRole={userRole} allowedRole="admin"><MachineryOperations userRole={userRole} /></RoleRoute>} />
          <Route path="/kadiwa" element={<RoleRoute userRole={userRole} allowedRole="admin"><KadiwaStore userRole={userRole} /></RoleRoute>} />
          <Route path="/analytics" element={<RoleRoute userRole={userRole} allowedRole="admin"><Analytics userRole={userRole} /></RoleRoute>} />
          <Route path="/reports" element={<RoleRoute userRole={userRole} allowedRole="admin"><Reports /></RoleRoute>} />
          <Route path="/ocr" element={<RoleRoute userRole={userRole} allowedRole="admin"><OCRScanner userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/savings" element={<RoleRoute userRole={userRole} allowedRole="admin"><Savings userRole={userRole} view="total" /></RoleRoute>} />
          <Route path="/admin/dashboard" element={<RoleRoute userRole={userRole} allowedRole="admin"><AdminDashboard /></RoleRoute>} />
          <Route path="/admin/members" element={<RoleRoute userRole={userRole} allowedRole="admin"><MembershipManagement userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/attendance" element={<RoleRoute userRole={userRole} allowedRole="admin"><Attendance userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/loans" element={<RoleRoute userRole={userRole} allowedRole="admin"><LoansPayments userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/machinery" element={<RoleRoute userRole={userRole} allowedRole="admin"><MachineryOperations userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/kadiwa" element={<RoleRoute userRole={userRole} allowedRole="admin"><KadiwaStore userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/analytics" element={<RoleRoute userRole={userRole} allowedRole="admin"><Analytics userRole={userRole} /></RoleRoute>} />
          <Route path="/admin/reports" element={<RoleRoute userRole={userRole} allowedRole="admin"><Reports /></RoleRoute>} />
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
        <Route path="*" element={<Navigate to={isAuthenticated ? homePath(userRole) : '/login'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
