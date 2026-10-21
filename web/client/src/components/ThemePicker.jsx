import { Box, ButtonBase, Typography } from '@mui/material';
import Check from '@mui/icons-material/Check';
import { THEMES, themeTokens } from '../theme.js';

/** A tiny picture of the app in a theme: page, a card with two lines, the accent dot. */
function Preview({ name }) {
  const t = themeTokens(name);
  return (
    <Box sx={{ position: 'absolute', inset: 0, bgcolor: t.bg, p: '7px', display: 'grid', alignContent: 'start', gap: '5px' }}>
      <Box sx={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: t.primary }} />
        <Box sx={{ height: 4, width: '45%', borderRadius: 2, bgcolor: t.textMuted, opacity: 0.6 }} />
      </Box>
      <Box sx={{ bgcolor: t.surfaceHigh, border: `1px solid ${t.divider}`, borderRadius: '6px', p: '5px', display: 'grid', gap: '4px' }}>
        <Box sx={{ height: 4, width: '80%', borderRadius: 2, bgcolor: t.text, opacity: 0.85 }} />
        <Box sx={{ height: 4, width: '55%', borderRadius: 2, bgcolor: t.textMuted, opacity: 0.6 }} />
      </Box>
    </Box>
  );
}

function Swatch({ v }) {
  if (v !== null) return <Preview name={v} />;
  // System: light and Midnight Black, split on the diagonal.
  return (
    <>
      <Preview name="light" />
      <Box sx={{ position: 'absolute', inset: 0, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
        <Preview name="dark" />
      </Box>
    </>
  );
}

/** Grid of theme cards. `value` is the saved choice (null = follow the system). */
export default function ThemePicker({ value, onChange, columns = 3 }) {
  return (
    <Box role="radiogroup" aria-label="Theme" sx={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 1 }}>
      {THEMES.map((o) => {
        const on = value === o.v;
        return (
          <ButtonBase
            key={String(o.v)}
            role="radio"
            aria-checked={on}
            aria-label={`${o.label}: ${o.hint}`}
            title={o.hint}
            onClick={() => onChange(o.v)}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0.75, width: '100%', minWidth: 0, borderRadius: 2, p: 0.25, textAlign: 'center' }}
          >
            <Box
              sx={(t) => ({
                position: 'relative', width: '100%', aspectRatio: '4 / 3', borderRadius: '10px', overflow: 'hidden',
                outline: on ? `2px solid ${t.palette.primary.main}` : `1px solid ${t.tokens.outline}`,
                outlineOffset: on ? 2 : 0,
              })}
            >
              <Swatch v={o.v} />
              {on && (
                <Box sx={(t) => ({ position: 'absolute', right: 4, bottom: 4, width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: t.palette.primary.main, color: t.palette.primary.contrastText })}>
                  <Check sx={{ fontSize: 13 }} />
                </Box>
              )}
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: on ? 600 : 500, lineHeight: 1.2, color: on ? 'text.primary' : 'text.secondary' }}>
              {o.label}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
