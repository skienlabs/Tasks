import { useMemo, useState } from 'react';
import { Box, Button, ButtonBase, CircularProgress, Collapse, Skeleton, Typography } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import EventOutlined from '@mui/icons-material/EventOutlined';
import AddTask from './AddTask.jsx';
import TaskItem from './TaskItem.jsx';
import { addDays, formatDate, relativeLabel, startOfWeek, weekdayNames } from '../lib/dates.js';
import { moveTasks, selectDay, selectOverdue, selectSummary, useStoreVersion } from '../lib/store.js';

const NAMES = weekdayNames();

function WeekStrip({ date, today, onSelect }) {
  const start = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
      {days.map((d, i) => {
        const isSel = d === date;
        const isToday = d === today;
        const s = selectSummary(d);
        const pending = s?.pending ?? 0;
        const total = pending + (s?.done ?? 0);
        return (
          <ButtonBase
            key={d}
            onClick={() => onSelect(d)}
            aria-label={formatDate(d, { dateStyle: 'full' })}
            aria-pressed={isSel}
            sx={(t) => ({
              display: 'grid', justifyItems: 'center', gap: 0.25, py: 1, borderRadius: 4,
              bgcolor: isSel ? t.tokens.primaryContainer : 'transparent',
              color: isSel ? t.tokens.onPrimaryContainer : 'text.primary',
              '&:hover': { bgcolor: isSel ? t.tokens.primaryContainer : t.tokens.surfaceHigh },
            })}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.6, color: isToday ? 'primary.main' : 'inherit', opacity: isToday ? 1 : 0.75 }}>
              {NAMES[i]}
            </Typography>
            <Box
              sx={{
                width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center',
                fontSize: 17, fontWeight: isToday || isSel ? 600 : 400,
                bgcolor: isToday ? 'primary.main' : 'transparent',
                color: isToday ? 'primary.contrastText' : 'inherit',
              }}
            >
              {Number(d.slice(8))}
            </Box>
            <Box sx={{ height: 6, display: 'flex', alignItems: 'center', gap: '3px' }}>
              {total > 0 && (
                <Box
                  sx={(t) => ({
                    width: 6, height: 6, borderRadius: '50%',
                    bgcolor: pending === 0 ? t.palette.success.main : d < today ? t.palette.error.main : t.palette.primary.main,
                  })}
                />
              )}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function Section({ title, count, icon, open, onToggle, children, color }) {
  return (
    <Box sx={{ mt: 2 }}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={open}
        sx={(t) => ({ px: 1.5, py: 1, borderRadius: 2, gap: 1, '&:hover': { bgcolor: t.tokens.surfaceHigh } })}
      >
        <ExpandMore sx={{ fontSize: 20, transition: 'transform 150ms', transform: open ? 'none' : 'rotate(-90deg)', color: 'text.secondary' }} />
        {icon}
        <Typography sx={{ fontSize: 14, fontWeight: 500, color: color || 'text.primary' }}>
          {title} ({count})
        </Typography>
      </ButtonBase>
      <Collapse in={open} timeout={150} unmountOnExit>
        <Box role="list">{children}</Box>
      </Collapse>
    </Box>
  );
}

export default function DayView({ date, today, loading, failed, onRetry, onSelectDate, onOpenTask, addInputRef }) {
  const version = useStoreVersion();
  const [showDone, setShowDone] = useState(true);
  const [showCancelled, setShowCancelled] = useState(false);

  const { pending, done, cancelled, overdue } = useMemo(() => {
    const all = selectDay(date);
    return {
      pending: all.filter((t) => t.status === 'pending'),
      done: all.filter((t) => t.status === 'done'),
      cancelled: all.filter((t) => t.status === 'cancelled'),
      overdue: date === today ? selectOverdue(today) : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, today, version]);

  const total = pending.length + done.length;
  const isPast = date < today;
  const nothing = !loading && !failed && pending.length + done.length + cancelled.length + overdue.length === 0;

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', px: { xs: 1.5, sm: 3 }, pt: { xs: 2, sm: 3 }, pb: 14 }}>
      <WeekStrip date={date} today={today} onSelect={onSelectDate} />

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, mt: 3, mb: 2, px: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h1" sx={{ fontSize: { xs: 28, sm: 34 }, fontWeight: 400, lineHeight: 1.15 }}>
            {relativeLabel(date, today)}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Typography>
        </Box>
        {total > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pb: 0.5 }}>
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <CircularProgress variant="determinate" value={100} size={36} thickness={4} sx={(t) => ({ color: t.tokens.surfaceHighest, position: 'absolute' })} />
              <CircularProgress variant="determinate" value={(done.length / total) * 100} size={36} thickness={4} color={done.length === total ? 'success' : 'primary'} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {done.length}/{total} done
            </Typography>
          </Box>
        )}
      </Box>

      <AddTask date={date} inputRef={addInputRef} />

      {overdue.length > 0 && (
        <Box
          sx={(t) => ({
            mt: 2.5, borderRadius: '20px', border: `1px solid ${t.palette.mode === 'dark' ? '#5c2b29' : '#f6cfcb'}`,
            bgcolor: t.palette.mode === 'dark' ? '#140807' : '#fdf3f2', p: 0.5,
          })}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 1, pb: 0.5 }}>
            <HistoryRounded sx={{ fontSize: 20, color: 'error.main' }} />
            <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'error.main' }}>
              Pending from earlier ({overdue.length})
            </Typography>
            <Button size="small" onClick={() => moveTasks(overdue.map((t) => t.id), today)} sx={{ color: 'error.main' }}>
              Move all to today
            </Button>
          </Box>
          <Box role="list">
            {overdue.map((t) => (
              <TaskItem key={t.id} task={t} today={today} showOrigin onOpen={onOpenTask} />
            ))}
          </Box>
        </Box>
      )}

      <Box role="list" sx={{ mt: 1.5 }}>
        {loading && pending.length === 0 && done.length === 0 && [0, 1, 2].map((i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 1.5, py: 1.5 }}>
            <Skeleton variant="circular" width={22} height={22} />
            <Skeleton variant="text" sx={{ flex: 1, maxWidth: 260 + i * 60 }} />
          </Box>
        ))}
        {pending.map((t) => (
          <TaskItem key={t.id} task={t} today={today} onOpen={onOpenTask} />
        ))}
      </Box>

      {failed && pending.length === 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 3 }}>
          <Typography color="text.secondary" sx={{ flex: 1 }}>Couldn&apos;t load this day.</Typography>
          <Button variant="outlined" onClick={onRetry}>Retry</Button>
        </Box>
      )}

      {!loading && !failed && pending.length === 0 && (done.length > 0 || cancelled.length > 0) && overdue.length === 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 2, color: 'success.main' }}>
          <TaskAltRounded />
          <Typography>{done.length > 0 ? 'All done. Nice work.' : 'Nothing left to do.'}</Typography>
        </Box>
      )}

      {nothing && (
        <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 1, py: 8, color: 'text.secondary' }}>
          <EventOutlined sx={{ fontSize: 56, opacity: 0.5 }} />
          <Typography sx={{ fontSize: 17, color: 'text.primary' }}>
            {isPast ? 'Nothing was planned for this day' : 'No tasks yet'}
          </Typography>
          <Typography variant="body2">Add a task above to plan your day.</Typography>
        </Box>
      )}

      {done.length > 0 && (
        <Section title="Completed" count={done.length} open={showDone} onToggle={() => setShowDone((v) => !v)}>
          {done.map((t) => (
            <TaskItem key={t.id} task={t} today={today} onOpen={onOpenTask} />
          ))}
        </Section>
      )}
      {cancelled.length > 0 && (
        <Section title="Cancelled" count={cancelled.length} open={showCancelled} onToggle={() => setShowCancelled((v) => !v)}>
          {cancelled.map((t) => (
            <TaskItem key={t.id} task={t} today={today} onOpen={onOpenTask} />
          ))}
        </Section>
      )}
    </Box>
  );
}
