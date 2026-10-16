import { useEffect, useMemo, useState } from 'react';
import { Box, Button, CssBaseline, LinearProgress, ThemeProvider, Typography, useMediaQuery } from '@mui/material';
import { makeTheme } from './theme.js';
import { signOut, startAuth } from './lib/auth.js';
import { api } from './lib/api.js';
import { clearStore } from './lib/store.js';
import { readPref, writePref } from './lib/prefs.js';
import Logo from './components/Logo.jsx';
import SignIn from './components/SignIn.jsx';
import Home from './components/Home.jsx';
import Onboarding from './components/Onboarding.jsx';

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
        if (err.status === 401) signOut();
        else setProfileError(err);
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
          (u) =>
            setUser((prev) => {
              if (prev && (!u || u.uid !== prev.uid)) clearStore();
              return u;
            }),
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
  } else if (!profile) {
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
      {screen}
    </ThemeProvider>
  );
}

function ProfileError({ error, email, onRetry }) {
  const blocked = error.status === 403;
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3, textAlign: 'center' }}>
      <Box sx={{ display: 'grid', gap: 2, justifyItems: 'center', maxWidth: 420 }}>
        <Logo size={56} />
        <Typography variant="h6">{blocked ? error.message : "Couldn't load your account"}</Typography>
        <Typography color="text.secondary">{blocked ? `Signed in as ${email}` : error.message}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {!blocked && <Button variant="contained" onClick={onRetry}>Try again</Button>}
          <Button variant="outlined" onClick={() => signOut()}>{blocked ? 'Use another account' : 'Sign out'}</Button>
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
