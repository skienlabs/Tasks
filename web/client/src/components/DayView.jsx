import { useMemo, useState } from 'react';
import { Box, Button, ButtonBase, CircularProgress, Collapse, Skeleton, Typography } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import EventOutlined from '@mui/icons-material/EventOutlined';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import AddTask from './AddTask.jsx';
import TaskItem from './TaskItem.jsx';
import TagChip from './TagChip.jsx';
import { StackBar } from './SummaryView.jsx';
import { addDays, formatDate, fromKey, relativeLabel, startOfWeek, toKey, weekdayNames } from '../lib/dates.js';
import { moveTasks, selectDay, selectOverdue, selectSummary, selectTags, useStoreVersion } from '../lib/store.js';
import { hexAlpha, statusColors } from '../theme.js';

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
            <Box sx={{ height: 6, width: '56%', display: 'flex', alignItems: 'center' }}>
              {total > 0 && (
                <Box sx={(t) => ({ display: 'flex', width: '100%', height: 4, borderRadius: 2, overflow: 'hidden', bgcolor: t.tokens.surfaceHighest })}>
                  <Box sx={(t) => ({ width: `${((total - pending) / total) * 100}%`, bgcolor: statusColors(t).done })} />
                  <Box sx={(t) => ({ width: `${(pending / total) * 100}%`, bgcolor: d < today ? statusColors(t).overdue : statusColors(t).pending })} />
                </Box>
              )}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function sumDays(from, count) {
  const s = { pending: 0, done: 0, cancelled: 0 };
  for (let i = 0; i < count; i++) {
    const x = selectSummary(addDays(from, i));
    if (x) {
      s.pending += x.pending;
      s.done += x.done;
      s.cancelled += x.cancelled;
    }
  }
  return s;
}

function PanelCard({ title, c, onClick, extra }) {
  const active = c.pending + c.done;
  const rate = active ? Math.round((c.done / active) * 100) : 0;
  return (
    <Box sx={(t) => ({ borderRadius: '24px', p: 2, bgcolor: t.tokens.surfaceHigh, border: `1px solid ${t.palette.divider}` })}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1.5 }}>
        <Typography sx={{ fontWeight: 500, flex: 1 }}>{title}</Typography>
        <Typography sx={(t) => ({ fontWeight: 600, color: statusColors(t).rate })}>{rate}%</Typography>
      </Box>
      <StackBar {...c} height={10} />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', mt: 1.5, textAlign: 'center' }}>
        {[
          ['Tasks', active, 'pending'],
          ['Done', c.done, 'done'],
          ['Left', c.pending, 'overdue'],
        ].map(([label, v, k]) => (
          <Box key={label}>
            <Typography sx={(t) => ({ fontSize: 22, color: k === 'pending' ? 'text.primary' : statusColors(t)[k] })}>{v}</Typography>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Box>
        ))}
      </Box>
      {extra}
      {onClick && (
        <Button fullWidth size="small" startIcon={<InsightsOutlined />} onClick={onClick} sx={{ mt: 1.5 }}>
          Open summary
        </Button>
      )}
    </Box>
  );
}

