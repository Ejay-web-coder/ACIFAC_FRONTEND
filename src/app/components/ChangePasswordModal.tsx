import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Mail, MessageSquare, X } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '../../lib/api';
import { closeLiveUpdates } from '../../lib/liveUpdates';
import { changePasswordRequest, sendPasswordChangeCodeRequest } from '../services/authApi';

type Method = 'code' | 'current';
type Channel = 'email' | 'sms';

const INPUT = 'w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500';
const PRIMARY = 'flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY = 'flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300';
const LINK = 'text-sm font-medium text-green-700 hover:text-green-800';

function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 1)}•••@${domain}`;
}

// "0917 ••• 4567", the same as the server shows.
function maskPhone(phone: string) {
  const digits = /^(?:63|0)?(9\d{9})$/.exec(phone.trim().replace(/^\+/, '').replace(/[\s().-]/g, ''))?.[1];
  return digits ? `0${digits.slice(0, 3)} ••• ${digits.slice(-4)}` : phone;
}

// Change password while signed in: a 6-digit code sent to the account's own
// email or mobile number, or the current password. The server checks the code
// and ends every session, so the member signs in again afterwards.
export function ChangePasswordModal({ email, phone, smsAvailable, onClose }: {
  email: string | null;
  phone: string | null;
  smsAvailable: boolean;
  onClose: () => void;
}) {
  const canUseCode = Boolean(email) || smsAvailable;
  const [method, setMethod] = useState<Method>(canUseCode ? 'code' : 'current');
  const [channel, setChannel] = useState<Channel>(email ? 'email' : 'sms');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [form, setForm] = useState({ currentPassword: '', code: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

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

  const switchMethod = (next: Method) => {
    setMethod(next);
    // The account details may have loaded after the modal opened.
    if (next === 'code' && !sentTo) setChannel(email ? 'email' : 'sms');
    setError('');
  };

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await sendPasswordChangeCodeRequest(channel);
      setSentTo(response.sentTo);
      startCooldown(response.resendAvailableInSeconds);
      toast.success(response.message);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'RESET_CODE_COOLDOWN') {
        // A code was sent moments ago and can still be used.
        setSentTo(channel === 'email' ? maskEmail(email || '') : maskPhone(phone || ''));
        startCooldown(Number(requestError.data.retryAfterSeconds) || 60);
      }
      setError(errorMessage(requestError, 'Unable to send a verification code.'));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (method === 'code' && !/^\d{6}$/.test(form.code)) {
      setError(`Enter the 6-digit code from the ${channel === 'email' ? 'email' : 'text message'}.`);
      return;
    }
    if (method === 'current' && !form.currentPassword) {
      setError('Please enter your current password.');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters with upper and lower case letters, a number and a symbol.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const proof = method === 'code' ? { code: form.code } : { currentPassword: form.currentPassword };
      await changePasswordRequest({ ...proof, newPassword: form.newPassword, confirmPassword: form.confirmPassword });
      toast.success('Password changed successfully! Please sign in again.');
      // The server ends every session after a password change.
      closeLiveUpdates();
      window.setTimeout(() => window.location.replace('/login'), 800);
    } catch (requestError) {
      if (requestError instanceof ApiError && ['RESET_CODE_EXPIRED', 'RESET_CODE_USED', 'RESET_CODE_LOCKED'].includes(requestError.code || '')) {
        setForm((current) => ({ ...current, code: '' }));
      }
      setError(errorMessage(requestError, 'Unable to change password.'));
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
  const newPasswordFields = (
    <>
      <div>
        <label htmlFor="change-new-password" className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
        <input id="change-new-password" type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} placeholder="Enter new password" className={INPUT} />
        <p className="mt-2 text-xs text-gray-500">At least 8 characters, with uppercase and lowercase letters, a number and a symbol.</p>
      </div>
      <div>
        <label htmlFor="change-confirm-password" className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
        <input id="change-confirm-password" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} placeholder="Confirm new password" className={INPUT} />
      </div>
    </>
  );
  const option = (value: Channel, icon: ReactNode, label: string, detail: string) => (
    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${channel === value ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
      <input type="radio" name="code-channel" value={value} checked={channel === value} onChange={() => setChannel(value)} className="accent-green-600" />
      {icon}
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="block truncate text-xs text-gray-500">{detail}</span>
      </span>
    </label>
  );

  let body: ReactNode;
  if (method === 'code' && !sentTo) {
    body = (
      <form onSubmit={sendCode} noValidate className="p-6 space-y-4">
        <p className="text-sm text-gray-600">We will send a 6-digit code to confirm it is you. Where should we send it?</p>
        <div className="space-y-2" role="radiogroup" aria-label="Send the code by">
          {email && option('email', <Mail className="h-5 w-5 shrink-0 text-gray-500" />, 'Email', maskEmail(email))}
          {smsAvailable && phone && option('sms', <MessageSquare className="h-5 w-5 shrink-0 text-gray-500" />, 'Text message', maskPhone(phone))}
        </div>
        {feedback}
        <button type="button" onClick={() => switchMethod('current')} className={LINK}>Use your current password instead</button>
        {buttons('Send Code', 'Sending...')}
      </form>
    );
  } else if (method === 'code') {
    body = (
      <form onSubmit={changePassword} noValidate className="p-6 space-y-4">
        <div>
          <label htmlFor="change-code" className="block text-sm font-medium text-gray-700 mb-2">6-digit code</label>
          <input
            id="change-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, '').slice(0, 6) })}
            placeholder="000000"
            className={`${INPUT} text-center text-2xl font-semibold tracking-[0.4em]`}
          />
          <p className="mt-2 text-xs text-gray-500">Sent to {sentTo}. The code expires in 10 minutes.</p>
          <div className="mt-2 flex items-center justify-between text-sm">
            <button type="button" onClick={() => { setError(''); setSentTo(null); }} className="text-gray-500 hover:text-gray-700">Send it somewhere else</button>
            {resendIn > 0
              ? <span className="text-gray-500 tabular-nums">Resend code in {resendIn}s</span>
              : <button type="button" onClick={() => void sendCode()} disabled={busy} className="font-medium text-green-700 hover:text-green-800 disabled:opacity-60">Resend Code</button>}
          </div>
        </div>
        {newPasswordFields}
        {feedback}
        {buttons('Change Password', 'Saving...')}
      </form>
    );
  } else {
    body = (
      <form onSubmit={changePassword} noValidate className="p-6 space-y-4">
        <div>
          <label htmlFor="change-current-password" className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
          <input id="change-current-password" type="password" autoComplete="current-password" autoFocus value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} placeholder="Enter current password" className={INPUT} />
        </div>
        {newPasswordFields}
        {feedback}
        {canUseCode && <button type="button" onClick={() => switchMethod('code')} className={LINK}>Forgot your current password? Get a code instead</button>}
        {buttons('Change Password', 'Saving...')}
      </form>
    );
  }

  return (
    <div className="acf-modal fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 id="change-password-title" className="text-xl font-bold text-gray-900">Change Password</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
