import { useEffect, useRef } from 'react';
import { API_URL, apiFetch, SESSION_ENDED_EVENT, SESSION_IDLE_MESSAGE } from './api';
import { SESSION_ACTIVITY_HEADER } from './sessionActivity';

// Live updates over Server-Sent Events. The server only sends
// {table, op} for changes the signed-in user is allowed to see; pages
// re-fetch through the normal API, so authorisation stays on the backend.
//
// Where the server cannot stream (on Vercel live updates are off), the browser
// asks every 3 seconds which tables changed (GET /api/events/changes) and
// refreshes the pages that show them. The checks never count as activity, so
// the inactivity sign-out still happens, and they pause while the tab is hidden.

type Listener = { tables: Set<string>; callback: () => void };

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let streaming = false;

export const AUTO_REFRESH_MS = 3000;
// Back in the tab after this long: refresh everything rather than trust the change log.
const STALE_AFTER_MS = 60000;
let pollTimer: number | undefined;
let polling = false;
let cursor: string | null = null;
// Change ids already handled; recent changes are sent again on every check.
let seen = new Set<string>();
let hiddenSince: number | null = null;

const notify = (tables: Iterable<string>) => {
  const changed = new Set(tables);
  for (const listener of listeners) if ([...listener.tables].some((table) => changed.has(table))) listener.callback();
};
const notifyAll = () => { for (const listener of listeners) listener.callback(); };

async function poll() {
  if (polling || document.hidden || (streaming && source?.readyState === EventSource.OPEN)) return;
  polling = true;
  try {
    const result = await apiFetch<{ cursor: string; changes: Array<{ id: string; table: string }> }>(
      `/api/events/changes${cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`,
      { headers: { [SESSION_ACTIVITY_HEADER]: 'passive' } },
    );
    const fresh = result.changes.filter((change) => !seen.has(change.id));
    seen = new Set(result.changes.map((change) => change.id));
    const first = cursor === null;
    cursor = result.cursor;
    if (!first && fresh.length) notify(fresh.map((change) => change.table));
  } catch (error) {
    // A signed-out session stops the checks (apiFetch already signs the person out);
    // anything else is tried again on the next check.
    if ((error as { status?: number }).status === 401) stopPolling();
  } finally {
    polling = false;
  }
}

function onVisibilityChange() {
  if (document.hidden) { hiddenSince = Date.now(); return; }
  const away = hiddenSince === null ? 0 : Date.now() - hiddenSince;
  hiddenSince = null;
  if (away > STALE_AFTER_MS && !(streaming && source?.readyState === EventSource.OPEN)) notifyAll();
  void poll();
}

function startPolling() {
  if (pollTimer !== undefined) return;
  void poll();
  pollTimer = window.setInterval(() => { void poll(); }, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function stopPolling() {
  window.clearInterval(pollTimer);
  pollTimer = undefined;
  cursor = null;
  seen = new Set();
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

function ensureConnection() {
  startPolling();
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource(`${API_URL}/api/events`, { withCredentials: true });
  // While the stream is live the checks are skipped; they take over if it drops.
  source.addEventListener('ready', (event) => {
    try {
      streaming = Boolean((JSON.parse((event as MessageEvent).data) as { live?: boolean }).live);
    } catch {
      streaming = false;
    }
  });
  source.addEventListener('error', () => { streaming = false; });
  source.addEventListener('change', (event) => {
    try {
      const { table } = JSON.parse((event as MessageEvent).data) as { table: string };
      for (const listener of listeners) if (listener.tables.has(table)) listener.callback();
    } catch {
      /* ignore malformed events */
    }
  });
  source.addEventListener('session-ended', (event) => {
    let reason = '';
    try {
      reason = (JSON.parse((event as MessageEvent).data) as { reason?: string }).reason || '';
    } catch {
      /* no reason given */
    }
    closeLiveUpdates();
    window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: reason === 'inactivity' ? SESSION_IDLE_MESSAGE : 'Your session has ended. Please sign in again.' }));
  });
}

export function closeLiveUpdates() {
  source?.close();
  source = null;
  streaming = false;
  stopPolling();
}

// Calls `onChange` (debounced) whenever one of `tables` changes.
export function useLiveRefresh(tables: string[], onChange: () => void, delayMs = 400) {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;
  const key = tables.join(',');

  useEffect(() => {
    let timer: number | undefined;
    const listener: Listener = {
      tables: new Set(key.split(',').filter(Boolean)),
      callback: () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => callbackRef.current(), delayMs);
      },
    };
    listeners.add(listener);
    ensureConnection();
    return () => {
      window.clearTimeout(timer);
      listeners.delete(listener);
      if (listeners.size === 0) closeLiveUpdates();
    };
  }, [key, delayMs]);
}
