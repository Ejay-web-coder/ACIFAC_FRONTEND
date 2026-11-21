import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, Lock, LogIn, LogOut } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { closeLiveUpdates } from '../../lib/liveUpdates';
import { clearProfilePhoto } from '../../lib/profilePhoto';
import { logoutRequest, unlockSessionRequest, type SessionStatus } from '../services/authApi';

// The lock screen after 20 minutes without activity (administrators and
// members). The server has locked the session: "Stay logged in" asks for the
// password and the session goes on where it was; "Log out" ends it. It covers
// the whole page, so nothing that was on screen can be read while the person
// is away, and the page behind cannot be reached with the keyboard either.

interface SessionLockProps {
  /** Whose session it is ("Logged in as ..."), when known. */
  displayName?: string | null;
  /** The account's username, for password managers. */
  username?: string | null;
  idleMinutes: number;
  onUnlocked: (status: SessionStatus) => void;
}

const formatCountdown = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export function SessionLock({ displayName, username, idleMinutes, onUnlocked }: SessionLockProps) {
  const [step, setStep] = useState<'choose' | 'password'>('choose');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // When the sign-in lockout (3 wrong passwords) ends.
  const [signInLockedUntil, setSignInLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<'unlock' | 'logout' | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const signInLocked = signInLockedUntil > now;

  // The rest of the page is out of reach (keyboard, screen readers) while locked.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;
    root.inert = true;
    return () => { root.inert = false; };
  }, []);

  useEffect(() => {
    if (!signInLocked) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [signInLocked]);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy || signInLocked) return;
    setBusy('unlock');
    setError(null);
    try {
      const status = await unlockSessionRequest(password);
      onUnlocked(status);
    } catch (caught) {
      setPassword('');
      if (caught instanceof ApiError && caught.code === 'LOGIN_LOCKED') {
        // Counts down from the time left on the server's lock.
        setSignInLockedUntil(Date.now() + (Number(caught.data.retryAfterSeconds) || 20 * 60) * 1000);
        setNow(Date.now());
      } else if (caught instanceof ApiError && caught.code === 'INVALID_PASSWORD') {
        const left = Number(caught.data.attemptsRemaining);
        setError(left === 1 ? 'Incorrect password. 1 attempt left before sign-in is locked for 20 minutes.' : `Incorrect password.${left > 1 ? ` ${left} attempts left.` : ''}`);
        window.setTimeout(() => passwordRef.current?.focus(), 0);
      } else if (!(caught instanceof ApiError && caught.status === 401)) {
        // A 401 means the session has ended; the page goes back to the login page.
        setError(caught instanceof Error ? caught.message : 'Unable to check your password. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  const logOut = async () => {
    setBusy('logout');
    await logoutRequest().catch(() => undefined);
    closeLiveUpdates();
    clearProfilePhoto();
    window.location.replace('/login');
  };

  const logOutButton = (
    <button type="button" onClick={() => void logOut()} disabled={busy !== null} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-60">
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {busy === 'logout' ? 'Logging out...' : 'Log out'}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-gradient-to-br from-green-50 to-blue-50" role="alertdialog" aria-modal="true" aria-labelledby="session-lock-title" aria-describedby="session-lock-message">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg sm:p-8">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Lock className="h-7 w-7" aria-hidden="true" />
            </span>
            <h2 id="session-lock-title" className="mt-4 text-xl font-bold text-gray-900">
              {step === 'choose' ? 'Are you still there?' : 'Enter your password'}
            </h2>
            <p id="session-lock-message" className="mt-2 text-sm text-gray-600">
              {step === 'choose'
                ? `You have been inactive for ${idleMinutes} minutes, so your session was locked to keep your account safe.`
                : 'Enter your password to stay logged in. You will continue where you left off.'}
            </p>
            {displayName && (
              <p className="mt-3 max-w-full truncate rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                Logged in as <span className="font-semibold">{displayName}</span>
              </p>
            )}
          </div>

          {step === 'choose' ? (
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              {logOutButton}
              <button type="button" onClick={() => setStep('password')} disabled={busy !== null} autoFocus className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Stay logged in
              </button>
            </div>
          ) : (
            <form onSubmit={(event) => void unlock(event)} className="mt-6 space-y-4">
              {/* Lets a password manager know which account the password is for. */}
              <input type="text" name="username" autoComplete="username" value={username ?? ''} readOnly hidden />
              <div>
                <label htmlFor="session-lock-password" className="mb-2 block text-sm font-medium text-gray-700">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    ref={passwordRef}
                    id="session-lock-password"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); setError(null); }}
                    disabled={signInLocked}
                    placeholder="••••••••"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'session-lock-error' : undefined}
                    className="w-full rounded-xl border border-gray-300 py-3 pl-9 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 sm:py-2.5"
                  />
                </div>
              </div>

              {error && <p id="session-lock-error" role="alert" className="text-sm text-red-600">{error}</p>}
              {signInLocked && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Too many failed attempts.</p>
                    <p className="tabular-nums">Try again in {formatCountdown(signInLockedUntil - now)}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                {logOutButton}
                <button type="submit" disabled={busy !== null || signInLocked || !password} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  {busy === 'unlock' ? 'Checking...' : 'Continue'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
