import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '../../lib/api';
import { forgotPasswordRequest, resetPasswordRequest, verifyResetCodeRequest, type ResetAddress } from '../services/authApi';

type Step = 'address' | 'code' | 'password' | 'done';
type Method = 'email' | 'phone';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 09171234567, 0917 123 4567, +63 917 123 4567, 639171234567 (the server normalizes it).
const MOBILE_PATTERN = /^(?:63|0)?9\d{9}$/;
const TITLES: Record<Step, string> = { address: 'Forgot Password', code: 'Enter Verification Code', password: 'Create New Password', done: 'Password Reset' };
const INPUT = 'w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500';
const PRIMARY = 'flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY = 'flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300';

// Forgot password: email or mobile number -> 6-digit code -> new password.
// Every rule (who gets a code, expiry, attempts, resend cooldown, password
// policy) is enforced by the server; the code never comes back to the page,
// and the final step is authorised by an httpOnly cookie the page cannot read.
export function ForgotPasswordModal({ onClose, onPasswordReset }: { onClose: () => void; onPasswordReset?: () => void }) {
  const [step, setStep] = useState<Step>('address');
  const [method, setMethod] = useState<Method>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [passwords, setPasswords] = useState({ newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  // Resend countdown, from the cooldown the server reported.
  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const startCooldown = (seconds: number) => {
    setNow(Date.now());
    setResendAt(Date.now() + seconds * 1000);
  };

  const address = (): ResetAddress => (method === 'email' ? { email: email.trim() } : { phone: phone.trim() });

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (method === 'email' && !EMAIL_PATTERN.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (method === 'phone' && !MOBILE_PATTERN.test(phone.trim().replace(/^\+/, '').replace(/[\s().-]/g, ''))) {
      setError('Please enter a valid mobile number, like 0917 123 4567.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await forgotPasswordRequest(address());
      startCooldown(response.resendAvailableInSeconds);
      toast.success(response.message);
      setCode('');
      setStep('code');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'RESET_CODE_COOLDOWN') {
        // A code was sent moments ago and can still be used.
        startCooldown(Number(requestError.data.retryAfterSeconds) || 60);
        setStep('code');
      }
      setError(errorMessage(requestError, 'Unable to send a verification code.'));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError(`Enter the 6-digit code from the ${method === 'email' ? 'email' : 'text message'}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyResetCodeRequest({ ...address(), code });
      setStep('password');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code !== 'RESET_CODE_INVALID') setCode('');
      setError(errorMessage(requestError, 'Unable to verify the code.'));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwords.newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetPasswordRequest(passwords);
      setPasswords({ newPassword: '', confirmPassword: '' });
      setStep('done');
      onPasswordReset?.();
    } catch (requestError) {
      // The verified code is only good for 10 minutes: start again.
      if (requestError instanceof ApiError && requestError.code === 'RESET_SESSION_EXPIRED') setStep('address');
      setError(errorMessage(requestError, 'Unable to reset the password.'));
    } finally {
      setBusy(false);
    }
  };

  const feedback = error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  const buttons = (label: string, busyLabel: string) => (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onClose} className={SECONDARY}>Cancel</button>
      <button type="submit" disabled={busy} className={PRIMARY}>{busy ? busyLabel : label}</button>
    </div>
  );

  let body: ReactNode;
  if (step === 'address') {
    const choose = (next: Method) => { setMethod(next); setError(''); };
    const tab = (value: Method, label: string) => (
      <button
        type="button"
        role="tab"
        aria-selected={method === value}
        onClick={() => choose(value)}
        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${method === value ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
      >
        {label}
      </button>
    );
    body = (
      <form onSubmit={sendCode} noValidate className="p-6 space-y-4">
        <p className="text-sm text-gray-600">Where should we send your 6-digit code?</p>
        <div role="tablist" aria-label="Send the code by" className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {tab('email', 'Email')}
          {tab('phone', 'Mobile number')}
        </div>
        {method === 'email' ? (
          <div>
            <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input id="reset-email" type="email" autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={INPUT} />
          </div>
        ) : (
          <div>
            <label htmlFor="reset-phone" className="block text-sm font-medium text-gray-700 mb-2">Mobile number</label>
            <input id="reset-phone" type="tel" inputMode="tel" autoComplete="tel" autoFocus value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0917 123 4567" className={INPUT} />
            <p className="mt-2 text-xs text-gray-500">The number on your ACIFAC account. If it is shared with another member, use your email instead.</p>
          </div>
        )}
        {feedback}
        <p className="text-xs text-gray-500">No email or mobile number on your account? Please visit or contact the ACIFAC office.</p>
        {buttons('Send Code', 'Sending...')}
      </form>
    );
  } else if (step === 'code') {
    body = (
      <form onSubmit={verifyCode} noValidate className="p-6 space-y-4">
        <p className="text-sm text-gray-600">{method === 'email' ? 'We sent a 6-digit verification code to your email.' : 'We texted a 6-digit verification code to your mobile number.'}</p>
        <div>
          <label htmlFor="reset-code" className="block text-sm font-medium text-gray-700 mb-2">6-digit code</label>
          <input
            id="reset-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className={`${INPUT} text-center text-2xl font-semibold tracking-[0.4em]`}
          />
          <p className="mt-2 text-xs text-gray-500">Sent to {method === 'email' ? email.trim() : phone.trim()}. The code expires in 10 minutes.</p>
        </div>
        {feedback}
        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={() => { setError(''); setStep('address'); }} className="text-gray-500 hover:text-gray-700">Use a different email or number</button>
          {resendIn > 0
            ? <span className="text-gray-500 tabular-nums">Resend code in {resendIn}s</span>
            : <button type="button" onClick={() => void sendCode()} disabled={busy} className="font-medium text-green-700 hover:text-green-800 disabled:opacity-60">Resend Code</button>}
        </div>
        {buttons('Verify Code', 'Verifying...')}
      </form>
    );
  } else if (step === 'password') {
    body = (
      <form onSubmit={resetPassword} noValidate className="p-6 space-y-4">
        <div>
          <label htmlFor="reset-new-password" className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
          <input id="reset-new-password" type="password" autoComplete="new-password" autoFocus value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} placeholder="Enter new password" className={INPUT} />
          <p className="mt-2 text-xs text-gray-500">At least 8 characters, with uppercase and lowercase letters, a number and a symbol.</p>
        </div>
        <div>
          <label htmlFor="reset-confirm-password" className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
          <input id="reset-confirm-password" type="password" autoComplete="new-password" value={passwords.confirmPassword} onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })} placeholder="Confirm new password" className={INPUT} />
        </div>
        {feedback}
        {buttons('Reset Password', 'Saving...')}
      </form>
    );
  } else {
    body = (
      <div className="p-6 space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <div>
          <p className="font-semibold text-gray-900">Password reset successful.</p>
          <p className="mt-1 text-sm text-gray-600">You can now log in with your new password.</p>
        </div>
        <button type="button" onClick={onClose} autoFocus className={`${PRIMARY} w-full`}>Return to Login</button>
      </div>
    );
  }

  return (
    <div className="acf-modal fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="forgot-password-title">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 id="forgot-password-title" className="text-xl font-bold text-gray-900">{TITLES[step]}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
