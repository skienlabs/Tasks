import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, ButtonBase, CircularProgress, IconButton, Skeleton, Tooltip, Typography } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import PendingActionsOutlined from '@mui/icons-material/PendingActionsOutlined';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import Flag from '@mui/icons-material/Flag';
import SellOutlined from '@mui/icons-material/SellOutlined';
import { api } from '../lib/api.js';
import { addDays, formatDate, shortLabel, toKey } from '../lib/dates.js';
import { selectTag, useStoreVersion } from '../lib/store.js';
import { PRIORITIES, hexAlpha, priorityColor, statusColors } from '../theme.js';
import { TagAvatar } from './TagChip.jsx';

function monthRange(y, m) {
  const from = toKey(new Date(y, m, 1));
  const to = toKey(new Date(y, m + 1, 0));
  return { from, to };
}

function Card({ title, icon, children, sx }) {
  return (
    <Box
      sx={(t) => ({
        borderRadius: '24px', p: { xs: 2, sm: 2.5 }, bgcolor: t.tokens.surfaceHigh,
        border: `1px solid ${t.palette.divider}`, minWidth: 0, ...sx,
      })}
    >
      {title && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {icon}
          <Typography sx={{ fontWeight: 500, fontSize: 16 }}>{title}</Typography>
        </Box>
      )}
      {children}
    </Box>
  );
}

function Kpi({ label, value, sub, color, icon }) {
  return (
    <Box
      sx={(t) => ({
        borderRadius: '24px', p: 2, minWidth: 0,
        bgcolor: hexAlpha(color, t.palette.mode === 'dark' ? 0.14 : 0.09),
        border: `1px solid ${hexAlpha(color, 0.28)}`,
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color }}>
        {icon}
        <Typography sx={{ fontSize: 13.5, fontWeight: 500 }} noWrap>{label}</Typography>
      </Box>
      <Typography sx={{ fontSize: { xs: 30, sm: 36 }, fontWeight: 400, lineHeight: 1.2, mt: 1, color: 'text.primary' }}>
        {value}
      </Typography>
      {sub && <Typography variant="body2" color="text.secondary" noWrap>{sub}</Typography>}
    </Box>
  );
}

/** Horizontal bar split into done / pending / cancelled. */
export function StackBar({ done, pending, cancelled, height = 8, overdue = false }) {
  const total = done + pending + cancelled;
  return (
    <Box sx={(t) => ({ display: 'flex', height, borderRadius: height, overflow: 'hidden', bgcolor: t.tokens.surfaceHighest, width: '100%' })}>
      {total > 0 && (
        <>
          <Box sx={(t) => ({ width: `${(done / total) * 100}%`, bgcolor: statusColors(t).done })} />
          <Box sx={(t) => ({ width: `${(pending / total) * 100}%`, bgcolor: overdue ? statusColors(t).overdue : statusColors(t).pending })} />
          <Box sx={(t) => ({ width: `${(cancelled / total) * 100}%`, bgcolor: statusColors(t).cancelled, opacity: 0.6 })} />
        </>
      )}
    </Box>
  );
}

function Legend() {
  const items = [['done', 'Completed'], ['pending', 'Left'], ['overdue', 'Overdue'], ['cancelled', 'Cancelled']];
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.5 }}>
      {items.map(([k, label]) => (
        <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={(t) => ({ width: 10, height: 10, borderRadius: '3px', bgcolor: statusColors(t)[k], opacity: k === 'cancelled' ? 0.6 : 1 })} />
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function DailyChart({ days, from, to, today, onOpenDay }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const all = [];
  for (let d = from; d <= to; d = addDays(d, 1)) all.push(byDate.get(d) ?? { date: d, pending: 0, done: 0, cancelled: 0 });
  const max = Math.max(1, ...all.map((d) => d.pending + d.done + d.cancelled));
  const H = 140;
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: { xs: '2px', sm: '4px' }, height: H + 22, overflowX: 'auto', pb: 0.5 }}>
        {all.map((d) => {
          const total = d.pending + d.done + d.cancelled;
          const past = d.date < today;
          const day = Number(d.date.slice(8));
          return (
            <Tooltip
              key={d.date}
              title={`${formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}: ${total} tasks, ${d.done} done, ${d.pending} left`}
            >
              <ButtonBase
                onClick={() => onOpenDay(d.date)}
                aria-label={`Open ${formatDate(d.date, { dateStyle: 'full' })}`}
                sx={{ flex: '1 0 8px', minWidth: 8, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0.5, borderRadius: 1 }}
              >
                <Box sx={{ height: H, display: 'flex', flexDirection: 'column-reverse', borderRadius: '6px', overflow: 'hidden' }}>
                  {total === 0 ? (
                    <Box sx={(t) => ({ height: 3, bgcolor: t.tokens.surfaceHighest, borderRadius: 2 })} />
                  ) : (
                    <>
                      <Box sx={(t) => ({ height: (d.done / max) * H, bgcolor: statusColors(t).done })} />
                      <Box sx={(t) => ({ height: (d.pending / max) * H, bgcolor: past ? statusColors(t).overdue : statusColors(t).pending })} />
                      <Box sx={(t) => ({ height: (d.cancelled / max) * H, bgcolor: statusColors(t).cancelled, opacity: 0.6 })} />
                    </>
                  )}
                </Box>
                <Typography
                  sx={{
                    fontSize: 10.5, textAlign: 'center', lineHeight: 1.4,
                    color: d.date === today ? 'primary.main' : 'text.secondary',
                    fontWeight: d.date === today ? 700 : 400,
                    visibility: { xs: day === 1 || day % 5 === 0 || d.date === today ? 'visible' : 'hidden', sm: 'visible' },
                  }}
                >
                  {day}
                </Typography>
              </ButtonBase>
            </Tooltip>
          );
        })}
      </Box>
      <Legend />
    </>
  );
}

