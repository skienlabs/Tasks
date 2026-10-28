import { Avatar, Box, ButtonBase, Tooltip } from '@mui/material';
import Check from '@mui/icons-material/Check';
import { TAG_COLORS, hexAlpha, tagColor } from '../../theme.js';

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };

/** A team's mark: its initials on its colour, a rounded square (people are round). */
export function TeamAvatar({ team, size = 40 }) {
  const initials = (team?.name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return (
    <Box
      aria-hidden
      sx={(t) => {
        const c = tagColor(t, team?.color ?? 'blue');
        return {
          width: size, height: size, borderRadius: size > 32 ? '12px' : '8px', flexShrink: 0, display: 'grid', placeItems: 'center',
          bgcolor: c.bg, color: c.main, border: `1px solid ${c.border}`, fontWeight: 700, fontSize: size * 0.38, letterSpacing: '0.02em',
        };
      }}
    >
      {initials || '?'}
    </Box>
  );
}

export function PersonAvatar({ person, size = 32 }) {
  return (
    <Avatar
      src={person?.photo || undefined}
      alt=""
      slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
      sx={{ width: size, height: size, fontSize: size * 0.45, bgcolor: 'primary.main', color: 'primary.contrastText' }}
    >
      {(person?.name || person?.email || '?').charAt(0).toUpperCase()}
    </Avatar>
  );
}

export function RolePill({ role }) {
  return (
    <Box
      component="span"
      sx={(t) => ({
        display: 'inline-flex', alignItems: 'center', height: 22, px: 1, borderRadius: 999, fontSize: 12, fontWeight: 600,
        color: role === 'member' ? 'text.secondary' : t.palette.primary.main,
        bgcolor: role === 'member' ? t.tokens.chip : hexAlpha(t.palette.primary.main, 0.12),
      })}
    >
      {ROLE_LABEL[role] ?? role}
    </Box>
  );
}

export function ColorPicker({ value, onChange }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {Object.entries(TAG_COLORS).map(([key, c]) => (
        <Tooltip key={key} title={c.label}>
          <ButtonBase
            onClick={() => onChange(key)}
            aria-label={c.label}
            aria-pressed={value === key}
            sx={(t) => ({
              width: 32, height: 32, borderRadius: '50%', bgcolor: tagColor(t, key).main,
              color: t.palette.mode === 'dark' ? '#000' : '#fff',
              outline: value === key ? `2px solid ${tagColor(t, key).main}` : 'none', outlineOffset: 3,
            })}
          >
            {value === key && <Check sx={{ fontSize: 18 }} />}
          </ButtonBase>
        </Tooltip>
      ))}
    </Box>
  );
}

/** Splits "a@x.com, b@y.com\nc@z.com" into clean addresses (and the bits that aren't). */
export function parseEmails(text) {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim().replace(/^<|>$/g, '')).filter(Boolean);
  const good = [];
  const bad = [];
  for (const p of parts) {
    const e = p.toLowerCase();
    if (/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;".]{2,}$/.test(e) || /^[^\s@]+@localhost$/.test(e)) {
      if (!good.includes(e)) good.push(e);
    } else bad.push(p);
  }
  return { good, bad };
}

/** The message an admin sends people they invited (the server sends no email itself). */
export function inviteMessage(team, emails, apk) {
  const origin = window.location.origin;
  const who = emails.length === 1 ? emails[0] : 'the email address I invited';
  return [
    `Hi! I've invited you to join "${team.name}" on Tasks, so we can share work there.`,
    '',
    apk ? `1. Get the app: ${origin}/download/android (Android), or use it on the web at ${origin}` : `1. Open Tasks: ${origin}`,
    `2. Sign in with ${who}`,
    `3. Open Teams and accept the invite: ${origin}/?v=teams`,
  ].join('\n');
}
