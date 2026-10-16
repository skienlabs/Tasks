// "Install app" support (Chrome / Edge on Windows, Android). The browser fires
// beforeinstallprompt once the PWA is installable; we keep it for our own button.
import { useSyncExternalStore } from 'react';

let deferred = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => Boolean(deferred),
  );
  const install = async () => {
    if (!deferred) return false;
    const evt = deferred;
    deferred = null;
    notify();
    await evt.prompt();
    const choice = await evt.userChoice;
    return choice?.outcome === 'accepted';
  };
  return { canInstall, install };
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* app works without it */
    });
  });
}
