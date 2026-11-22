// Phone notifications (Web Push): the ACIFAC server sends each notification to
// the browsers that turned them on, through the service worker (public/sw.js),
// so they arrive even when the app is closed. On iPhone and iPad they work only
// in the app added to the Home Screen (iOS 16.4 and later).
import { API_URL, apiGet, apiPost } from './api';

export type PushState = 'unsupported' | 'ios-needs-install' | 'blocked' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration() {
  // The service worker is registered at start-up in the built app (main.tsx).
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? navigator.serviceWorker.register('/sw.js');
}

function keyBytes(base64Url: string) {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Whether this browser can get phone notifications, and whether it gets them now. */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const subscription = await (await registration()).pushManager.getSubscription();
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks for permission, subscribes this browser and tells the server. */
export async function turnOnPush(): Promise<PushState> {
  if (!pushSupported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const { publicKey } = await apiGet<{ publicKey: string }>('/api/push/key');
  const manager = (await registration()).pushManager;
  let subscription = await manager.getSubscription();
  // A subscription made with another server key cannot be used: start again.
  const serverKey = subscription?.options.applicationServerKey;
  if (subscription && serverKey && btoa(String.fromCharCode(...new Uint8Array(serverKey))).replace(/=+$/, '') !== btoa(String.fromCharCode(...keyBytes(publicKey))).replace(/=+$/, '')) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await manager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await apiPost('/api/push/subscriptions', subscription.toJSON());
  return 'on';
}

/** Stops phone notifications on this browser (for this account). */
export async function turnOffPush(): Promise<PushState> {
  if (!pushSupported()) return pushState();
  const subscription = await (await registration()).pushManager.getSubscription();
  if (subscription) {
    await apiPost('/api/push/subscriptions/remove', { endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  }
  return 'off';
}

/**
 * On sign-out: this browser stops getting the account's notifications, so the
 * next person who signs in on a shared phone does not see them. Never throws.
 */
export async function forgetPushOnSignOut() {
  try {
    if (!pushSupported()) return;
    const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (!subscription) return;
    // A plain request (not apiFetch, which waits while the session is locked);
    // if it fails, the push service reports the browser gone and the server drops it.
    await fetch(`${API_URL}/api/push/subscriptions/remove`, {
      method: 'POST', credentials: 'include', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  } catch {
    // Signing out goes on regardless.
  }
}