function SidePanel({ date, today, onOpenSummary }) {
  const ws = startOfWeek(date);
  const week = sumDays(ws, 7);
  const f = fromKey(date);
  const monthStart = toKey(new Date(f.getFullYear(), f.getMonth(), 1));
  const daysInMonth = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  const month = sumDays(monthStart, daysInMonth);
  return (
    <Box sx={{ display: 'grid', gap: 1.5, alignContent: 'start', alignSelf: 'start', position: 'sticky', top: 88 }}>
      <PanelCard title={ws <= today && today <= addDays(ws, 6) ? 'This week' : 'That week'} c={week} />
      <PanelCard
        title={formatDate(monthStart, { month: 'long' })}
        c={month}
        onClick={onOpenSummary}
      />
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

export default function DayView({
  date, today, loading, failed, onRetry, onSelectDate, onOpenTask, addInputRef,
  tagFilter, onTagFilter, onManageTags, onOpenSummary, userName, wide,
}) {
  const version = useStoreVersion();
  const tags = selectTags();
  const [showDone, setShowDone] = useState(true);
  const [showCancelled, setShowCancelled] = useState(false);

  const { pending, done, cancelled, overdue } = useMemo(() => {
    const match = (t) => !tagFilter || t.tagIds?.includes(tagFilter);
    const all = selectDay(date).filter(match);
    return {
      pending: all.filter((t) => t.status === 'pending'),
      done: all.filter((t) => t.status === 'done'),
      cancelled: all.filter((t) => t.status === 'cancelled'),
      overdue: date === today ? selectOverdue(today).filter(match) : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, today, version, tagFilter]);

  const total = pending.length + done.length;
  const isPast = date < today;
  const nothing = !loading && !failed && pending.length + done.length + cancelled.length + overdue.length === 0;

  const firstName = (userName || '').split(' ')[0];
  const isToday = date === today;

  const main = (
    <Box sx={{ minWidth: 0 }}>
      <WeekStrip date={date} today={today} onSelect={onSelectDate} />

      {tags.length > 0 && (
        <Box
          sx={{
            display: 'flex', gap: 1, mt: 2, overflowX: 'auto', pb: 0.5, mx: { xs: -1.5, sm: 0 }, px: { xs: 1.5, sm: 0 },
            scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          <Box
            component="button"
            type="button"
            onClick={() => onTagFilter(null)}
            aria-pressed={!tagFilter}
            sx={(t) => ({
              height: 32, px: 1.75, borderRadius: 999, font: 'inherit', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
              color: !tagFilter ? t.tokens.onPrimaryContainer : 'text.secondary',
              bgcolor: !tagFilter ? t.tokens.primaryContainer : 'transparent',
              border: `1px solid ${!tagFilter ? 'transparent' : t.tokens.outline}`,
            })}
          >
            All
          </Box>
          {tags.map((tag) => (
            <TagChip key={tag.id} tag={tag} selected={tagFilter === tag.id} onClick={() => onTagFilter(tagFilter === tag.id ? null : tag.id)} />
          ))}
          <Box
            component="button"
            type="button"
            onClick={onManageTags}
            aria-label="Manage tags"
            sx={(t) => ({
              height: 32, width: 32, borderRadius: 999, flexShrink: 0, cursor: 'pointer', display: 'grid', placeItems: 'center',
              color: 'text.secondary', bgcolor: 'transparent', border: `1px dashed ${t.tokens.outline}`,
            })}
          >
            <SellOutlined sx={{ fontSize: 16 }} />
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, mt: 3, mb: 2, px: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {isToday && firstName && (
            <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 0.25 }}>{greeting()}, {firstName}</Typography>
          )}
          <Typography
            component="h1"
            sx={(t) => ({
              fontSize: { xs: 28, sm: 34 }, fontWeight: 400, lineHeight: 1.15,
              ...(isToday && {
                background: t.palette.mode === 'dark'
                  ? 'linear-gradient(90deg,#8ab4f8,#d7aefb 60%,#ff8bcb)'
                  : 'linear-gradient(90deg,#1a73e8,#9334e6 60%,#d01884)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }),
            })}
          >
            {relativeLabel(date, today)}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Typography>
          {total + overdue.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.25 }}>
              {[
                ['pending', `${total} task${total === 1 ? '' : 's'}`, true],
                ['done', `${done.length} done`, true],
                [isPast ? 'overdue' : 'pending', `${pending.length} left`, true],
                ['overdue', `${overdue.length} from earlier`, overdue.length > 0],
              ].filter((x) => x[2]).map(([k, label]) => (
                <Box
                  key={label}
                  sx={(t) => ({
                    display: 'inline-flex', alignItems: 'center', height: 26, px: 1.25, borderRadius: 999, fontSize: 12.5, fontWeight: 500,
                    color: statusColors(t)[k], bgcolor: hexAlpha(statusColors(t)[k], t.palette.mode === 'dark' ? 0.16 : 0.1),
                  })}
                >
                  {label}
                </Box>
              ))}
            </Box>
          )}
        </Box>
        {total > 0 && (
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1.25, pb: 0.5 }}>
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

      <AddTask date={date} inputRef={addInputRef} defaultTagId={tagFilter} onManageTags={onManageTags} />

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
              <TaskItem key={t.id} task={t} today={today} showOrigin onOpen={onOpenTask} onManageTags={onManageTags} />
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
          <TaskItem key={t.id} task={t} today={today} onOpen={onOpenTask} onManageTags={onManageTags} />
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
            {tagFilter ? 'No tasks with this tag' : isPast ? 'Nothing was planned for this day' : 'No tasks yet'}
          </Typography>
          <Typography variant="body2">Add a task above to plan your day.</Typography>
        </Box>
      )}

      {done.length > 0 && (
        <Section title="Completed" count={done.length} open={showDone} onToggle={() => setShowDone((v) => !v)}>
          {done.map((t) => (
            <TaskItem key={t.id} task={t} today={today} onOpen={onOpenTask} onManageTags={onManageTags} />
          ))}
        </Section>
      )}
      {cancelled.length > 0 && (
        <Section title="Cancelled" count={cancelled.length} open={showCancelled} onToggle={() => setShowCancelled((v) => !v)}>
          {cancelled.map((t) => (
            <TaskItem key={t.id} task={t} today={today} onOpen={onOpenTask} onManageTags={onManageTags} />
          ))}
        </Section>
      )}
    </Box>
  );

  return (
    <Box
      sx={{
        maxWidth: wide ? 1140 : 760, mx: 'auto', px: { xs: 1.5, sm: 3 }, pt: { xs: 2, sm: 3 }, pb: 14,
        display: 'grid', gridTemplateColumns: wide ? 'minmax(0, 1fr) 300px' : '1fr', gap: 4,
      }}
    >
      {main}
      {wide && <SidePanel date={date} today={today} onOpenSummary={onOpenSummary} />}
    </Box>
  );
}