function BreakdownRow({ icon, label, c, onClick }) {
  const total = c.done + c.pending + c.cancelled;
  return (
    <Box
      component={onClick ? ButtonBase : 'div'}
      onClick={onClick}
      sx={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 1, py: 1, width: '100%', textAlign: 'left', borderRadius: 2 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        {icon}
        <Typography noWrap sx={{ fontSize: 14.5 }}>{label}</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
        <Box component="span" sx={(t) => ({ color: statusColors(t).done, fontWeight: 600 })}>{c.done}</Box>
        {' / '}{total - c.cancelled} done
      </Typography>
      <Box sx={{ gridColumn: '1 / -1' }}>
        <StackBar {...c} />
      </Box>
    </Box>
  );
}

export default function SummaryView({ today, onOpenDay }) {
  useStoreVersion();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const { from, to } = monthRange(month.y, month.m);

  // Only the newest request may update the page (fast month paging can finish out of order).
  const requestRef = useRef(0);
  const load = useCallback(() => {
    const id = ++requestRef.current;
    setError('');
    api('GET', `/api/stats?from=${from}&to=${to}&today=${today}`)
      .then((res) => id === requestRef.current && setData({ key: from, ...res }))
      .catch((err) => id === requestRef.current && setError(err.message));
  }, [from, to, today]);

  useEffect(() => {
    load();
    const onFocus = () => !document.hidden && load();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [load]);

  const shift = (n) => {
    const d = new Date(month.y, month.m + n, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };
  const isCurrent = today >= from && today <= to;

  const totals = useMemo(() => {
    const t = { pending: 0, done: 0, cancelled: 0 };
    for (const d of data?.days ?? []) {
      t.pending += d.pending;
      t.done += d.done;
      t.cancelled += d.cancelled;
    }
    return t;
  }, [data]);

  const ready = data && data.key === from;
  const active = totals.pending + totals.done; // cancelled tasks don't count toward progress
  const rate = active ? Math.round((totals.done / active) * 100) : 0;
  const activeDays = (data?.days ?? []).filter((d) => d.pending + d.done + d.cancelled > 0);

  return (
    <Box sx={{ maxWidth: 1080, mx: 'auto', px: { xs: 1.5, sm: 3 }, pt: { xs: 2, sm: 3 }, pb: { xs: 'calc(176px + env(safe-area-inset-bottom))', md: 14 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography
            component="h1"
            sx={(t) => ({
              fontSize: { xs: 28, sm: 34 }, fontWeight: 400, lineHeight: 1.15,
              background: t.palette.mode === 'dark'
                ? 'linear-gradient(90deg,#8ab4f8,#d7aefb 55%,#ff8bcb)'
                : 'linear-gradient(90deg,#1a73e8,#9334e6 55%,#d01884)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            })}
          >
            {formatDate(from, { month: 'long', year: 'numeric' })}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>Monthly summary</Typography>
        </Box>
        {!isCurrent && <Button variant="outlined" onClick={() => {
          const d = new Date();
          setMonth({ y: d.getFullYear(), m: d.getMonth() });
        }}>This month</Button>}
        <IconButton aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></IconButton>
        <IconButton aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></IconButton>
      </Box>

      {error && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
          <Typography color="text.secondary" sx={{ flex: 1 }}>Couldn&apos;t load the summary. {error}</Typography>
          <Button variant="outlined" onClick={load}>Retry</Button>
        </Box>
      )}

      {!ready && !error && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={124} sx={{ borderRadius: '24px' }} />)}
          <Skeleton variant="rounded" height={240} sx={{ borderRadius: '24px', gridColumn: '1 / -1' }} />
        </Box>
      )}

      {ready && (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            <Kpi label="Tasks" value={active} sub={`${activeDays.length} active days`} color="#4285f4" icon={<EventNoteOutlined fontSize="small" />} />
            <Kpi label="Completed" value={totals.done} sub={`${rate}% of tasks`} color="#34a853" icon={<TaskAltRounded fontSize="small" />} />
            <Kpi label="Left" value={totals.pending} sub={data.overdue ? `${data.overdue} overdue` : 'none overdue'} color="#fbbc04" icon={<PendingActionsOutlined fontSize="small" />} />
            <Box
              sx={(t) => ({
                borderRadius: '24px', p: 2, display: 'flex', alignItems: 'center', gap: 2,
                bgcolor: hexAlpha(statusColors(t).rate, t.palette.mode === 'dark' ? 0.14 : 0.09),
                border: `1px solid ${hexAlpha(statusColors(t).rate, 0.28)}`,
              })}
            >
              <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                <CircularProgress variant="determinate" value={100} size={72} thickness={5} sx={(t) => ({ color: t.tokens.surfaceHighest, position: 'absolute' })} />
                <CircularProgress variant="determinate" value={rate} size={72} thickness={5} sx={(t) => ({ color: statusColors(t).rate })} />
                <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 17 }}>{rate}%</Typography>
                </Box>
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={(t) => ({ fontSize: 13.5, fontWeight: 500, color: statusColors(t).rate })}>Completion</Typography>
                <Typography variant="body2" color="text.secondary">{totals.done} of {active}</Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {[
              { k: 'overdue', icon: <HistoryRounded sx={{ fontSize: 18 }} />, label: `${data.overdue} overdue` },
              { k: 'postponed', icon: <EventRepeatOutlined sx={{ fontSize: 18 }} />, label: `${data.postponed} postponed` },
              { k: 'cancelled', icon: <BlockOutlined sx={{ fontSize: 18 }} />, label: `${totals.cancelled} cancelled` },
            ].map((p) => (
              <Box
                key={p.k}
                sx={(t) => ({
                  display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.5, height: 34, borderRadius: 999,
                  color: statusColors(t)[p.k], bgcolor: hexAlpha(statusColors(t)[p.k], 0.12), fontSize: 13.5, fontWeight: 500,
                })}
              >
                {p.icon}{p.label}
              </Box>
            ))}
          </Box>

          <Card title="Daily activity" icon={<EventNoteOutlined sx={{ color: 'primary.main' }} />}>
            <DailyChart days={data.days} from={from} to={to} today={today} onOpenDay={onOpenDay} />
          </Card>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
            <Card title="By company / tag" icon={<SellOutlined sx={(t) => ({ color: statusColors(t).rate })} />}>
              {data.byTag.length === 0 && <Typography color="text.secondary" variant="body2">No tasks this month.</Typography>}
              {[...data.byTag]
                .sort((a, b) => (a.tagId === null) - (b.tagId === null) || (b.done + b.pending) - (a.done + a.pending))
                .map((r) => {
                  const tag = r.tagId ? selectTag(r.tagId) : null;
                  if (r.tagId && !tag) return null;
                  return (
                    <BreakdownRow
                      key={r.tagId ?? 'none'}
                      icon={tag ? <TagAvatar tag={tag} size={24} /> : <Box sx={(t) => ({ width: 24, height: 24, borderRadius: '50%', border: `2px dashed ${t.tokens.outline}` })} />}
                      label={tag ? tag.name : 'No tag'}
                      c={r}
                    />
                  );
                })}
            </Card>
            <Card title="By priority" icon={<Flag sx={(t) => ({ color: priorityColor(t, 1) })} />}>
              {data.byPriority.length === 0 && <Typography color="text.secondary" variant="body2">No tasks this month.</Typography>}
              {data.byPriority.map((r) => (
                <BreakdownRow
                  key={r.priority}
                  icon={<Flag sx={(t) => ({ fontSize: 22, color: priorityColor(t, r.priority) })} />}
                  label={PRIORITIES[r.priority - 1].label}
                  c={r}
                />
              ))}
            </Card>
          </Box>

          <Card title="Day by day" icon={<TaskAltRounded sx={(t) => ({ color: statusColors(t).done })} />}>
            {activeDays.length === 0 && <Typography color="text.secondary" variant="body2">No tasks this month.</Typography>}
            <Box sx={{ display: 'grid' }}>
              {[...activeDays].reverse().map((d) => {
                const total = d.pending + d.done;
                const overdue = d.pending > 0 && d.date < today;
                return (
                  <ButtonBase
                    key={d.date}
                    onClick={() => onOpenDay(d.date)}
                    sx={(t) => ({
                      display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: '170px 1fr auto' }, alignItems: 'center',
                      columnGap: 2, rowGap: 0.75, py: 1.25, px: 1, borderRadius: 3, textAlign: 'left',
                      '&:hover': { bgcolor: t.tokens.surfaceHighest },
                    })}
                  >
                    <Typography sx={{ fontSize: 14.5, fontWeight: d.date === today ? 600 : 400, color: d.date === today ? 'primary.main' : 'text.primary' }}>
                      {shortLabel(d.date, today)}
                    </Typography>
                    <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, gridRow: { xs: 2, sm: 'auto' } }}>
                      <StackBar {...d} overdue={overdue} />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1.5, fontSize: 13, whiteSpace: 'nowrap' }}>
                      <Box component="span" sx={{ color: 'text.secondary' }}>{total} {total === 1 ? 'task' : 'tasks'}</Box>
                      <Box component="span" sx={(t) => ({ color: statusColors(t).done, fontWeight: 500 })}>{d.done} done</Box>
                      <Box component="span" sx={(t) => ({ color: overdue ? statusColors(t).overdue : statusColors(t).pending, fontWeight: 500 })}>{d.pending} left</Box>
                    </Box>
                  </ButtonBase>
                );
              })}
            </Box>
          </Card>
        </Box>
      )}
    </Box>
  );
}
