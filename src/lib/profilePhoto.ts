import { useEffect, useState } from 'react';
import { API_URL, ApiError, apiDelete, apiFetch, SESSION_ENDED_EVENT } from './api';

// The signed-in user's own profile picture, shared by the top bar and the
// Settings page. It is kept only for the current session and cleared on
// logout, so the next person to sign in on this browser never sees it.

let objectUrl: string | null = null;
let state: 'idle' | 'loading' | 'ready' = 'idle';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function setPicture(url: string | null) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = url;
  state = 'ready';
  notify();
}

// Downloads a protected image (sent with the session cookie) as an object URL;
// null when there is none.
export async function fetchProtectedImage(path: string) {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  if (!response.ok) return null;
  return URL.createObjectURL(await response.blob());
}

export async function loadProfilePhoto() {
  if (state !== 'idle') return;
  state = 'loading';
  try {
    setPicture(await fetchProtectedImage('/api/auth/profile-photo'));
  } catch {
    setPicture(null);
  }
}

export function clearProfilePhoto() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  state = 'idle';
  notify();
}

if (typeof window !== 'undefined') window.addEventListener(SESSION_ENDED_EVENT, clearProfilePhoto);

// Crops the picture to a centred square and scales it to 512 px, so uploads
// are about 100 KB whatever the camera produced.
export async function toSquarePicture(file: File, size = 512): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the picture.');
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Unable to prepare the picture.'))), 'image/jpeg', 0.88));
    return new File([blob], 'profile-picture.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

// `cropped` pictures come from the crop window already square and 512 px, so
// they are sent as they are instead of being compressed a second time.
export async function uploadProfilePhoto(file: File, { cropped = false } = {}) {
  if (!file.type.startsWith('image/')) throw new ApiError('Choose a JPG, PNG or WEBP picture.', 400);
  const picture = cropped ? file : await toSquarePicture(file);
  const form = new FormData();
  form.append('photo', picture);
  await apiFetch<{ success: boolean }>('/api/auth/profile-photo', { method: 'POST', body: form });
  setPicture(URL.createObjectURL(picture));
}

export async function removeProfilePhoto() {
  await apiDelete<{ success: boolean }>('/api/auth/profile-photo');
  setPicture(null);
}

export function useProfilePhoto() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((value) => value + 1);
    listeners.add(listener);
    void loadProfilePhoto();
    return () => { listeners.delete(listener); };
  }, []);
  return objectUrl;
}
