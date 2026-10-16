// The service worker opens the app quickly and keeps it usable offline. The app
// does not offer to install itself: the browser's own install banner (Chrome,
// Edge, Android) is held back too.
export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => event.preventDefault());
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Service worker registration failed:', error));
  });
}
