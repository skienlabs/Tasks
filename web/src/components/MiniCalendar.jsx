import { memo } from 'react';
import { Box, ButtonBase, IconButton, Typography } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import { formatDate, monthGrid, weekdayNames } from '../lib/dates.js';
import { selectSummary, useStoreVersion } from '../lib/store.js';

const NAMES = weekdayNames();

function MiniCalendar({ month, onMonthChange, selected, today, onSelect }) {
  useStoreVersion();
  const grid = monthGrid(month.y, month.m);
  const monthKey = `${month.y}-${String(month.m + 1).padStart(2, '0')}`;
  const shift = (n) => {
    const d = new Date(month.y, month.m + n, 1);
    onMonthChange({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <Box sx={{ px: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', pl: 1.5 }}>
        <Typography sx={{ flex: 1, fontWeight: 500, fontSize: 14 }}>
          {formatDate(`${monthKey}-01`, { month: 'long', year: 'numeric' })}
        </Typography>
        <IconButton size="small" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRight fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mt: 0.5, rowGap: 0.25 }}>
        {NAMES.map((n, i) => (
          <Typography key={i} variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontSize: 11, py: 0.5 }}>
            {n}
          </Typography>
        ))}
        {grid.map((d) => {
          const inMonth = d.startsWith(monthKey);
          const isToday = d === today;
          const isSel = d === selected;
          const s = selectSummary(d);
          const pending = s?.pending ?? 0;
          const done = s?.done ?? 0;
          const overdue = pending > 0 && d < today;
          return (
            <Box key={d} sx={{ display: 'grid', placeItems: 'center' }}>
              <ButtonBase
                onClick={() => onSelect(d)}
                aria-label={formatDate(d, { dateStyle: 'full' }) + (pending ? `, ${pending} pending` : '')}
                aria-current={isToday ? 'date' : undefined}
                sx={(t) => ({
                  width: 32, height: 32, borderRadius: '50%', fontSize: 12, position: 'relative',
                  fontWeight: isToday || isSel ? 600 : 400,
                  color: isToday ? t.palette.primary.contrastText : isSel ? t.tokens.onPrimaryContainer : inMonth ? 'text.primary' : 'text.secondary',
                  opacity: inMonth || isSel || isToday ? 1 : 0.6,
                  bgcolor: isToday ? 'primary.main' : isSel ? t.tokens.primaryContainer : 'transparent',
                  '&:hover': { bgcolor: isToday ? 'primary.main' : isSel ? t.tokens.primaryContainer : t.tokens.surfaceHighest },
                })}
              >
                {Number(d.slice(8))}
                {(pending > 0 || done > 0) && (
                  <Box
                    component="span"
                    sx={(t) => ({
                      position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: '50%',
                      bgcolor: isToday
                        ? t.palette.primary.contrastText
                        : overdue ? t.palette.error.main : pending ? t.palette.primary.main : t.palette.success.main,
                    })}
                  />
                )}
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default memo(MiniCalendar);
