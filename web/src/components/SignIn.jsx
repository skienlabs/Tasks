import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import Logo from './Logo.jsx';
import { signIn } from '../lib/auth.js';

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

export default function SignIn({ variant, error, onError }) {
  const [busy, setBusy] = useState(false);

  const go = async () => {
    onError?.('');
    setBusy(true);
    try {
      await signIn();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Box
        sx={(t) => ({
          width: '100%',
          maxWidth: 420,
          p: { xs: 4, sm: 5 },
          borderRadius: '28px',
          bgcolor: t.tokens.surfaceHigh,
          border: `1px solid ${t.palette.divider}`,
          display: 'grid',
          justifyItems: 'center',
          textAlign: 'center',
          gap: 1,
        })}
      >
        <Logo size={64} />
        <Typography variant="h4" sx={{ mt: 2, fontWeight: 400 }}>Tasks</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Plan each day. Finish what matters.
        </Typography>

        {variant === 'setup' && (
          <Alert severity="info" sx={{ textAlign: 'left', borderRadius: 3 }}>
            Sign-in isn&apos;t configured yet. Put your Firebase web config in{' '}
            <code>/config/firebase-config.json</code> inside the container (see README) and restart it.
          </Alert>
        )}
        {variant === 'error' && (
          <>
            <Alert severity="error" sx={{ textAlign: 'left', borderRadius: 3, mb: 2 }}>
              Can&apos;t reach the Tasks server.
            </Alert>
            <Button variant="outlined" onClick={() => window.location.reload()}>Try again</Button>
          </>
        )}
        {!variant && (
          <>
            <Button
              variant="outlined"
              size="large"
              onClick={go}
              disabled={busy}
              startIcon={busy ? <CircularProgress size={18} /> : <GoogleG />}
              sx={(t) => ({
                height: 48,
                px: 3,
                color: 'text.primary',
                borderColor: t.tokens.outline,
                bgcolor: t.palette.mode === 'dark' ? '#131314' : '#fff',
                fontSize: 15,
              })}
            >
              Sign in with Google
            </Button>
            {error && (
              <Alert severity="error" sx={{ mt: 2, textAlign: 'left', borderRadius: 3 }}>{error}</Alert>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
