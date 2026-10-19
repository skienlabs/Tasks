import { Box } from '@mui/material';
import { tagColor } from '../theme.js';

export function TagAvatar({ tag, size = 18 }) {
  if (tag.logo) {
    return (
      <Box
        component="img"
        src={tag.logo}
        alt=""
        sx={{ width: size, height: size, borderRadius: size > 24 ? 2 : 1, objectFit: 'contain', flexShrink: 0, display: 'block' }}
      />
    );
  }
  return (
    <Box
      sx={(t) => ({
        width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
        bgcolor: tagColor(t, tag.color).main, color: t.palette.mode === 'dark' ? '#000' : '#fff',
        fontSize: size * 0.55, fontWeight: 700, lineHeight: 1,
      })}
    >
      {tag.name.charAt(0).toUpperCase()}
    </Box>
  );
}

/** Compact colored tag label used on task cards and filters. */
export default function TagChip({ tag, selected, onClick, dense }) {
  return (
    <Box
      component={onClick ? 'button' : 'span'}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      sx={(t) => {
        const c = tagColor(t, tag.color);
        return {
          display: 'inline-flex', alignItems: 'center', gap: 0.6, maxWidth: 200,
          height: dense ? 22 : 32, pl: dense ? 0.4 : 0.75, pr: dense ? 0.9 : 1.5,
          borderRadius: 999, font: 'inherit', fontSize: dense ? 12 : 13.5, fontWeight: 500,
          color: c.main, bgcolor: selected ? c.bg : dense ? c.bg : 'transparent',
          border: `1px solid ${selected ? c.main : dense ? 'transparent' : c.border}`,
          cursor: onClick ? 'pointer' : 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
          transition: 'background-color 120ms, border-color 120ms',
          '&:hover': onClick ? { bgcolor: c.bg } : undefined,
          '&:focus-visible': { outline: `2px solid ${c.main}`, outlineOffset: 2 },
        };
      }}
    >
      <TagAvatar tag={tag} size={dense ? 15 : 20} />
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag.name}</Box>
    </Box>
  );
}

/**
 * The task's company, shown big on the right of a task card: a tinted plate with the tag's logo
 * and name. More tags show as a stack of logos after it.
 */
export function TagPlates({ tags, muted }) {
  if (!tags.length) return null;
  const [first, ...rest] = tags;
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', flexShrink: 0, minWidth: 0, maxWidth: { xs: 132, sm: 260 },
        opacity: muted ? 0.5 : 1, transition: 'opacity 150ms',
      }}
      aria-label={`Tags: ${tags.map((t) => t.name).join(', ')}`}
    >
      {rest.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 0.75 }}>
          {rest.slice(0, 3).map((tag, i) => (
            <Box
              key={tag.id}
              title={tag.name}
              sx={(t) => ({
                ml: i ? '-8px' : 0, p: '2px', borderRadius: '50%', display: 'grid', zIndex: 3 - i,
                bgcolor: t.palette.background.default, border: `1.5px solid ${tagColor(t, tag.color).main}`,
              })}
            >
              <TagAvatar tag={tag} size={20} />
            </Box>
          ))}
          {rest.length > 3 && (
            <Box component="span" sx={{ ml: 0.5, fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>+{rest.length - 3}</Box>
          )}
        </Box>
      )}
      <Box
        sx={(t) => {
          const c = tagColor(t, first.color);
          return {
            display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, height: 36, pl: 0.5, pr: 1.5, borderRadius: '12px',
            bgcolor: c.bg, border: `1px solid ${c.border}`,
            boxShadow: `inset 0 1px 0 ${t.palette.mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.7)'}`,
          };
        }}
      >
        <Box sx={(t) => ({ p: '3px', borderRadius: '9px', bgcolor: t.palette.mode === 'dark' ? 'rgba(255,255,255,.08)' : '#fff', display: 'grid', flexShrink: 0 })}>
          <TagAvatar tag={first} size={22} />
        </Box>
        <Box
          component="span"
          sx={(t) => ({
            color: tagColor(t, first.color).main, fontSize: 14, fontWeight: 600, letterSpacing: 0.1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: { xs: 'none', sm: 'block' },
          })}
        >
          {first.name}
        </Box>
      </Box>
    </Box>
  );
}
