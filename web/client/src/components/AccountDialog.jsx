import { useRef, useState } from 'react';
import {
  Alert, Avatar, Box, Button, ButtonBase, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton,
  TextField, Typography, useMediaQuery,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import MarkEmailUnreadOutlined from '@mui/icons-material/MarkEmailUnreadOutlined';
import LockResetOutlined from '@mui/icons-material/LockResetOutlined';
import Logout from '@mui/icons-material/Logout';
import KeyOutlined from '@mui/icons-material/KeyOutlined';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import PrivacyTipOutlined from '@mui/icons-material/PrivacyTipOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { APP_VERSION } from '../lib/version.js';
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

  const since = new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1.5 }}>
        <Box sx={{ flex: 1 }}>Account</Box>
        <IconButton aria-label="Close" onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent ref={rootRef} tabIndex={-1} sx={{ display: 'grid', gap: 2, pt: '4px !important', outline: 'none' }}>
        {/* Who */}
        <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 0.5, pb: 0.5 }}>
          <Avatar
            src={photo || undefined}
            slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
            sx={{ width: 80, height: 80, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 34, mb: 1 }}
          >
            {profile.name.charAt(0).toUpperCase()}
          </Avatar>
          <Typography sx={{ fontSize: 20 }}>{profile.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>{profile.email}</Typography>
        </Box>

        <Section title="Profile">
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.5 }}>
            <TextField
              label="Your name"
              helperText="Shown in the greeting on your day"
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
        </Section>

        <Section title="Sign-in & security">
          <Item
            icon={isPassword ? <KeyOutlined fontSize="small" /> : <AccountCircleOutlined fontSize="small" />}
            title={isPassword ? 'Email & password' : 'Google account'}
            secondary={isPassword ? profile.email : 'Signed in with Google'}
            end={isPassword && (profile.emailVerified
              ? <Chip size="small" color="success" variant="outlined" icon={<VerifiedOutlined />} label="Verified" />
              : <Chip size="small" color="warning" variant="outlined" icon={<MarkEmailUnreadOutlined />} label="Not verified" />)}
          />
          {isPassword && !profile.emailVerified && (
            <Alert severity="warning" sx={{ borderRadius: 0 }}>
              Check your inbox for a verification link, so you can recover your account.
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
            <Item
              icon={<LockResetOutlined fontSize="small" />}
              title="Change password"
              secondary="We'll email you a link"
              disabled={Boolean(busy)}
              onClick={() => run('reset', async () => {
                await resetPassword(profile.email);
                setMsg({ severity: 'info', text: `Password reset link sent to ${profile.email}` });
              })}
            />
          )}
          <Item icon={<CalendarMonthOutlined fontSize="small" />} title="Member since" secondary={since} />
        </Section>

        {msg && <Alert severity={msg.severity} sx={{ borderRadius: 3 }}>{msg.text}</Alert>}

        <Section title="Privacy & data">
          <Item icon={<PrivacyTipOutlined fontSize="small" />} title="Privacy policy" secondary="What we keep and why" href="/privacypolicy.html" />
          <Item
            icon={<DeleteOutlined fontSize="small" color="error" />}
            title={<Box component="span" sx={{ color: 'error.main' }}>Delete account</Box>}
            secondary="Remove your account and all your tasks"
            href="/privacypolicy.html#delete"
          />
        </Section>

        <Button variant="outlined" color="inherit" startIcon={<Logout />} onClick={() => signOut()} sx={(t) => ({ borderColor: t.tokens.outline, height: 44 })}>
          Sign out
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', pb: 1 }}>
          Tasks {APP_VERSION} · © 2026 Skien Software Lab
        </Typography>
      </DialogContent>
    </>
  );
}

function Section({ title, children }) {
  return (
    <Box component="section">
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', px: 0.5, mb: 0.75 }}>{title}</Typography>
      <Box
        sx={(t) => ({
          borderRadius: '16px', overflow: 'hidden', bgcolor: t.tokens.surfaceHighest, border: `1px solid ${t.palette.divider}`,
          '& > * + *': { borderTop: `1px solid ${t.palette.divider}` },
        })}
      >
        {children}
      </Box>
    </Box>
  );
}

function Item({ icon, title, secondary, end, onClick, href, disabled }) {
  const clickable = Boolean(onClick || href);
  return (
    <ButtonBase
      component={href ? 'a' : clickable ? 'button' : 'div'}
      {...(href ? { href, target: '_blank', rel: 'noopener' } : {})}
      onClick={onClick}
      disabled={disabled || !clickable}
      sx={(t) => ({
        display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', px: 1.5, py: 1.25, textAlign: 'left', color: 'text.primary',
        cursor: clickable ? 'pointer' : 'default',
        '&:hover': clickable ? { bgcolor: t.tokens.surfaceHigh } : {},
        '&.Mui-disabled': { color: 'text.primary', opacity: clickable ? 0.6 : 1 },
      })}
    >
      <Box sx={{ color: 'text.secondary', display: 'grid' }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14.5 }}>{title}</Typography>
        {secondary && <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{secondary}</Typography>}
      </Box>
      {end}
      {clickable && <ChevronRightRounded fontSize="small" sx={{ color: 'text.secondary' }} />}
    </ButtonBase>
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
