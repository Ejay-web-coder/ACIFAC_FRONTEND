import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { User, Lock, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../App';
import { forgotPasswordRequest, loginRequest, resetPasswordRequest } from '../services/authApi';

interface LoginProps {
  setUserRole: (role: UserRole) => void;
  setIsAuthenticated: (value: boolean) => void;
}

export function Login({ setUserRole, setIsAuthenticated }: LoginProps) {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<'admin' | 'member' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetForm, setResetForm] = useState({ newPassword: '', confirmPassword: '' });
  const [adminForm, setAdminForm] = useState({
    username: '',
    password: ''
  });
  const [memberForm, setMemberForm] = useState({
    email: '',
    password: ''
  });

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await loginRequest({ usernameOrEmail: adminForm.username, password: adminForm.password });
      if (response.role !== 'ADMIN') throw new Error('This account is not an administrator.');
      const role: UserRole = 'admin';
      setUserRole(role);
      setIsAuthenticated(true);
      localStorage.setItem('acifac-user-role', role);
      localStorage.setItem('acifac-is-authenticated', 'true');
      toast.success('Login successful');
      navigate(response.mustChangePassword ? '/settings' : '/admin-dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await loginRequest({ usernameOrEmail: memberForm.email, password: memberForm.password });
      if (response.role !== 'MEMBER') throw new Error('This account is not a member account.');
      const role: UserRole = 'member';
      setUserRole(role);
      setIsAuthenticated(true);
      localStorage.setItem('acifac-user-role', role);
      localStorage.setItem('acifac-is-authenticated', 'true');
      toast.success('Login successful');
      navigate(response.mustChangePassword ? '/settings' : '/member-dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await forgotPasswordRequest({ usernameOrEmail: recoveryIdentifier });
      toast.success(response.message, response.resetToken ? { description: `Development reset token: ${response.resetToken}` } : undefined);
      if (response.resetToken) setResetToken(response.resetToken);
      setShowForgotPassword(false);
      setRecoveryIdentifier('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to process recovery request.');
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
        </div>

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
                setMemberForm({ email: '', password: '' });
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
                      className="w-full rounded-lg border border-gray-300 py-3 sm:py-2.5 pl-11 sm:pl-9 pr-4 sm:pr-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="w-full rounded-lg border border-gray-300 py-3 sm:py-2.5 pl-11 sm:pl-9 pr-4 sm:pr-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 font-medium text-white transition hover:bg-blue-700 sm:py-3 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
                  {isSubmitting ? 'Signing in...' : 'Login as Admin'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleMemberLogin} className="space-y-4 sm:space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Email/Number</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 sm:h-4 sm:w-4 sm:left-3" />
                    <input
                      type="text"
                      name="email"
                      value={memberForm.email}
                      onChange={handleMemberChange}
                      placeholder="member@example.com or 123456"
                      className="w-full rounded-lg border border-gray-300 py-3 sm:py-2.5 pl-11 sm:pl-9 pr-4 sm:pr-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
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
                      className="w-full rounded-lg border border-gray-300 py-3 sm:py-2.5 pl-11 sm:pl-9 pr-4 sm:pr-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 font-medium text-white transition hover:bg-green-700 sm:py-3 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                  {isSubmitting ? 'Signing in...' : 'Login as Member'}
                </button>
              </form>
            )}

            <div className="mt-6 text-center">
              <button type="button" onClick={() => setShowForgotPassword((current) => !current)} className="text-xs text-gray-500 underline hover:text-gray-700">Forgot password?</button>
            </div>
            {showForgotPassword && (
              <form onSubmit={handleForgotPassword} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                <label className="block text-sm font-medium text-gray-700">Username or email
                  <input required value={recoveryIdentifier} onChange={(e) => setRecoveryIdentifier(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <button disabled={isSubmitting} className="w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">Request reset</button>
              </form>
            )}
            {resetToken && (
              <form onSubmit={handleResetPassword} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-600">Enter a new password for the reset token returned by the development server.</p>
                <input required type="password" placeholder="New password" value={resetForm.newPassword} onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                <input required type="password" placeholder="Confirm new password" value={resetForm.confirmPassword} onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                <button disabled={isSubmitting} className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">Reset password</button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
