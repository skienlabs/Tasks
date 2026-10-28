import { readPref } from './prefs.js';

/** The server's settings as last loaded (App saves them on start, also for offline use). */
export function serverConfig() {
  try {
    return JSON.parse(readPref('tasks.config') || 'null') ?? {};
  } catch {
    return {};
  }
}

export const ANDROID_DOWNLOAD_URL = '/download/android';

/** The Android app offered by this server: { size } or null when there is none. */
export function androidApp() {
  const a = serverConfig().android;
  return a && typeof a.size === 'number' ? a : null;
}

export const isAndroid = () => /Android/i.test(globalThis.navigator?.userAgent ?? '');

export function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
