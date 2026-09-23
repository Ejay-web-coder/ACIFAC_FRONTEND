import { useEffect, useRef } from 'react';
import { API_URL, SESSION_ENDED_EVENT } from './api';

// Live updates over Server-Sent Events. The server only sends
// {table, op} for changes the signed-in user is allowed to see; pages
// re-fetch through the normal API, so authorisation stays on the backend.

type Listener = { tables: Set<string>; callback: () => void };

const listeners = new Set<Listener>();
let source: EventSource | null = null;

function ensureConnection() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource(`${API_URL}/api/events`, { withCredentials: true });
  source.addEventListener('change', (event) => {
    try {
      const { table } = JSON.parse((event as MessageEvent).data) as { table: string };
      for (const listener of listeners) if (listener.tables.has(table)) listener.callback();
    } catch {
      /* ignore malformed events */
    }
  });
  source.addEventListener('session-ended', () => {
    closeLiveUpdates();
    window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: 'Your session has ended. Please sign in again.' }));
  });
}

export function closeLiveUpdates() {
  source?.close();
  source = null;
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
