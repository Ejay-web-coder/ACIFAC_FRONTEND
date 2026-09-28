import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { closeLiveUpdates } from '../../lib/liveUpdates';
import { clearProfilePhoto } from '../../lib/profilePhoto';
import { lastInteraction, lastServerActivity } from '../../lib/sessionActivity';
import { fetchSessionStatus, logoutRequest } from '../services/authApi';

// The server ends a session after 20 minutes without activity; this keeps the
// page in step with it. It tells the server when someone is using the page
// without it making requests (reading, filling in a long form), warns a
// minute before the timeout, and near the end asks the server rather than
// trusting the local clock, since another tab may have kept the session
// alive. When the server has ended the session, its 401 goes through the
// usual handling in App, which returns to the login page. Nothing is polled
// while the person is away except those checks near the deadline.

const DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const WARNING_MS = 60 * 1000;
// Activity without requests is reported to the server this often at most.
const ACTIVITY_REPORT_MS = 4 * 60 * 1000;
const TICK_MS = 15 * 1000;

const formatCountdown = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export function SessionTimeout() {
  const idleTimeoutRef = useRef(DEFAULT_IDLE_TIMEOUT_MS);
  // When the server will end the session if nothing else happens.
  const deadlineRef = useRef(0);
  const syncingRef = useRef(false);
  const expiryCheckedRef = useRef(false);
  const [warningUntil, setWarningUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loggingOut, setLoggingOut] = useState(false);

  const sync = useCallback(async (mode: 'active' | 'passive') => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const status = await fetchSessionStatus(mode);
      idleTimeoutRef.current = status.idleTimeoutSeconds * 1000;
      deadlineRef.current = Date.now() + status.idleExpiresInSeconds * 1000;
    } catch {
      // A 401 is handled globally; a network error is retried on the next tick.
    } finally {
      syncingRef.current = false;
    }
  }, []);

  const tick = useCallback(async () => {
    // The person's own requests have already moved the server's deadline.
    deadlineRef.current = Math.max(deadlineRef.current, lastServerActivity() + idleTimeoutRef.current);
    if (lastInteraction() > lastServerActivity() && Date.now() - lastServerActivity() >= ACTIVITY_REPORT_MS) await sync('active');
    if (deadlineRef.current - Date.now() <= WARNING_MS) await sync('passive');
    const remaining = deadlineRef.current - Date.now();
    setNow(Date.now());
    setWarningUntil(remaining <= WARNING_MS ? deadlineRef.current : null);
  }, [sync]);

  useEffect(() => {
    void sync('passive');
    const timer = window.setInterval(() => void tick(), TICK_MS);
    // Timers are slowed in background tabs and stop while a laptop sleeps.
    const onReturn = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [sync, tick]);

  // Countdown while the warning is shown; at zero, confirm with the server.
  useEffect(() => {
    if (warningUntil === null) return;
    expiryCheckedRef.current = false;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= warningUntil && !expiryCheckedRef.current) {
        expiryCheckedRef.current = true;
        void tick();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [warningUntil, tick]);

  const staySignedIn = async () => {
    await sync('active');
    await tick();
  };

  const logOut = async () => {
    setLoggingOut(true);
    await logoutRequest().catch(() => undefined);
    closeLiveUpdates();
    clearProfilePhoto();
    window.location.replace('/login');
  };

  if (warningUntil === null) return null;

  return (
    <div className="acf-modal fixed inset-0 bg-gray-900/50 flex items-center justify-center z-[80] p-4" role="alertdialog" aria-modal="true" aria-labelledby="session-timeout-title" aria-describedby="session-timeout-message">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
          <Clock3 className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <h2 id="session-timeout-title" className="text-xl font-bold text-gray-900">Are you still there?</h2>
        </div>
        <div className="p-6 space-y-4">
          <p id="session-timeout-message" className="text-sm text-gray-600">You have been inactive for a while. You will be logged out soon.</p>
          <div className="text-center">
            <p className="text-xs text-gray-500">Logging out in</p>
            <p className="text-3xl font-bold tabular-nums text-gray-900">{formatCountdown(warningUntil - now)}</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => void logOut()} disabled={loggingOut} className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 disabled:opacity-60">
              {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
            <button type="button" onClick={() => void staySignedIn()} disabled={loggingOut} autoFocus className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-60">
              Stay signed in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
