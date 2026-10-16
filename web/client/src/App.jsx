import { useEffect, useMemo, useState } from 'react';
import { Box, CssBaseline, LinearProgress, ThemeProvider, useMediaQuery } from '@mui/material';
import { makeTheme } from './theme.js';
import { startAuth } from './lib/auth.js';
import { clearStore } from './lib/store.js';
import { readPref, writePref } from './lib/prefs.js';
import Logo from './components/Logo.jsx';
import SignIn from './components/SignIn.jsx';
import Home from './components/Home.jsx';

export default function App() {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const [themePref, setThemePref] = useState(() => readPref('tasks.theme')); // 'light' | 'dark' | null
  const mode = themePref ?? (systemDark ? 'dark' : 'light');
  const theme = useMemo(() => makeTheme(mode), [mode]);

  const [boot, setBoot] = useState('loading'); // loading | ready | setup | error
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [authError, setAuthError] = useState('');

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
  } else {
    screen = <Home user={user} mode={mode} themePref={themePref} onThemeChange={changeTheme} />;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {screen}
    </ThemeProvider>
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
