import { initializeApp } from '@firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from '@firebase/auth';
import { setTokenGetter } from './api.js';
import { readPref, writePref } from './prefs.js';

let auth = null;
let devMode = false;

const DEV_USER = { uid: 'dev-user', displayName: 'Developer', email: 'dev@localhost', photoURL: null };

let started = false;

/** Starts auth and calls `onUser(user | null)` whenever the session changes. */
export function startAuth(config, onUser, onError) {
  if (started) return; // React StrictMode runs effects twice in development
  started = true;
  if (config.devAuth) {
    devMode = true;
    setTokenGetter(async () => null);
    const signedIn = readPref('tasks.devSignedIn') !== '0';
    onUser(signedIn ? DEV_USER : null);
    return;
  }
  const app = initializeApp(config.firebase);
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  setTokenGetter((force) => (auth.currentUser ? auth.currentUser.getIdToken(force) : Promise.resolve(null)));
  getRedirectResult(auth).catch((err) => onError(describe(err)));
  onAuthStateChanged(auth, (u) =>
    onUser(u ? { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL } : null));
}

export async function signIn() {
  if (devMode) {
    writePref('tasks.devSignedIn', '1');
    window.location.reload();
    return;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = err?.code || '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    throw new Error(describe(err));
  }
}

export async function signOut() {
  if (devMode) {
    writePref('tasks.devSignedIn', '0');
    window.location.reload();
    return;
  }
  await fbSignOut(auth);
}

function describe(err) {
  const code = err?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return `This domain (${window.location.hostname}) is not authorised in Firebase. Add it under Authentication > Settings > Authorized domains.`;
  }
  if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled in Firebase Authentication.';
  if (code === 'auth/network-request-failed') return 'Network error while signing in. Check your connection.';
  return err?.message || 'Sign-in failed';
}
