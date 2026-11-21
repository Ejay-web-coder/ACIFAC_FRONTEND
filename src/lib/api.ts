// Single HTTP client for the ACIFAC API. Every request sends the session
// cookie and the X-Requested-With header the backend requires for CSRF
// protection on state-changing requests.
import { isUserActive, noteServerActivity, SESSION_ACTIVITY_HEADER } from './sessionActivity';

export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  errors?: string[];
  /** The full error response, e.g. retryAfterSeconds on a sign-in lockout. */
  data: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, errors?: string[], data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.data = data;
  }
}

export const SESSION_ENDED_EVENT = 'acifac:session-ended';
export const SESSION_LOCKED_EVENT = 'acifac:session-locked';
export const PASSWORD_CHANGE_EVENT = 'acifac:password-change-required';
export const SESSION_IDLE_MESSAGE = 'Your session expired because of inactivity. Please log in again.';
const SESSION_ENDED_MESSAGE = 'Your session has expired. Please log in again.';
// How long a request waits for the backend to come back after a restart.
const BACKEND_RESTART_WAIT_MS = 30000;

// After 20 minutes without activity the server locks the session (401
// SESSION_LOCKED) until the person enters their password again. Meanwhile the
// page's requests wait and go out once it is unlocked, and a request the
// server refused because of the lock is sent again (the server did nothing
// with it), so the page carries on where it was. These are sent anyway: they
// unlock, check or end the session.
const SENT_WHILE_LOCKED = new Set(['/api/auth/unlock', '/api/auth/logout', '/api/auth/login', '/api/auth/me', '/api/auth/session', '/api/events/changes']);
let lockGate: Promise<boolean> | null = null;
let openLockGate: (stillSignedIn: boolean) => void = () => undefined;

export const isSessionLocked = () => lockGate !== null;

/** The session is locked: requests wait, and the lock screen opens (SESSION_LOCKED_EVENT). */
export function markSessionLocked() {
  if (lockGate) return;
  lockGate = new Promise<boolean>((resolve) => { openLockGate = resolve; });
  window.dispatchEvent(new CustomEvent(SESSION_LOCKED_EVENT));
}

/** Unlocked: the waiting requests are sent. stillSignedIn false: the session ended, and they fail as signed out. */
export function markSessionUnlocked(stillSignedIn = true) {
  if (!lockGate) return;
  lockGate = null;
  openLockGate(stillSignedIn);
}

if (typeof window !== 'undefined') window.addEventListener(SESSION_ENDED_EVENT, () => markSessionUnlocked(false));

async function waitWhileLocked() {
  while (lockGate) {
    if (!(await lockGate)) throw new ApiError(SESSION_ENDED_MESSAGE, 401, 'SESSION_INVALID');
  }
}

async function sendRequest(path: string, options: RequestInit) {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  // Requests made while nobody is using the page (background refreshes) do
  // not extend the session's inactivity timeout.
  if (!headers.has(SESSION_ACTIVITY_HEADER) && !isUserActive()) headers.set(SESSION_ACTIVITY_HEADER, 'passive');
  const countsAsActivity = headers.get(SESSION_ACTIVITY_HEADER) !== 'passive';

  const send = () => fetch(`${API_URL}${path}`, { ...options, credentials: 'include', headers });
  let response: Response;
  try {
    response = await send();
    // In development the backend restarts when one of its files is saved. The
    // Vite proxy then answers 503 with X-Backend-Unavailable: the request never
    // reached the backend, so it is safe to send again until the backend is back.
    const giveUpAt = Date.now() + BACKEND_RESTART_WAIT_MS;
    while (response.status === 503 && response.headers.has('X-Backend-Unavailable') && Date.now() < giveUpAt) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await send();
    }
  } catch {
    throw new ApiError('Unable to reach the ACIFAC server. Check your connection and try again.', 0);
  }
  const data = await response.json().catch(() => ({}));
  return { response, data, countsAsActivity };
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const waitsWhileLocked = !SENT_WHILE_LOCKED.has(path.split('?')[0]);
  let attempt: Awaited<ReturnType<typeof sendRequest>>;
  for (;;) {
    if (waitsWhileLocked) await waitWhileLocked();
    attempt = await sendRequest(path, options);
    if (attempt.response.status !== 401 || attempt.data.code !== 'SESSION_LOCKED') break;
    markSessionLocked();
    if (!waitsWhileLocked) break;
  }
  const { response, data, countsAsActivity } = attempt;
  if (countsAsActivity && response.status !== 401) noteServerActivity();

  if (!response.ok) {
    const error = new ApiError(data.message || 'Request failed.', response.status, data.code, data.errors, data);
    if (response.status === 401 && data.code !== 'SESSION_LOCKED' && path !== '/api/auth/login' && path !== '/api/auth/me') {
      window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: error.message }));
    }
    if (data.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new CustomEvent(PASSWORD_CHANGE_EVENT));
    throw error;
  }
  return data as T;
}

export const apiGet = <T>(path: string) => apiFetch<T>(path);
export const apiPost = <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });
export const apiPut = <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
export const apiPatch = <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
export const apiDelete = <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' });

// Downloads a protected file (sent with the session cookie) to show it in the page.
export async function fetchProtectedBlob(path: string) {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.message || 'Unable to load the file.', response.status);
  }
  return response.blob();
}

// Downloads a protected file (sent with the session cookie) and opens it.
export async function openProtectedFile(path: string) {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.message || 'Unable to open the file.', response.status);
  }
  const url = URL.createObjectURL(await response.blob());
  const opened = window.open(url, '_blank');
  if (!opened) window.location.assign(url);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const errorMessage = (error: unknown, fallback = 'Something went wrong.') => (error instanceof Error ? error.message : fallback);
