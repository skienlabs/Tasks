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
