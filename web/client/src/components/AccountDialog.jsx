import { useRef, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, Divider, IconButton, Link,
  TextField, Typography, useMediaQuery,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import MarkEmailUnreadOutlined from '@mui/icons-material/MarkEmailUnreadOutlined';
import LockResetOutlined from '@mui/icons-material/LockResetOutlined';
import Logout from '@mui/icons-material/Logout';
import { api } from '../lib/api.js';
import { refreshUser, resendVerification, resetPassword, signOut } from '../lib/auth.js';

function Body({ profile, photo, onProfile, onClose }) {
  const [name, setName] = useState(profile.name);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null); // { severity, text }
  const isPassword = profile.provider === 'password';
  const rootRef = useRef(null);

  const run = async (kind, fn) => {
    setBusy(kind);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ severity: 'error', text: err.message });
    } finally {
      setBusy('');
      // Buttons disable while busy, which drops focus; bring it back so Esc/Tab keep working.
      requestAnimationFrame(() => {
        if (rootRef.current && !rootRef.current.contains(document.activeElement)) rootRef.current.focus();
      });
    }
  };

  const saveName = () => run('name', async () => {
    onProfile(await api('PATCH', '/api/me', { name: name.trim() }));
    setMsg({ severity: 'success', text: 'Name saved' });
  });

  return (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1.5 }}>
        <Box sx={{ flex: 1 }}>Account</Box>
        <IconButton aria-label="Close" onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent ref={rootRef} tabIndex={-1} sx={{ display: 'grid', gap: 2.5, pt: '8px !important', outline: 'none' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar
            src={photo || undefined}
            slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
            sx={{ width: 56, height: 56, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 24 }}
          >
            {profile.name.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 500 }} noWrap>{profile.email}</Typography>
            <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
              <Chip size="small" label={isPassword ? 'Email & password' : 'Google account'} />
              {isPassword && (
                profile.emailVerified
                  ? <Chip size="small" color="success" variant="outlined" icon={<VerifiedOutlined />} label="Verified" />
                  : <Chip size="small" color="warning" variant="outlined" icon={<MarkEmailUnreadOutlined />} label="Not verified" />
              )}
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <Button
            variant="contained"
            onClick={saveName}
            disabled={!name.trim() || name.trim() === profile.name || Boolean(busy)}
            sx={{ height: 40, flexShrink: 0 }}
          >
            {busy === 'name' ? <CircularProgress size={18} color="inherit" /> : 'Save'}
          </Button>
        </Box>

        {isPassword && !profile.emailVerified && (
          <Alert severity="warning" sx={{ borderRadius: 3 }}>
            Check your inbox for a verification link.
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" color="inherit" disabled={Boolean(busy)}
                onClick={() => run('resend', async () => {
                  await resendVerification();
                  setMsg({ severity: 'info', text: `Verification email sent to ${profile.email}` });
                })}
              >
                Resend email
              </Button>
              <Button size="small" color="inherit" disabled={Boolean(busy)}
                onClick={() => run('check', async () => {
                  await refreshUser();
                  const p = await api('GET', '/api/me');
                  onProfile(p);
                  setMsg(p.emailVerified
                    ? { severity: 'success', text: 'Email verified' }
                    : { severity: 'info', text: 'Not verified yet. Open the link in the email first.' });
                })}
              >
                I&apos;ve verified
              </Button>
            </Box>
          </Alert>
        )}

        {isPassword && (
          <Button
            variant="outlined"
            startIcon={<LockResetOutlined />}
            disabled={Boolean(busy)}
            onClick={() => run('reset', async () => {
              await resetPassword(profile.email);
              setMsg({ severity: 'info', text: `Password reset link sent to ${profile.email}` });
            })}
            sx={{ justifySelf: 'start' }}
          >
            Change password
          </Button>
        )}

        {msg && <Alert severity={msg.severity} sx={{ borderRadius: 3 }}>{msg.text}</Alert>}

        <Divider />
        <Box sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Link href="/privacypolicy.html" target="_blank" rel="noopener" variant="body2">Privacy policy</Link>
              <Link href="/privacypolicy.html#delete" target="_blank" rel="noopener" variant="body2" color="text.secondary">Delete account</Link>
            </Box>
          </Box>
          <Button color="inherit" startIcon={<Logout />} onClick={() => signOut()}>Sign out</Button>
        </Box>
      </DialogContent>
    </>
  );
}

export default function AccountDialog({ open, onClose, profile, photo, onProfile }) {
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'));
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={fullScreen}>
      {open && <Body profile={profile} photo={photo} onProfile={onProfile} onClose={onClose} />}
    </Dialog>
  );
}
