import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CssBaseline, LinearProgress, ThemeProvider, Typography, useMediaQuery } from '@mui/material';
import { makeTheme } from './theme.js';
import { refreshUser, resendVerification, signOut, startAuth } from './lib/auth.js';
import { api } from './lib/api.js';
import { clearStore } from './lib/store.js';
import { readPref, writePref } from './lib/prefs.js';
import Logo from './components/Logo.jsx';
import Home from './components/Home.jsx';

// Only needed when signed out / on first run: loaded on demand to keep the app quick to open.
const SignIn = lazy(() => import('./components/SignIn.jsx'));
const Onboarding = lazy(() => import('./components/Onboarding.jsx'));

export default function App() {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const [themePref, setThemePref] = useState(() => readPref('tasks.theme')); // 'light' | 'dark' | null
  const mode = themePref ?? (systemDark ? 'dark' : 'light');
  const theme = useMemo(() => makeTheme(mode), [mode]);

  const [boot, setBoot] = useState('loading'); // loading | ready | setup | error
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [authError, setAuthError] = useState('');
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [profileTry, setProfileTry] = useState(0);
  const uid = user?.uid;
  const userRef = useRef(null);

  // Load (and create on first sign-in) the user's profile.
  useEffect(() => {
    setProfile(null);
    setProfileError(null);
    if (!uid) return undefined;
    let alive = true;
    api('GET', '/api/me')
      .then((p) => alive && setProfile(p))
      .catch((err) => {
        if (!alive) return;
        // Never sign out automatically on an API error: a server or network hiccup
        // must not log people out. Firebase itself reports real sign-outs.
        setProfileError(err);
      });
    return () => {
      alive = false;
    };
  }, [uid, profileTry]);

  useEffect(() => {
    const bg = theme.palette.background.default;
    document.documentElement.style.backgroundColor = bg;
    document.documentElement.style.colorScheme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }, [mode, theme]);

  useEffect(() => {
    let alive = true;
    fetch('/api/config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((cfg) => {
        if (!alive) return;
        if (!cfg.configured) {
          setBoot('setup');
          return;
        }
        setBoot('ready');
        startAuth(
          cfg,
          (u) => {
            const prev = userRef.current;
            if (prev && (!u || u.uid !== prev.uid)) clearStore(); // signed out or another account
            userRef.current = u;
            setUser(u);
          },
          setAuthError,
        );
      })
      .catch(() => alive && setBoot('error'));
    return () => {
      alive = false;
    };
  }, []);

  const changeTheme = (pref) => {
    setThemePref(pref);
    writePref('tasks.theme', pref);
  };

  let screen;
  if (boot === 'setup' || boot === 'error') {
    screen = <SignIn variant={boot} />;
  } else if (boot === 'loading' || user === undefined) {
    screen = <Splash />;
  } else if (!user) {
    screen = <SignIn error={authError} onError={setAuthError} />;
  } else if (profileError) {
    screen = <ProfileError error={profileError} email={user.email} onRetry={() => setProfileTry((n) => n + 1)} />;
  } else if (!profile || profile.uid !== user.uid) {
    screen = <Splash />;
  } else if (!profile.onboarded) {
    screen = <Onboarding profile={profile} onDone={setProfile} />;
  } else {
    screen = (
      <Home
        user={{ ...user, displayName: profile.name }}
        profile={profile}
        onProfile={setProfile}
        mode={mode}
        themePref={themePref}
        onThemeChange={changeTheme}
      />
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Suspense fallback={<Splash />}>{screen}</Suspense>
    </ThemeProvider>
  );
}

function ProfileError({ error, email, onRetry }) {
  const blocked = error.status === 403;
  const session = error.status === 401;
  const needsVerify = blocked && /verify your email/i.test(error.message);
  const [note, setNote] = useState('');
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3, textAlign: 'center' }}>
      <Box sx={{ display: 'grid', gap: 2, justifyItems: 'center', maxWidth: 440 }}>
        <Logo size={56} />
        <Typography variant="h6">
          {needsVerify ? 'Verify your email to continue'
            : blocked ? error.message
              : session ? 'Your session could not be confirmed' : "Couldn't load your account"}
        </Typography>
        <Typography color="text.secondary">
          {needsVerify ? `We sent a link to ${email}. Open it, then come back here.`
            : blocked ? `Signed in as ${email}`
              : session ? 'Try again, or sign out and sign back in.' : error.message}
        </Typography>
        {note && <Typography variant="body2" color="primary">{note}</Typography>}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          {needsVerify && (
            <>
              <Button variant="contained" onClick={async () => {
                try {
                  await refreshUser();
                  onRetry();
                } catch (err) {
                  setNote(err.message);
                }
              }}
              >
                I&apos;ve verified
              </Button>
              <Button variant="outlined" onClick={async () => {
                try {
                  await resendVerification();
                  setNote(`Verification email sent to ${email}`);
                } catch (err) {
                  setNote(err.message);
                }
              }}
              >
                Resend email
              </Button>
            </>
          )}
          {!blocked && <Button variant="contained" onClick={onRetry}>Try again</Button>}
          <Button variant={needsVerify ? 'text' : 'outlined'} onClick={() => signOut()}>
            {blocked && !needsVerify ? 'Use another account' : 'Sign out'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

function Splash() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <Box sx={{ display: 'grid', justifyItems: 'center', gap: 3 }}>
        <Logo size={56} />
        <LinearProgress sx={{ width: 120, borderRadius: 2 }} />
      </Box>
    </Box>
  );
}
