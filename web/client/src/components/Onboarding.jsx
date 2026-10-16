import { useState } from 'react';
import { Alert, Box, Button, ButtonBase, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import Logo from './Logo.jsx';
import { TAG_COLORS, tagColor } from '../theme.js';
import { api } from '../lib/api.js';
import { loadTags, saveTag, selectTags } from '../lib/store.js';
import { signOut, suggestedName } from '../lib/auth.js';

const COLOR_KEYS = Object.keys(TAG_COLORS);
const START_COLORS = ['blue', 'green', 'purple', 'orange', 'pink'];

/** First-run setup after creating an account (Google or email). */
export default function Onboarding({ profile, onDone }) {
  const [name, setName] = useState(() => (profile.provider === 'password' ? suggestedName() : '') || profile.name || '');
  const [companies, setCompanies] = useState([
    { name: '', color: START_COLORS[0] },
    { name: '', color: START_COLORS[1] },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (i, patch) => setCompanies((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const nextColor = (key) => COLOR_KEYS[(COLOR_KEYS.indexOf(key) + 1) % COLOR_KEYS.length];

  const finish = async (withCompanies) => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (withCompanies) {
        await loadTags(); // skip any created by an earlier attempt
        const seen = new Set(selectTags().map((t) => t.name.toLowerCase()));
        for (const c of companies) {
          const n = c.name.replace(/\s+/g, ' ').trim();
          if (!n || seen.has(n.toLowerCase())) continue;
          seen.add(n.toLowerCase());
          await saveTag(null, { name: n, color: c.color });
        }
      }
      onDone(await api('PATCH', '/api/me', { name: name.trim(), onboarded: true }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const first = name.trim().split(' ')[0];

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          finish(true);
        }}
        sx={(t) => ({
          width: '100%', maxWidth: 520, p: { xs: 1, sm: 5 }, borderRadius: '28px', display: 'grid', gap: 3,
          bgcolor: { xs: 'transparent', sm: t.tokens.surfaceHigh },
          border: { xs: 'none', sm: `1px solid ${t.palette.divider}` },
        })}
      >
        <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 1 }}>
          <Logo size={56} />
          <Typography
            sx={(t) => ({
              mt: 1.5, fontSize: { xs: 28, sm: 32 }, lineHeight: 1.2,
              background: t.palette.mode === 'dark'
                ? 'linear-gradient(90deg,#8ab4f8,#d7aefb 60%,#ff8bcb)'
                : 'linear-gradient(90deg,#1a73e8,#9334e6 60%,#d01884)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            })}
          >
            Welcome{first ? `, ${first}` : ''}!
          </Typography>
          <Typography color="text.secondary">Let&apos;s set up your Tasks. It takes a few seconds.</Typography>
        </Box>

        <TextField
          label="What should we call you?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          fullWidth
          autoFocus={!name}
          slotProps={{ htmlInput: { maxLength: 60 } }}
        />

        <Box>
          <Typography sx={{ fontWeight: 500 }}>Companies or projects you work for</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Optional. Each becomes a tag you can put on tasks. You can add logos later under Tags.
          </Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {companies.map((c, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tooltip title="Change color">
                  <ButtonBase
                    aria-label={`Color for company ${i + 1}: ${TAG_COLORS[c.color].label}`}
                    onClick={() => update(i, { color: nextColor(c.color) })}
                    sx={(t) => ({
                      width: 40, height: 40, flexShrink: 0, borderRadius: '50%', bgcolor: tagColor(t, c.color).main,
                      color: t.palette.mode === 'dark' ? '#000' : '#fff', fontWeight: 700, fontSize: 16,
                    })}
                  >
                    {(c.name.trim().charAt(0) || '?').toUpperCase()}
                  </ButtonBase>
                </Tooltip>
                <TextField
                  size="small"
                  placeholder={i === 0 ? 'e.g. Skien Labs' : i === 1 ? 'e.g. ZupNex' : 'Company name'}
                  value={c.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: 40, 'aria-label': `Company ${i + 1}` } }}
                />
                {companies.length > 1 && (
                  <IconButton aria-label={`Remove company ${i + 1}`} onClick={() => setCompanies((l) => l.filter((_, j) => j !== i))}>
                    <Close fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ))}
          </Box>
          {companies.length < 6 && (
            <Button
              startIcon={<Add />}
              onClick={() => setCompanies((l) => [...l, { name: '', color: START_COLORS[l.length % START_COLORS.length] }])}
              sx={{ mt: 1 }}
            >
              Add another
            </Button>
          )}
        </Box>

        {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}

        <Box sx={{ display: 'grid', gap: 1 }}>
          <Button type="submit" variant="contained" size="large" disabled={busy} sx={{ height: 48, fontSize: 15 }}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : null}
          >
            Get started
          </Button>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button size="small" color="inherit" onClick={() => signOut()} disabled={busy} sx={{ color: 'text.secondary' }}>
              Sign out
            </Button>
            <Button size="small" onClick={() => finish(false)} disabled={busy}>Skip companies</Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
