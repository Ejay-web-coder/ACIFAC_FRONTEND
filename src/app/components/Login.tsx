import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { User, Lock, Shield, Users, Clock3 } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../App';
import { ApiError } from '../../lib/api';
import { loginRequest, resetPasswordRequest } from '../services/authApi';
import { InstallAppButton } from './common/InstallAppButton';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface LoginProps {
  onLogin: (role: UserRole, mustChangePassword: boolean) => void;
  /** Why the last session ended, shown above the sign-in options. */
  notice?: string | null;
}

// Sign-in lockouts are enforced by the server. This tab only remembers when a
// lock it was told about ends, so the countdown survives a refresh.
const LOCKS_KEY = 'acifac:login-locks';
type LoginLocks = Record<string, number>;

function readLocks(): LoginLocks {
  try {
    const stored = JSON.parse(sessionStorage.getItem(LOCKS_KEY) || '{}') as LoginLocks;
    return Object.fromEntries(Object.entries(stored).filter(([, until]) => typeof until === 'number' && until > Date.now()));
  } catch {
    return {};
  }
}

function saveLocks(locks: LoginLocks) {
  try {
    sessionStorage.setItem(LOCKS_KEY, JSON.stringify(locks));
  } catch {
    // Storage unavailable: the server still enforces the lock.
  }
}

const lockKey = (identifier: string) => identifier.trim().toLowerCase();

