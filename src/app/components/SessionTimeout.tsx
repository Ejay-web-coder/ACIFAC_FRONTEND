import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isSessionLocked, markSessionLocked, markSessionUnlocked, SESSION_LOCKED_EVENT } from '../../lib/api';
import { closeLiveUpdates, resumeLiveUpdates } from '../../lib/liveUpdates';
import { lastInteraction, lastServerActivity } from '../../lib/sessionActivity';
import { fetchCurrentUser, fetchSessionStatus, type LockedAccount, type SessionStatus } from '../services/authApi';
import { SessionLock } from './SessionLock';

// The server locks a session after 20 minutes without activity; this keeps the
// page in step with it. It tells the server when someone is using the page
// without it making requests (reading, filling in a long form). When the time
// is up by this page's clock it asks the server rather than trusting the local
// clock, since another tab may have kept the session alive. Once the session
// is locked (found here, by any request, or by the live-update stream) the
// lock screen covers the page: "Stay logged in" with the password, or "Log
// out". Meanwhile the page's requests wait (see api.ts) and go on after the
// unlock. Nothing is polled while the person is away.

const DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
// Activity without requests is reported to the server this often at most.
const ACTIVITY_REPORT_MS = 4 * 60 * 1000;
// Only this page's clock is read this often; the server is asked when time is up.
const TICK_MS = 1000;

type Check = 'active' | 'locked' | 'ended' | 'unreachable';

export function SessionTimeout() {
  const idleTimeoutRef = useRef(DEFAULT_IDLE_TIMEOUT_MS);
  // When the server will lock the session if nothing else happens.
  const deadlineRef = useRef(0);
  const checkingRef = useRef(false);
  const [locked, setLocked] = useState(isSessionLocked);
  const [account, setAccount] = useState<LockedAccount | null>(null);

  // Asks the server how long the session has left (null: a check is already running).
  const check = useCallback(async (mode: 'active' | 'passive'): Promise<Check | null> => {
    if (checkingRef.current) return null;
    checkingRef.current = true;
    try {
      const status = await fetchSessionStatus(mode);
      idleTimeoutRef.current = status.idleTimeoutSeconds * 1000;
      deadlineRef.current = Date.now() + status.idleExpiresInSeconds * 1000;
      return 'active';
    } catch (error) {
      // SESSION_LOCKED has already opened the lock screen (api.ts); any other
      // 401 signs the page out (App).
      if (error instanceof ApiError && error.status === 401) return error.code === 'SESSION_LOCKED' ? 'locked' : 'ended';
      return 'unreachable';
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const tick = useCallback(async () => {
    if (isSessionLocked()) return;
    // The person's own requests have already moved the server's deadline.
    deadlineRef.current = Math.max(deadlineRef.current, lastServerActivity() + idleTimeoutRef.current);
    if (lastInteraction() > lastServerActivity() && Date.now() - lastServerActivity() >= ACTIVITY_REPORT_MS) await check('active');
    if (Date.now() < deadlineRef.current) return;
    // Time is up by this page's clock. Without an answer from the server, the page locks anyway.
    if ((await check('passive')) === 'unreachable') markSessionLocked();
  }, [check]);

  const finishUnlock = useCallback((status?: SessionStatus) => {
    if (status) {
      idleTimeoutRef.current = status.idleTimeoutSeconds * 1000;
      deadlineRef.current = Date.now() + status.idleExpiresInSeconds * 1000;
    }
    setLocked(false);
    setAccount(null);
    markSessionUnlocked();
    resumeLiveUpdates();
  }, []);

  useEffect(() => {
    void check('passive');
    const timer = window.setInterval(() => void tick(), TICK_MS);
    // Timers are slowed in background tabs and stop while a laptop sleeps.
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isSessionLocked()) {
        void tick();
        return;
      }
      // Unlocked in another tab meanwhile? A check that does not count as activity tells.
      void check('passive').then((result) => { if (result === 'active') finishUnlock(); });
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [check, tick, finishUnlock]);

  useEffect(() => {
    const onLocked = () => {
      setLocked(true);
      closeLiveUpdates();
      // Whose session it is, for the lock screen.
      fetchCurrentUser('passive')
        .then(({ user, locked: who }) => setAccount({
          username: who?.username ?? user?.username ?? null,
          display_name: who?.display_name ?? user?.display_name ?? null,
          idleTimeoutSeconds: who?.idleTimeoutSeconds ?? idleTimeoutRef.current / 1000,
        }))
        .catch(() => undefined);
    };
    window.addEventListener(SESSION_LOCKED_EVENT, onLocked);
    // Locked before this page part was shown.
    if (isSessionLocked()) onLocked();
    return () => window.removeEventListener(SESSION_LOCKED_EVENT, onLocked);
  }, []);

  if (!locked) return null;
  return (
    <SessionLock
      displayName={account?.display_name}
      username={account?.username}
      idleMinutes={Math.round((account?.idleTimeoutSeconds ?? DEFAULT_IDLE_TIMEOUT_MS / 1000) / 60)}
      onUnlocked={finishUnlock}
    />
  );
}
