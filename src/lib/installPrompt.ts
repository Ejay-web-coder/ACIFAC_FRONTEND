import { useEffect, useState } from 'react';

// Browsers that support installing web apps (Chrome, Edge, Android) fire
// `beforeinstallprompt` once, possibly before React mounts, so it is captured
// here at startup and handed to whichever Install button is on screen.
// iPhone/iPad Safari never fires it; those users add the app from the Share menu.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Service worker registration failed:', error));
  });
}

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function useInstallPrompt() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const installed = isStandalone();
  return {
    // Already running as the installed app: nothing to offer.
    installed,
    canPrompt: !installed && deferred !== null,
    // iOS has no prompt; show the Add to Home Screen steps instead.
    showIosSteps: !installed && deferred === null && isIos(),
    install: async () => {
      if (!deferred) return false;
      const event = deferred;
      deferred = null;
      await event.prompt();
      const { outcome } = await event.userChoice;
      notify();
      return outcome === 'accepted';
    },
  };
}
