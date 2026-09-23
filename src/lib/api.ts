// Single HTTP client for the ACIFAC API. Every request sends the session
// cookie and the X-Requested-With header the backend requires for CSRF
// protection on state-changing requests.

export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  errors?: string[];

  constructor(message: string, status: number, code?: string, errors?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export const SESSION_ENDED_EVENT = 'acifac:session-ended';
export const PASSWORD_CHANGE_EVENT = 'acifac:password-change-required';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', headers });
  } catch {
    throw new ApiError('Unable to reach the ACIFAC server. Check your connection and try again.', 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new ApiError(data.message || 'Request failed.', response.status, data.code, data.errors);
    if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/me') {
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
