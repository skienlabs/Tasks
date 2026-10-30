import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, LinearProgress, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Close from '@mui/icons-material/Close';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import { hexAlpha, priorityColor, statusColors, tagColor } from '../../theme.js';
import { addDays, formatDate, fromKey, monthGrid, shortLabel, startOfWeek, weekdayNames } from '../../lib/dates.js';
import { parseDue } from '../../lib/due.js';
import { isTeamAdmin, loadActivity, myUid, nudgeTask, setMemberTitle, showToast } from '../../lib/store.js';
import { DueChip } from '../Due.jsx';
import { PersonAvatar, RolePill, ReviewChip, personName } from './parts.jsx';

export const cardSx = (t) => ({ borderRadius: '20px', bgcolor: t.tokens.card, border: `1px solid ${t.tokens.cardBorder}` });
export const isLate = (t, today, now = new Date()) => t.status === 'pending' && ((t.dueAt && parseDue(t.dueAt) < now) || t.date < today);
const pillGroup = { gap: 1, flexWrap: 'wrap', '& .MuiToggleButtonGroup-grouped': { border: 1, borderColor: 'divider', borderRadius: '999px !important', px: 1.5, ml: '0 !important', textTransform: 'none' } };

// ---- Calendar ------------------------------------------------------------------------