const formatCountdown = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export function Login({ onLogin, notice }: LoginProps) {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<'admin' | 'member' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [locks, setLocks] = useState<LoginLocks>(readLocks);
  const [now, setNow] = useState(() => Date.now());
  // Email links use /reset-password?token=...; ?resetToken= is accepted for older links.
  const [resetToken, setResetToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || params.get('resetToken') || '';
  });
  const [resetForm, setResetForm] = useState({ newPassword: '', confirmPassword: '' });
  const [adminForm, setAdminForm] = useState({
    username: '',
    password: ''
  });
  const [memberForm, setMemberForm] = useState({
    identifier: '',
    password: ''
  });

  const hasActiveLock = Object.values(locks).some((until) => until > now);
  useEffect(() => {
    if (!hasActiveLock) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveLock]);

  // The lock belongs to the account, so it shows for the name that was locked.
  const currentIdentifier = selectedRole === 'admin' ? adminForm.username : memberForm.identifier;
  const lockRemaining = (locks[lockKey(currentIdentifier)] ?? 0) - now;
  const isLocked = Boolean(currentIdentifier.trim()) && lockRemaining > 0;

  const forgetLock = (identifier?: string) => {
    const next = identifier === undefined ? {} : Object.fromEntries(Object.entries(readLocks()).filter(([key]) => key !== lockKey(identifier)));
    saveLocks(next);
    setLocks(next);
  };

  const handleLoginError = (error: unknown, identifier: string) => {
    if (error instanceof ApiError && error.code === 'LOGIN_LOCKED') {
      // Counts down from the time left on the server's lock.
      const seconds = Number(error.data.retryAfterSeconds) || 20 * 60;
      const next = { ...readLocks(), [lockKey(identifier)]: Date.now() + seconds * 1000 };
      saveLocks(next);
      setLocks(next);
      setNow(Date.now());
      toast.error(error.message);
      return;
    }
    if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS' && error.data.attemptsRemaining === 1) {
      toast.error(`${error.message} 1 attempt left before sign-in is locked for 20 minutes.`);
      return;
    }
    toast.error(error instanceof Error ? error.message : 'Unable to sign in.');
  };

  const lockNotice = isLocked && (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">Too many failed login attempts.</p>
        <p className="tabular-nums">Try again in {formatCountdown(lockRemaining)}</p>
      </div>
    </div>
  );

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await loginRequest({ usernameOrEmail: adminForm.username, password: adminForm.password });
      forgetLock(adminForm.username);
      if (response.role !== 'ADMIN') throw new Error('This account is not an administrator.');
      onLogin('admin', Boolean(response.mustChangePassword));
      toast.success(response.mustChangePassword ? 'Please change your temporary password to continue.' : 'Login successful');
      navigate(response.mustChangePassword ? '/settings' : '/admin-dashboard');
    } catch (error) {
      handleLoginError(error, adminForm.username);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await loginRequest({ usernameOrEmail: memberForm.identifier, password: memberForm.password });
      forgetLock(memberForm.identifier);
      if (response.role !== 'MEMBER') throw new Error('This account is not a member account.');
      onLogin('member', Boolean(response.mustChangePassword));
      toast.success(response.mustChangePassword ? 'Please change your temporary password to continue.' : 'Login successful');
      navigate(response.mustChangePassword ? '/settings' : '/member-dashboard');
    } catch (error) {
      handleLoginError(error, memberForm.identifier);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await resetPasswordRequest({ token: resetToken, ...resetForm });
      toast.success('Password reset successfully. You can now sign in.');
      setResetToken('');
      window.history.replaceState(null, '', '/login');
      setResetForm({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reset password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAdminForm(prev => ({ ...prev, [name]: value }));
  };

  const handleMemberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMemberForm(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-3 sm:p-4">
      <div className="w-full max-w-4xl">
        <div className="mb-6 text-center sm:mb-12">
          <div className="mb-3 flex items-center justify-center sm:mb-4">
            <img src="/logo.png" alt="ACIFAC Logo" className="h-20 w-20 rounded-full sm:h-24 sm:w-24" />
          </div>
          <h1 className="mb-2 text-2xl font-bold leading-tight text-gray-900 sm:text-4xl">
            ACIFAC Management System
          </h1>
          <p className="text-sm text-gray-600 sm:text-base">
            Cooperative Administration & Information System
          </p>
          <div className="mt-4 flex justify-center"><InstallAppButton variant="full" /></div>
        </div>

        {notice && (
          <p role="status" className="mx-auto mb-4 max-w-2xl rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-center text-sm text-yellow-800">{notice}</p>
        )}

        {!selectedRole ? (
          <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
            <button
              onClick={() => setSelectedRole('admin')}
              className="group rounded-lg border-2 border-transparent bg-white p-5 shadow-lg transition-all hover:border-blue-600 hover:shadow-xl sm:p-8"
            >
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 rounded-full bg-blue-100 p-4 transition group-hover:bg-blue-200">
                  <Shield className="h-8 w-8 text-blue-600" />
                </div>
                <h2 className="mb-2 text-xl font-bold text-gray-900 sm:text-2xl">Admin Login</h2>
                <p className="mb-4 text-sm text-gray-600 sm:text-base">
                  Access administrative panel with full system control
                </p>
                <span className="text-sm font-medium text-blue-600">Click to login as Admin →</span>
              </div>
            </button>

            <button
              onClick={() => setSelectedRole('member')}
              className="group rounded-lg border-2 border-transparent bg-white p-5 shadow-lg transition-all hover:border-green-600 hover:shadow-xl sm:p-8"
            >
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 rounded-full bg-green-100 p-4 transition group-hover:bg-green-200">
                  <Users className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="mb-2 text-xl font-bold text-gray-900 sm:text-2xl">Member Login</h2>
                <p className="mb-4 text-sm text-gray-600 sm:text-base">
                  Access your member dashboard and services
                </p>
                <span className="text-sm font-medium text-green-600">Click to login as Member →</span>
              </div>
            </button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-md rounded-lg bg-white p-4 shadow-lg sm:p-8">
            <button
              onClick={() => {
                setSelectedRole(null);
                setAdminForm({ username: '', password: '' });
                setMemberForm({ identifier: '', password: '' });
                setShowForgotPassword(false);
              }}
              className="mb-4 flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
            >
              ← Back to Role Selection
            </button>

            <div className="mb-6 flex items-center justify-center">
              <div className={`rounded-full p-3 ${selectedRole === 'admin' ? 'bg-blue-100' : 'bg-green-100'}`}>
                {selectedRole === 'admin' ? (
                  <Shield className="h-6 w-6 text-blue-600" />
                ) : (
                  <Users className="h-6 w-6 text-green-600" />
                )}
              </div>
            </div>

            <h2 className="mb-1 text-center text-2xl font-bold text-gray-900">
              {selectedRole === 'admin' ? 'Admin Login' : 'Member Login'}
            </h2>
            <p className="mb-6 text-center text-sm text-gray-600">
              {selectedRole === 'admin' ? 'Enter your admin credentials' : 'Enter your member information'}
            </p>

            {selectedRole === 'admin' ? (
              <form onSubmit={handleAdminLogin} className="space-y-4 sm:space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Username</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 sm:h-4 sm:w-4 sm:left-3" />
                    <input
                      type="text"
                      name="username"
                      value={adminForm.username}
                      onChange={handleAdminChange}
                      placeholder="admin"
                      className="w-full rounded-xl border border-gray-300 py-3 sm:py-2.5 pl-11 sm:pl-9 pr-4 sm:pr-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 sm:h-4 sm:w-4 sm:left-3" />
                    <input
                      type="password"
                      name="password"
                      value={adminForm.password}
                      onChange={handleAdminChange}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-gray-300 py-3 sm:py-2.5 pl-11 sm:pl-9 pr-4 sm:pr-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {lockNotice}

                <button
                  type="submit"
                  disabled={isSubmitting || isLocked}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 font-medium text-white transition hover:bg-green-700 sm:py-3 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
                  {isSubmitting ? 'Signing in...' : 'Login as Admin'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleMemberLogin} className="space-y-4 sm:space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Username/Number</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 sm:h-4 sm:w-4 sm:left-3" />
                    <input
                      type="text"
                      name="identifier"
                      value={memberForm.identifier}
                      onChange={handleMemberChange}
                      autoComplete="username"
                      placeholder="Username or member number"
                      className="w-full rounded-xl border border-gray-300 py-3 sm:py-2.5 pl-11 sm:pl-9 pr-4 sm:pr-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 sm:h-4 sm:w-4 sm:left-3" />
                    <input
                      type="password"
                      name="password"
                      value={memberForm.password}
                      onChange={handleMemberChange}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-gray-300 py-3 sm:py-2.5 pl-11 sm:pl-9 pr-4 sm:pr-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                {lockNotice}

                <button
                  type="submit"
                  disabled={isSubmitting || isLocked}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 font-medium text-white transition hover:bg-green-700 sm:py-3 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                  {isSubmitting ? 'Signing in...' : 'Login as Member'}
                </button>
              </form>
            )}

            <div className="mt-6 text-center">
              <button type="button" onClick={() => setShowForgotPassword(true)} className="text-xs text-gray-500 underline hover:text-gray-700">Forgot password?</button>
            </div>
            {resetToken && (
              <form onSubmit={handleResetPassword} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-600">Enter a new password for the reset token returned by the development server.</p>
                <input required type="password" placeholder="New password" value={resetForm.newPassword} onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2" />
                <input required type="password" placeholder="Confirm new password" value={resetForm.confirmPassword} onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2" />
                <button disabled={isSubmitting} className="w-full rounded-xl bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">Reset password</button>
              </form>
            )}
          </div>
        )}
      </div>
      {/* A completed reset also lifts the server's lockout. */}
      {showForgotPassword && <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} onPasswordReset={() => forgetLock()} />}
    </div>
  );
}
