import { initializeApp } from '@firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
} from '@firebase/auth';
import { setTokenGetter } from './api.js';
import { readPref, writePref } from './prefs.js';
import { clearStore, pendingChanges, wipeOffline } from './store.js';

let auth = null;
let devMode = false;
let started = false;
let signUpName = ''; // remembered so the welcome screen can prefill it

const DEV_USER = { uid: 'dev-user', displayName: 'Developer', email: 'dev@localhost', photoURL: null };

const toUser = (u) => (u ? { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL } : null);

/** Starts auth and calls `onUser(user | null)` whenever the session changes. */
export function startAuth(config, onUser, onError) {
  if (started) return; // React StrictMode runs effects twice in development
  started = true;
  if (config.devAuth) {
    devMode = true;
    // Local development: localStorage "tasks.devAs" = "ann" signs in as ann@localhost instead
    // (to try teams with several people). The server ignores this outside development.
    const as = /^[a-z0-9]{1,20}$/.test(readPref('tasks.devAs') || '') ? readPref('tasks.devAs') : null;
    const user = as
      ? { uid: `dev-${as}`, displayName: as[0].toUpperCase() + as.slice(1), email: `${as}@localhost`, photoURL: null }
      : DEV_USER;
    setTokenGetter(async () => (as ? `dev:${as}` : null));
    onUser(readPref('tasks.devSignedIn') !== '0' ? user : null);
    return;
  }
  const app = initializeApp(config.firebase);
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  if (config.authEmulator) connectAuthEmulator(auth, config.authEmulator, { disableWarnings: true }); // local testing only
  setTokenGetter((force) => (auth.currentUser ? auth.currentUser.getIdToken(force) : Promise.resolve(null)));
  getRedirectResult(auth).catch((err) => onError(describe(err)));
  onAuthStateChanged(auth, (u) => onUser(toUser(u)));
}

function devSignIn() {
  writePref('tasks.devSignedIn', '1');
  window.location.reload();
}

export async function signInWithGoogle() {
  if (devMode) return devSignIn();
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
    throw new Error(describe(err, 'Google'));
  }
}

export async function signInWithEmail(email, password) {
  if (devMode) return devSignIn();
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (err) {
    throw new Error(describe(err, 'Email'));
  }
}

export async function signUpWithEmail(name, email, password) {
  signUpName = name.trim();
  if (devMode) return devSignIn();
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(user, { displayName: signUpName });
    await user.getIdToken(true); // so the server sees the name right away
    sendEmailVerification(user).catch(() => {}); // best effort; can be resent from Account
  } catch (err) {
    throw new Error(describe(err, 'Email'));
  }
}

export async function resetPassword(email) {
  if (devMode) return;
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    throw new Error(describe(err, 'Email'));
  }
}

export async function resendVerification() {
  if (devMode || !auth?.currentUser) return;
  try {
    await sendEmailVerification(auth.currentUser);
  } catch (err) {
    throw new Error(describe(err, 'Email'));
  }
}

/** After the user clicks the link in the email: refresh so the new status reaches the server. */
export async function refreshUser() {
  if (devMode || !auth?.currentUser) return;
  await reload(auth.currentUser);
  await auth.currentUser.getIdToken(true);
}

export function suggestedName() {
  return auth?.currentUser?.displayName || signUpName || '';
}

export async function signOut() {
  // Changes made offline and not sent yet would be lost: ask first.
  const waiting = pendingChanges();
  if (waiting > 0 && !window.confirm(
    `${waiting} change${waiting === 1 ? " hasn't" : "s haven't"} reached the server yet (you're offline). `
    + 'Signing out now discards them. Sign out anyway?',
  )) return;
  // Stop everything first (no late save can bring the copy back), then delete this device's copy.
  clearStore();
  await wipeOffline();
  if (devMode) {
    writePref('tasks.devSignedIn', '0');
    window.location.reload();
    return;
  }
  await fbSignOut(auth);
}

function describe(err, method = '') {
  const code = err?.code || '';
  switch (code) {
    case 'auth/unauthorized-domain':
      return `This domain (${window.location.hostname}) is not authorised in Firebase. Add it under Authentication > Settings > Authorized domains.`;
    case 'auth/operation-not-allowed':
      return `${method || 'This'} sign-in is not enabled in Firebase Authentication > Sign-in method.`;
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Email or password is incorrect. If you signed up with Google, use Continue with Google.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead, or use Continue with Google if you signed up with it.';
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Choose a stronger password (at least 8 characters).';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/missing-email':
      return 'Enter your email address.';
    default:
      return err?.message || 'Something went wrong. Please try again.';
  }
}