/** A month of team tasks, coloured by person; a day opens its list. */
export function TeamCalendar({ team, board, today, onOpenTask }) {
  const [month, setMonth] = useState(() => ({ y: fromKey(today).getFullYear(), m: fromKey(today).getMonth() }));
  const [day, setDay] = useState(today);
  const [who, setWho] = useState('all');
  const grid = monthGrid(month.y, month.m);
  const tasks = (board?.tasks ?? []).filter((t) => t.status !== 'cancelled' && (who === 'all' || t.assignee === who));
  const byDay = useMemo(() => {
    const m = new Map();
    for (const t of tasks) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return m;
  }, [tasks]);
  const colorOf = (uid) => {
    const i = team.members.findIndex((m) => m.uid === uid);
    return ['blue', 'green', 'purple', 'orange', 'pink', 'teal', 'indigo', 'red', 'brown', 'yellow'][(i < 0 ? 9 : i) % 10];
  };
  const shift = (n) => setMonth(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const inRange = (d) => !board || (d >= board.from && d <= board.to);
  const list = (byDay.get(day) ?? []).sort((a, b) => (a.status === b.status ? a.priority - b.priority : a.status === 'pending' ? -1 : 1));
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.4fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
      <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1, sm: 2 } })}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <IconButton aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></IconButton>
          <Typography sx={{ fontWeight: 600, minWidth: 140, textAlign: 'center' }}>
            {new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </Typography>
          <IconButton aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></IconButton>
          <Box sx={{ flex: 1 }} />
          <TextField select size="small" value={who} onChange={(e) => setWho(e.target.value)} sx={{ minWidth: 160 }} slotProps={{ select: { native: true } }} aria-label="Whose tasks">
            <option value="all">Everyone</option>
            {team.members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
          </TextField>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5 }}>
          {weekdayNames().map((w) => <Typography key={w} variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 0.5 }}>{w}</Typography>)}
          {grid.map((d) => {
            const items = byDay.get(d) ?? [];
            const out = fromKey(d).getMonth() !== month.m;
            const late = items.some((t) => isLate(t, today));
            return (
              <ButtonBase
                key={d}
                onClick={() => setDay(d)}
                aria-label={`${formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${items.length} tasks`}
                aria-pressed={d === day}
                sx={(t) => ({
                  display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', minHeight: { xs: 54, sm: 76 }, p: 0.5,
                  borderRadius: '10px', textAlign: 'left', opacity: out ? 0.45 : 1,
                  border: `1px solid ${d === day ? t.palette.primary.main : 'transparent'}`,
                  bgcolor: d === today ? hexAlpha(t.palette.primary.main, 0.08) : 'transparent',
                  '&:hover': { bgcolor: t.tokens.cardHover },
                })}
              >
                <Typography sx={{ fontSize: 12.5, fontWeight: d === today ? 700 : 500, color: d === today ? 'primary.main' : late ? 'error.main' : 'text.primary' }}>
                  {fromKey(d).getDate()}
                </Typography>
                {inRange(d) && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '3px', mt: 0.25 }}>
                    {items.slice(0, 8).map((t) => (
                      <Box key={t.id} sx={(th) => ({
                        width: 8, height: 8, borderRadius: '50%',
                        bgcolor: t.status === 'done' ? statusColors(th).done : tagColor(th, colorOf(t.assignee)).main,
                        opacity: t.status === 'done' ? 0.5 : 1,
                      })}
                      />
                    ))}
                    {items.length > 8 && <Typography sx={{ fontSize: 10, lineHeight: '8px' }}>+{items.length - 8}</Typography>}
                  </Box>
                )}
              </ButtonBase>
            );
          })}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1.5, px: 0.5 }}>
          {team.members.slice(0, 10).map((m) => (
            <Box key={m.uid} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
              <Box sx={(t) => ({ width: 8, height: 8, borderRadius: '50%', bgcolor: tagColor(t, colorOf(m.uid)).main })} />
              <Typography variant="caption" color="text.secondary">{m.name.split(' ')[0]}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1.5, sm: 2 } })}>
        <Typography sx={{ fontWeight: 600 }}>{formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{list.length ? `${list.length} task${list.length === 1 ? '' : 's'}` : 'Nothing planned'}</Typography>
        {!inRange(day) && <Typography variant="body2" color="text.secondary">The board shows six weeks back and ahead.</Typography>}
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          {list.map((t) => (
            <ButtonBase key={t.id} onClick={() => onOpenTask(t)} sx={(th) => ({ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', p: 1, borderRadius: '12px', '&:hover': { bgcolor: th.tokens.cardHover } })}>
              <Box sx={(th) => ({ width: 4, alignSelf: 'stretch', borderRadius: 2, bgcolor: tagColor(th, colorOf(t.assignee)).main })} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 14.5, ...(t.status === 'done' && { textDecoration: 'line-through', color: 'text.secondary' }) }}>{t.title}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>{personName(team, t.assignee)}</Typography>
              </Box>
              {t.dueAt && <DueChip task={t} />}
            </ButtonBase>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// ---- Workload ------------------------------------------------------------------------

/** Who has how much: open tasks, due this week, late, waiting for review. */
export function Workload({ team, board, today, onOpenPerson }) {
  const tasks = board?.tasks ?? [];
  const weekEnd = addDays(today, 6);
  const rows = team.members.map((m) => {
    const open = tasks.filter((t) => t.assignee === m.uid && t.status === 'pending');
    return {
      m,
      open: open.length,
      week: open.filter((t) => t.date <= weekEnd).length,
      late: open.filter((t) => isLate(t, today)).length,
      urgent: open.filter((t) => t.priority === 1).length,
      review: tasks.filter((t) => t.assignee === m.uid && t.review === 'waiting').length,
    };
  }).sort((a, b) => b.open - a.open || a.m.name.localeCompare(b.m.name));
  const most = Math.max(1, ...rows.map((r) => r.open));
  const avg = rows.length ? rows.reduce((a, r) => a + r.open, 0) / rows.length : 0;
  return (
    <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1.5, sm: 2 } })}>
      <Typography sx={{ fontWeight: 600 }}>Workload</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Open tasks per person · average {avg.toFixed(1)}. Busy people are marked so you can spread the work.
      </Typography>
      <Box sx={{ display: 'grid', gap: 1.25 }}>
        {rows.map(({ m, open, week, late, urgent, review }) => {
          const heavy = open > 0 && open >= avg * 1.5 && open >= 3;
          return (
            <ButtonBase key={m.uid} onClick={() => onOpenPerson(m)} sx={(t) => ({ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', gap: 1.5, alignItems: 'center', textAlign: 'left', p: 1, borderRadius: '14px', '&:hover': { bgcolor: t.tokens.cardHover } })}>
              <PersonAvatar person={m} size={36} />
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 500, fontSize: 14.5 }} noWrap>{m.name}</Typography>
                  {m.title && <Typography variant="body2" color="text.secondary" noWrap>{m.title}</Typography>}
                  {heavy && <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 700 }}>BUSY</Typography>}
                </Box>
                <Box sx={(t) => ({ position: 'relative', height: 10, borderRadius: 5, bgcolor: t.tokens.chip, mt: 0.6, overflow: 'hidden' })}>
                  <Box sx={(t) => ({ position: 'absolute', inset: 0, width: `${(open / most) * 100}%`, bgcolor: heavy ? t.palette.warning.main : t.palette.primary.main, borderRadius: 5, transition: 'width .3s' })} />
                  <Box sx={(t) => ({ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${(late / most) * 100}%`, bgcolor: t.palette.error.main, borderRadius: 5 })} />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: 12.5 }}>
                  {open} open · {week} this week
                  {late > 0 && <Box component="span" sx={{ color: 'error.main', fontWeight: 600 }}> · {late} late</Box>}
                  {urgent > 0 && ` · ${urgent} urgent`}
                  {review > 0 && ` · ${review} to review`}
                </Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}

// ---- Reports and export ------------------------------------------------------------------

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const stamp = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function rangeOf(period, today) {
  if (period === 'this') return [startOfWeek(today), addDays(startOfWeek(today), 6)];
  if (period === 'last') return [addDays(startOfWeek(today), -7), addDays(startOfWeek(today), -1)];
  return [addDays(today, -29), today];
}

export function reportRows(team, tasks, from, to, today) {
  const inRange = tasks.filter((t) => t.date >= from && t.date <= to && t.status !== 'cancelled');
  const rows = team.members.map((m) => {
    const mine = inRange.filter((t) => t.assignee === m.uid);
    const done = mine.filter((t) => t.status === 'done');
    const onTime = done.filter((t) => !t.dueAt || t.completedAt <= parseDue(t.dueAt).getTime()).length;
    return { m, total: mine.length, done: done.length, open: mine.length - done.length, late: mine.filter((t) => isLate(t, today)).length, onTime };
  }).sort((a, b) => b.done - a.done || b.total - a.total);
  return { rows, tasks: inRange };
}

function exportCsv(team, tasks, from, to) {
  const tagName = (id) => team.tags?.find((x) => x.id === id)?.name ?? '';
  const header = ['Day', 'Task', 'Person', 'Status', 'Sign-off', 'Priority', 'Time limit', 'Completed', 'Given by', 'Team tags', 'Notes'];
  const lines = [header, ...tasks.map((t) => [
    t.date, t.title, personName(team, t.assignee), t.status, t.review ?? (t.needsReview ? 'needed' : ''), `P${t.priority}`,
    t.dueAt ? t.dueAt.replace('T', ' ') : '', stamp(t.completedAt), personName(team, t.assignedBy),
    (t.teamTagIds ?? []).map(tagName).filter(Boolean).join(' '), t.notes,
  ])].map((r) => r.map(csvCell).join(','));
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${team.name.replace(/[^\w -]/g, '')} tasks ${from} to ${to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** A clean, printable report; the browser's print dialog saves it as a PDF. */
function exportPdf(team, rows, tasks, from, to) {
  const w = window.open('', '_blank');
  if (!w) {
    showToast('Allow pop-ups for this site to save the report as a PDF');
    return;
  }
  const done = rows.reduce((a, r) => a + r.done, 0);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const late = rows.reduce((a, r) => a + r.late, 0);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(team.name)} report ${from} – ${to}</title>
<style>
body{font:13px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f1f1f;margin:32px}
h1{font-size:22px;margin:0 0 2px}h2{font-size:15px;margin:24px 0 8px}
.sub{color:#5f6368;margin:0 0 18px}.k{display:flex;gap:28px;margin:12px 0 4px}.k b{display:block;font-size:22px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e0e0e0;vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#5f6368}.n{text-align:right}.late{color:#c5221f;font-weight:600}
.done{color:#188038}@page{margin:16mm}
</style></head><body>
<h1>${esc(team.name)}</h1><p class="sub">Team report · ${esc(formatDate(from, { day: 'numeric', month: 'short' }))} – ${esc(formatDate(to, { day: 'numeric', month: 'short', year: 'numeric' }))}</p>
<div class="k"><div><b>${done}/${total}</b>done</div><div><b>${total ? Math.round((done * 100) / total) : 0}%</b>complete</div><div><b class="${late ? 'late' : ''}">${late}</b>late</div></div>
<h2>People</h2><table><tr><th>Person</th><th>Job title</th><th class="n">Given</th><th class="n">Done</th><th class="n">On time</th><th class="n">Open</th><th class="n">Late</th></tr>
${rows.map((r) => `<tr><td>${esc(r.m.name)}</td><td>${esc(r.m.title ?? '')}</td><td class="n">${r.total}</td><td class="n">${r.done}</td><td class="n">${r.onTime}</td><td class="n">${r.open}</td><td class="n ${r.late ? 'late' : ''}">${r.late}</td></tr>`).join('')}
</table><h2>Tasks</h2><table><tr><th>Day</th><th>Task</th><th>Person</th><th>Status</th><th>Completed</th></tr>
${tasks.sort((a, b) => a.date.localeCompare(b.date)).map((t) => `<tr><td>${esc(t.date)}</td><td>${esc(t.title)}</td><td>${esc(personName(team, t.assignee))}</td><td class="${t.status === 'done' ? 'done' : ''}">${esc(t.status === 'done' ? (t.review === 'waiting' ? 'Done, to review' : 'Done') : 'Open')}</td><td>${esc(stamp(t.completedAt))}</td></tr>`).join('')}
</table><p class="sub" style="margin-top:24px">Made with Tasks · ${esc(new Date().toLocaleString())}</p>
<script>window.onload=()=>{window.focus();window.print();}</script></body></html>`);
  w.document.close();
}

export function Report({ team, board, today }) {
  const [period, setPeriod] = useState('last');
  const [from, to] = rangeOf(period, today);
  const { rows, tasks } = reportRows(team, board?.tasks ?? [], from, to, today);
  const done = rows.reduce((a, r) => a + r.done, 0);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const best = rows.find((r) => r.done > 0);
  return (
    <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1.5, sm: 2 } })}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Typography sx={{ fontWeight: 600, flex: 1 }}>Report</Typography>
        <Button size="small" variant="outlined" startIcon={<FileDownloadOutlined />} onClick={() => exportCsv(team, tasks, from, to)} disabled={!tasks.length}>CSV</Button>
        <Button size="small" variant="outlined" startIcon={<PictureAsPdfOutlined />} onClick={() => exportPdf(team, rows, tasks, from, to)} disabled={!tasks.length}>PDF</Button>
      </Box>
      <ToggleButtonGroup exclusive size="small" value={period} onChange={(_, v) => v && setPeriod(v)} sx={{ ...pillGroup, mb: 1.5 }}>
        <ToggleButton value="this">This week</ToggleButton>
        <ToggleButton value="last">Last week</ToggleButton>
        <ToggleButton value="30">Last 30 days</ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {formatDate(from, { day: 'numeric', month: 'short' })} – {formatDate(to, { day: 'numeric', month: 'short' })} · {done} of {total} done
        {best ? ` · most done: ${best.m.name} (${best.done})` : ''}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Box component="table" sx={(t) => ({ width: '100%', borderCollapse: 'collapse', fontSize: 14, '& th, & td': { textAlign: 'left', py: 0.75, px: 1, borderBottom: `1px solid ${t.palette.divider}`, whiteSpace: 'nowrap' }, '& th': { fontSize: 12, color: 'text.secondary', fontWeight: 600 }, '& .n': { textAlign: 'right' } })}>
          <thead><tr><th>Person</th><th className="n">Given</th><th className="n">Done</th><th className="n">On time</th><th className="n">Open</th><th className="n">Late</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m.uid}>
                <td>{r.m.name}</td><td className="n">{r.total}</td><td className="n">{r.done}</td><td className="n">{r.onTime}</td><td className="n">{r.open}</td>
                <Box component="td" className="n" sx={{ color: r.late ? 'error.main' : undefined, fontWeight: r.late ? 600 : undefined }}>{r.late}</Box>
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
    </Box>
  );
}

// ---- A person's page -------------------------------------------------------------------

export function PersonDialog({ team, member, board, today, onClose, onOpenTask, onAssign }) {
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'));
  const admin = isTeamAdmin(team);
  const me = myUid();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(member.title ?? '');
  const tasks = (board?.tasks ?? []).filter((t) => t.assignee === member.uid);
  const open = tasks.filter((t) => t.status === 'pending').sort((a, b) => (a.dueAt ?? `${a.date}T99`).localeCompare(b.dueAt ?? `${b.date}T99`));
  const [from] = rangeOf('30', today);
  const recent = tasks.filter((t) => t.date >= from && t.date <= today && t.status !== 'cancelled');
  const done = recent.filter((t) => t.status === 'done');
  const onTime = done.filter((t) => !t.dueAt || t.completedAt <= parseDue(t.dueAt).getTime()).length;
  const late = open.filter((t) => isLate(t, today)).length;
  const groups = (team.groups ?? []).filter((g) => g.members.includes(member.uid));
  const save = async () => {
    try {
      await setMemberTitle(team.id, member.uid, title);
      setEditing(false);
    } catch (err) {
      showToast(err.message);
    }
  };
  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1.5 }}>
        <PersonAvatar person={member} size={48} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 500 }} noWrap>{member.name}{member.uid === me ? ' (you)' : ''}</Typography>
          {!editing ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" color="text.secondary" noWrap>{member.title || (admin || member.uid === me ? 'No job title' : member.email)}</Typography>
              {(admin || member.uid === me) && !team.archived && (
                <IconButton size="small" aria-label="Edit job title" onClick={() => setEditing(true)}><EditOutlined sx={{ fontSize: 16 }} /></IconButton>
              )}
            </Box>
          ) : (
            <Box component="form" onSubmit={(e) => { e.preventDefault(); save(); }} sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              <TextField size="small" autoFocus placeholder="e.g. Designer" value={title} onChange={(e) => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
              <IconButton type="submit" aria-label="Save job title" color="primary"><CheckRounded /></IconButton>
            </Box>
          )}
        </Box>
        <RolePill role={member.role} />
        <IconButton aria-label="Close" onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, alignContent: 'start' }}>
        {member.email && <Typography variant="body2" color="text.secondary">{member.email} · joined {new Date(member.joinedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Typography>}
        {groups.length > 0 && <Typography variant="body2" color="text.secondary">Groups: {groups.map((g) => g.name).join(', ')}</Typography>}
        {admin && (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1 }}>
              {[['Open', open.length, (t) => statusColors(t).pending], ['Late', late, (t) => statusColors(t).overdue], ['Done (30 d)', done.length, (t) => statusColors(t).done], ['On time', done.length ? `${Math.round((onTime * 100) / done.length)}%` : '–', (t) => statusColors(t).rate]].map(([l, v, c]) => (
                <Box key={l} sx={(t) => ({ ...cardSx(t), p: 1.25 })}>
                  <Typography sx={(t) => ({ fontSize: 22, fontWeight: 500, color: c(t) })}>{v}</Typography>
                  <Typography variant="caption" color="text.secondary">{l}</Typography>
                </Box>
              ))}
            </Box>
            <LinearProgress variant="determinate" value={recent.length ? (done.length / recent.length) * 100 : 0}
              sx={(t) => ({ height: 8, borderRadius: 4, bgcolor: t.tokens.chip, '& .MuiLinearProgress-bar': { bgcolor: statusColors(t).done } })}
            />
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: 600, flex: 1 }}>Open tasks</Typography>
              {!team.archived && <Button size="small" onClick={() => onAssign(member.uid)}>Give a task</Button>}
            </Box>
            {open.length === 0 && <Typography variant="body2" color="text.secondary">Nothing open.</Typography>}
            <Box sx={{ display: 'grid', gap: 0.5 }}>
              {open.map((t) => (
                <Box key={t.id} sx={(th) => ({ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: '12px', '&:hover': { bgcolor: th.tokens.cardHover } })}>
                  <ButtonBase onClick={() => onOpenTask(t)} sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Box sx={(th) => ({ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: priorityColor(th, t.priority) })} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 14.5 }}>{t.title}</Typography>
                      <Typography variant="body2" color={isLate(t, today) ? 'error' : 'text.secondary'} noWrap>{shortLabel(t.date, today)}</Typography>
                    </Box>
                  </ButtonBase>
                  {t.dueAt && <DueChip task={t} />}
                  <ReviewChip task={t} />
                  {member.uid !== me && !team.archived && (
                    <Tooltip title="Remind">
                      <IconButton size="small" aria-label={`Remind about ${t.title}`} onClick={() => nudgeTask(team.id, t).then(() => showToast('Reminder sent'), (err) => showToast(err.message))}>
                        <NotificationsActiveOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Activity log ------------------------------------------------------------------------

const ACTION = {
  created: 'created the team',
  edited: 'edited the team',
  settings: 'changed the team settings',
  archived: 'archived the team',
  unarchived: 'brought the team back',
  invited: 'invited people',
  joined: 'joined',
  left: 'left',
  removed: 'removed someone',
  role: 'changed a role',
  link: 'made a new invite link',
  'approved-join': 'let someone in',
  given: 'gave a task',
  edited_task: 'edited a task',
  reassigned: 'moved a task to someone else',
  deleted: 'deleted a task',
  completed: 'finished a task',
  reopened: 'opened a task again',
  moved: 'moved a task',
  'review-requested': 'finished a task (to review)',
  approved: 'approved a task',
  returned: 'sent a task back',
  commented: 'commented',
  nudged: 'sent a reminder',
  'status-done': 'marked a task done',
  'status-pending': 'opened a task again',
  'status-cancelled': 'cancelled a task',
  'group-created': 'made a group',
  'group-edited': 'edited a group',
  'group-deleted': 'deleted a group',
  'template-created': 'saved a template',
  'repeat-created': 'set up a repeating task',
  'repeat-edited': 'changed a repeating task',
  'repeat-deleted': 'stopped a repeating task',
};

function describe(a, team) {
  const d = a.detail ?? {};
  let what = a.action === 'edited' && a.taskId ? ACTION.edited_task : ACTION[a.action] ?? a.action;
  if (a.action === 'role' && d.uid) what = `made ${personName(team, d.uid)} ${d.role === 'owner' ? 'the owner' : `${d.role === 'admin' ? 'an admin' : 'a member'}`}`;
  if ((a.action === 'removed' || a.action === 'approved-join') && d.uid) what = `${a.action === 'removed' ? 'removed' : 'let in'} ${personName(team, d.uid)}`;
  if (a.action === 'given' && d.to?.length) what = `gave ${d.to.length > 1 ? `${d.to.length} people` : personName(team, d.to[0])} a task${d.repeat ? ' (repeating)' : ''}`;
  if (a.action === 'reassigned' && d.to) what = `moved a task to ${personName(team, d.to)}`;
  if (a.action === 'invited' && d.emails) what = `invited ${d.emails.slice(0, 3).join(', ')}${d.emails.length > 3 ? ` +${d.emails.length - 3}` : ''}`;
  return { what, title: d.title ?? d.name ?? null };
}

export function ActivityLog({ team }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = async (before) => {
    setBusy(true);
    try {
      const list = await loadActivity(team.id, before);
      setItems((old) => (before ? [...(old ?? []), ...list] : list));
      setMore(list.length === 50);
    } catch (err) {
      setError(err.status === 0 ? 'Connect to see the activity.' : err.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, [team.id, team.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error && !items) return <Alert severity="warning" sx={{ borderRadius: 3 }}>{error}</Alert>;
  if (!items) return <LinearProgress sx={{ borderRadius: 2 }} />;
  let lastDay = '';
  return (
    <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1.5, sm: 2 } })}>
      <Typography sx={{ fontWeight: 600, mb: 1 }}>Activity</Typography>
      {items.length === 0 && <Typography variant="body2" color="text.secondary">Nothing yet.</Typography>}
      {items.map((a) => {
        const day = new Date(a.createdAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        const header = day !== lastDay;
        lastDay = day;
        const { what, title } = describe(a, team);
        return (
          <Box key={a.id}>
            {header && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, mb: 0.5, fontWeight: 600 }}>{day}</Typography>}
            <Box sx={{ display: 'flex', gap: 1.25, py: 0.6, alignItems: 'flex-start' }}>
              <PersonAvatar person={team.members.find((m) => m.uid === a.uid) ?? { name: a.name }} size={26} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 14 }}>
                  <b>{a.uid === myUid() ? 'You' : a.name}</b> {what}
                  {title && <Box component="span" sx={{ color: 'text.secondary' }}> · {title}</Box>}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {new Date(a.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </Typography>
            </Box>
          </Box>
        );
      })}
      {more && items.length > 0 && (
        <Button size="small" onClick={() => load(items[items.length - 1].id)} disabled={busy} sx={{ mt: 1 }} startIcon={busy ? <CircularProgress size={14} /> : null}>
          Older
        </Button>
      )}
    </Box>
  );
}
