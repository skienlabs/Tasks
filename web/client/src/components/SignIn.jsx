import { useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, IconButton, InputAdornment, Link, TextField, Typography, useMediaQuery,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import ArrowBack from '@mui/icons-material/ArrowBack';
import WelcomeArt from './WelcomeArt.jsx';
import { resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail } from '../lib/auth.js';

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split screen: the feature showcase on the left (a band on top on phones), the form on the right. */
function Shell({ children }) {
  const wide = useMediaQuery((t) => t.breakpoints.up('md'));
  return (
    <Box
      sx={{
        minHeight: '100dvh', display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(440px, 1fr)' },
        gridTemplateRows: { xs: 'auto 1fr', md: '1fr' },
      }}
    >
      <WelcomeArt compact={!wide} />
      <Box component="main" sx={{ display: 'grid', placeItems: 'center', px: { xs: 2.5, sm: 4, md: 6 }, py: { xs: 4, md: 6 } }}>
        <Box sx={{ width: '100%', maxWidth: 400 }}>{children}</Box>
      </Box>
    </Box>
  );
}

function Header({ title, subtitle }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography component="h1" sx={{ fontWeight: 500, fontSize: { xs: 28, sm: 34 }, letterSpacing: '-0.015em', lineHeight: 1.15 }}>{title}</Typography>
      {subtitle && <Typography color="text.secondary" sx={{ mt: 0.75, fontSize: 16 }}>{subtitle}</Typography>}
    </Box>
  );
}

function PasswordField({ label, value, onChange, autoComplete, helperText, error }) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      label={label}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      required
      fullWidth
      error={error}
      helperText={helperText}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)} edge="end">
                {show ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

export default function SignIn({ variant, error, onError }) {
  const [mode, setMode] = useState('signin'); // signin | signup | reset
  const [busy, setBusy] = useState(''); // '' | 'google' | 'email'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const switchTo = (m) => {
    onError?.('');
    setTouched(false);
    setResetSent(false);
    setMode(m);
  };

  const attempt = useRef(0);
  const run = async (kind, fn) => {
    const mine = ++attempt.current; // only the newest attempt updates the screen
    onError?.('');
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      if (mine === attempt.current) onError?.(err.message);
    } finally {
      if (mine === attempt.current) setBusy('');
    }
  };

  if (variant) {
    return (
      <Shell>
        <Header title="Plan each day. Finish what matters." />
        {variant === 'setup' && (
          <Alert severity="info" sx={{ borderRadius: 3 }}>
            Sign-in isn&apos;t configured yet. Put your Firebase web config in <code>/config/firebase-config.json</code>
            {' '}inside the container (see README) and restart it.
          </Alert>
        )}
        {variant === 'error' && (
          <Box sx={{ display: 'grid', gap: 2, justifyItems: 'center' }}>
            <Alert severity="error" sx={{ borderRadius: 3, width: '100%' }}>Can&apos;t reach the Tasks server.</Alert>
            <Button variant="outlined" onClick={() => window.location.reload()}>Try again</Button>
          </Box>
        )}
      </Shell>
    );
  }

  const emailOk = EMAIL_RE.test(email.trim());
  const passOk = mode === 'signup' ? password.length >= 8 : password.length > 0;
  const nameOk = name.trim().length > 0;

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (mode === 'reset') {
      if (!emailOk) return;
      run('email', async () => {
        await resetPassword(email);
        setResetSent(true);
      });
      return;
    }
    if (!emailOk || !passOk || (mode === 'signup' && !nameOk)) return;
    run('email', () => (mode === 'signup' ? signUpWithEmail(name, email, password) : signInWithEmail(email, password)));
  };

  const google = (
    <Button
      variant="outlined"
      size="large"
      fullWidth
      onClick={() => run('google', signInWithGoogle)}
      // Stays clickable while the popup is open: Firebase only reports a closed popup after
      // ~10s, and clicking again simply replaces the previous popup request.
      disabled={busy === 'email'}
      startIcon={busy === 'google' ? <CircularProgress size={18} /> : <GoogleG />}
      sx={(t) => ({
        height: 48, color: 'text.primary', borderColor: t.tokens.outline, fontSize: 15,
        bgcolor: t.palette.mode === 'dark' ? '#131314' : '#fff',
      })}
    >
      Continue with Google
    </Button>
  );

  const titles = {
    signin: ['Welcome back', 'Sign in to your tasks'],
    signup: ['Create your account', 'Plan each day. Finish what matters.'],
    reset: ['Reset password', 'We’ll email you a link to choose a new one'],
  };

  return (
    <Shell>
      {mode === 'reset' && (
        <IconButton aria-label="Back to sign in" onClick={() => switchTo('signin')} sx={{ ml: -1, mt: -1 }}>
          <ArrowBack />
        </IconButton>
      )}
      <Header title={titles[mode][0]} subtitle={titles[mode][1]} />

      {mode !== 'reset' && (
        <>
          {google}
          <Divider sx={{ my: 2.5, color: 'text.secondary', fontSize: 13 }}>or</Divider>
        </>
      )}

      <Box component="form" noValidate onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
        {mode === 'signup' && (
          <TextField
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            fullWidth
            error={touched && !nameOk}
            helperText={touched && !nameOk ? 'Enter your name' : ' '}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
        )}
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete={mode === 'signup' ? 'email' : 'username'}
          required
          fullWidth
          error={touched && !emailOk}
          helperText={touched && !emailOk ? 'Enter a valid email' : ' '}
        />
        {mode !== 'reset' && (
          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            error={touched && !passOk}
            helperText={mode === 'signup' ? 'At least 8 characters' : touched && !passOk ? 'Enter your password' : ' '}
          />
        )}

        {mode === 'signin' && (
          <Link component="button" type="button" onClick={() => switchTo('reset')} sx={{ justifySelf: 'start', mt: -1, fontSize: 14 }}>
            Forgot password?
          </Link>
        )}

        {resetSent && (
          <Alert severity="success" sx={{ borderRadius: 3 }}>
            If an account exists for {email.trim()}, a reset link is on its way. Check your inbox and spam folder.
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={busy === 'email'}
          startIcon={busy === 'email' ? <CircularProgress size={18} color="inherit" /> : null}
          sx={{ height: 48, fontSize: 15 }}
        >
          {mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
        </Button>
      </Box>

      {mode !== 'reset' && (
        <Typography sx={{ textAlign: 'center', mt: 3, fontSize: 14.5 }} color="text.secondary">
          {mode === 'signin' ? 'New to Tasks? ' : 'Already have an account? '}
          <Link component="button" type="button" onClick={() => switchTo(mode === 'signin' ? 'signup' : 'signin')} sx={{ fontSize: 14.5, fontWeight: 500, verticalAlign: 'baseline' }}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </Link>
        </Typography>
      )}
    </Shell>
  );
}
