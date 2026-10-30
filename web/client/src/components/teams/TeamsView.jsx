import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  LinearProgress, ListItemIcon, ListItemText, Menu, MenuItem, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import GroupAddRounded from '@mui/icons-material/GroupAddRounded';
import AddTaskRounded from '@mui/icons-material/AddTaskRounded';
import ArrowBack from '@mui/icons-material/ArrowBack';
import MoreVert from '@mui/icons-material/MoreVert';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import PersonRemoveOutlined from '@mui/icons-material/PersonRemoveOutlined';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import CheckCircle from '@mui/icons-material/CheckCircle';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import Replay from '@mui/icons-material/Replay';
import CloudOffRounded from '@mui/icons-material/CloudOffRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import AttachFileRounded from '@mui/icons-material/AttachFileRounded';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import Close from '@mui/icons-material/Close';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import { useMediaQuery } from '@mui/material';
import { hexAlpha, priorityColor, statusColors } from '../../theme.js';
import { addDays, shortLabel, startOfWeek } from '../../lib/dates.js';
import { parseDue } from '../../lib/due.js';
import {
  acceptInvite, addTeamImage, allTasks, answerJoinRequest, areTeamsLoaded, cancelInvite, declineInvite, deleteTeam, deleteTeamTask, isTeamAdmin,
  loadBoard, loadTeams, myUid, nudgeTask, removeMember, reviewTask, selectBoard, selectInvites, selectSync, selectTeam, selectTeams,
  setMemberRole, showToast, updateTeamTask, useStoreVersion,
} from '../../lib/store.js';
import { prepareImage } from '../../lib/images.js';
import { progress } from '../../lib/subtasks.js';
import { formatDate } from '../../lib/dates.js';
import { DueChip } from '../Due.jsx';
import { ImageViewer, Thumb } from '../Images.jsx';
import { AssignDialog, InviteDialog, ShareInvite, TeamFormDialog } from './TeamDialogs.jsx';
import { PersonAvatar, ReviewChip, RolePill, SharedChip, TeamAvatar, TeamTagChips } from './parts.jsx';
import { Comments, ReviewActions, TaskFiles, canManageTask } from './TaskTeamPanel.jsx';
import { ActivityLog, PersonDialog, Report, TeamCalendar, Workload, cardSx, isLate } from './Insights.jsx';
import TeamSettings from './TeamSettings.jsx';

const pageSx = { maxWidth: 1140, mx: 'auto', px: { xs: 1.5, sm: 3 }, pt: { xs: 2, sm: 3 }, pb: { xs: 14, md: 6 } };
// The team board: everything given out in the last ~6 weeks and the next 6, plus whatever is still open.
const boardRange = (today) => [addDays(today, -45), addDays(today, 45)];

function Confirm({ open, title, text, action, danger, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Typography color="text.secondary">{text}</Typography></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          color={danger ? 'error' : 'primary'}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {action}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Runs a team action and reports a refusal ("Only the owner can…") as a toast. */
async function attempt(fn, done) {
  try {
    const out = await fn();
    if (done) showToast(done);
    return out;
  } catch (err) {
    showToast(err.message);
    return undefined;
  }
}

function InviteCard({ invite }) {
  const [busy, setBusy] = useState('');
  const act = async (kind, fn, msg) => {
    setBusy(kind);
    await attempt(fn, msg);
    setBusy('');
  };
  return (
    <Box sx={(t) => ({ ...cardSx(t), p: 2, display: 'flex', alignItems: 'center', gap: 1.75, flexWrap: 'wrap', borderColor: hexAlpha(t.palette.primary.main, 0.45) })}>
      <TeamAvatar team={{ name: invite.teamName, color: invite.teamColor, logo: invite.teamLogo }} size={44} />
      <Box sx={{ flex: 1, minWidth: 200 }}>
        <Typography sx={{ fontWeight: 600 }}>{invite.teamName}</Typography>
        <Typography variant="body2" color="text.secondary">
          {invite.invitedByName} invited you as {invite.role === 'admin' ? 'an admin' : 'a member'} · {invite.memberCount} {invite.memberCount === 1 ? 'person' : 'people'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button disabled={Boolean(busy)} onClick={() => act('decline', () => declineInvite(invite.id), 'Invite declined')}>
          {busy === 'decline' ? <CircularProgress size={18} /> : 'Decline'}
        </Button>
        <Button variant="contained" disabled={Boolean(busy)} onClick={() => act('accept', () => acceptInvite(invite.id), `You joined ${invite.teamName}`)}>
          {busy === 'accept' ? <CircularProgress size={18} color="inherit" /> : 'Join team'}
        </Button>
      </Box>
    </Box>
  );
}

function TeamRow({ team, active, onClick }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      sx={(t) => ({
        ...cardSx(t), width: '100%', p: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left',
        transition: 'border-color 120ms, background-color 120ms',
        '&:hover': { bgcolor: t.tokens.cardHover },
        ...(active && { borderColor: t.palette.primary.main, boxShadow: `0 0 0 3px ${hexAlpha(t.palette.primary.main, 0.14)}` }),
      })}
    >
      <TeamAvatar team={team} size={42} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 600 }}>{team.name}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {team.members.length} {team.members.length === 1 ? 'person' : 'people'}
          {isTeamAdmin(team) && team.invites.length > 0 ? ` · ${team.invites.length} invited` : ''}
        </Typography>
      </Box>
      <RolePill role={team.role} />
    </ButtonBase>
  );
}


/** Admin overview: who finished what, who is behind, over a period. */
function Overview({ team, board, today, onOpenTasks }) {
  const [period, setPeriod] = useState('week');
  const now = new Date();
  const from = period === 'week' ? startOfWeek(today) : period === '7' ? addDays(today, -6) : addDays(today, -29);
  const to = period === 'week' ? addDays(startOfWeek(today), 6) : today;
  const tasks = board?.tasks ?? [];
  const inPeriod = (t) => (t.status === 'pending' ? t.date <= to : t.date >= from && t.date <= to);
  const rows = team.members.map((m) => {
    const mine = tasks.filter((t) => t.assignee === m.uid && inPeriod(t));
    const done = mine.filter((t) => t.status === 'done').length;
    const open = mine.filter((t) => t.status === 'pending').length;
    const late = mine.filter((t) => isLate(t, today, now)).length;
    return { m, total: mine.filter((t) => t.status !== 'cancelled').length, done, open, late };
  }).sort((a, b) => b.total - a.total || a.m.name.localeCompare(b.m.name));
  const sum = rows.reduce((a, r) => ({ total: a.total + r.total, done: a.done + r.done, open: a.open + r.open, late: a.late + r.late }), { total: 0, done: 0, open: 0, late: 0 });
  const soon = tasks.filter((t) => t.status === 'pending' && t.dueAt && parseDue(t.dueAt) >= now && parseDue(t.dueAt) - now < 86_400_000).length;
  const recent = tasks.filter((t) => t.status === 'done' && t.completedAt).sort((a, b) => b.completedAt - a.completedAt).slice(0, 8);
  const name = (uid) => team.members.find((m) => m.uid === uid)?.name ?? 'Former member';

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <ToggleButtonGroup exclusive size="small" value={period} onChange={(_, v) => v && setPeriod(v)}
        sx={{ gap: 1, '& .MuiToggleButtonGroup-grouped': { border: 1, borderColor: 'divider', borderRadius: '999px !important', px: 1.75, ml: '0 !important', textTransform: 'none' } }}
      >
        <ToggleButton value="week">This week</ToggleButton>
        <ToggleButton value="7">Last 7 days</ToggleButton>
        <ToggleButton value="30">Last 30 days</ToggleButton>
      </ToggleButtonGroup>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.25 }}>
        {[
          ['Done', sum.done, (t) => statusColors(t).done],
          ['Open', sum.open, (t) => statusColors(t).pending],
          ['Late', sum.late, (t) => statusColors(t).overdue],
          ['Due within a day', soon, (t) => t.palette.warning.main],
        ].map(([label, v, c]) => (
          <Box key={label} sx={(t) => ({ ...cardSx(t), p: 1.75 })}>
            <Typography sx={(t) => ({ fontSize: 28, fontWeight: 500, lineHeight: 1.1, color: c(t) })}>{v}</Typography>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1.5, sm: 2 } })}>
        <Typography sx={{ fontWeight: 600, mb: 1 }}>People</Typography>
        {rows.map(({ m, total, done, open, late }) => (
          <Box key={m.uid} sx={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', alignItems: 'center', columnGap: 1.5, py: 1 }}>
            <PersonAvatar person={m} size={32} />
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 500 }}>{m.name}{m.uid === myUid() ? ' (you)' : ''}</Typography>
              <LinearProgress
                variant="determinate"
                value={total ? (done / total) * 100 : 0}
                sx={(t) => ({ mt: 0.6, height: 6, borderRadius: 3, bgcolor: t.tokens.chip, '& .MuiLinearProgress-bar': { bgcolor: statusColors(t).done } })}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right', whiteSpace: { xs: 'normal', sm: 'nowrap' }, maxWidth: { xs: 110, sm: 'none' }, fontSize: { xs: 12.5, sm: 14 } }}>
              {total ? `${done}/${total} done` : 'Nothing given'}
              {open > 0 && ` · ${open} open`}
              {late > 0 && <Box component="span" sx={{ color: 'error.main', fontWeight: 600 }}> · {late} late</Box>}
            </Typography>
          </Box>
        ))}
        <Button size="small" onClick={onOpenTasks} sx={{ mt: 0.5 }}>See all team tasks</Button>
      </Box>

      <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1.5, sm: 2 } })}>
        <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Recently completed</Typography>
        {recent.length === 0 && <Typography variant="body2" color="text.secondary">Nothing finished yet.</Typography>}
        {recent.map((t) => (
          <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.25, py: 0.75 }}>
            <CheckCircle sx={(th) => ({ fontSize: 20, color: statusColors(th).done })} />
            <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 14.5 }}>{t.title}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {name(t.assignee)} · {new Date(t.completedAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </Typography>
            </Box>
            {t.dueAt && <DueChip task={t} />}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const STATUS_ICON = { pending: RadioButtonUnchecked, done: CheckCircle, cancelled: BlockOutlined };

/** A team task, as its admins (or the member who gave it) see it: details, sign-off, files, comments. */
function BoardTaskDialog({ task: initial, team, today, onClose, onEdit }) {
  useStoreVersion();
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'));
  const board = selectBoard(team.id);
  const task = board?.tasks.find((t) => t.id === initial.id) ?? initial;
  const [viewer, setViewer] = useState(null);
  const [adding, setAdding] = useState(false);
  const imageRef = useRef(null);
  const manage = canManageTask(task, team);
  const admin = isTeamAdmin(team);
  const person = team.members.find((m) => m.uid === task.assignee);
  const giver = team.members.find((m) => m.uid === task.assignedBy);
  const steps = task.subtasks ?? [];
  const p = progress(steps);
  const images = task.attachments ?? [];
  const siblings = task.groupId ? (board?.tasks ?? []).filter((t) => t.groupId === task.groupId && t.id !== task.id) : [];
  const late = isLate(task, today, new Date());
  const addImages = async (e) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    setAdding(true);
    try {
      for (const f of files) await addTeamImage(team.id, task, await prepareImage(f));
    } catch (err) {
      showToast(err.message);
    } finally {
      setAdding(false);
    }
  };
  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pr: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: 20, fontWeight: 500, wordBreak: 'break-word', ...(task.status !== 'pending' && { textDecoration: 'line-through', color: 'text.secondary' }) }}>
            {task.title}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75, alignItems: 'center' }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
              <PersonAvatar person={person ?? { name: '?' }} size={22} />
              <Typography variant="body2">{person ? person.name : 'Former member'}</Typography>
            </Box>
            <Typography variant="body2" color={late ? 'error' : 'text.secondary'}>· {formatDate(task.date, { weekday: 'short', day: 'numeric', month: 'short' })}</Typography>
            {task.dueAt && <DueChip task={task} />}
            <ReviewChip task={task} />
            <TeamTagChips task={task} teamTags={team.tags} />
            <SharedChip task={task} count={siblings.length + 1} />
          </Box>
        </Box>
        {manage && !team.archived && (
          <Tooltip title="Edit or reassign"><IconButton aria-label="Edit task" onClick={() => onEdit(task)}><EditOutlined /></IconButton></Tooltip>
        )}
        <IconButton aria-label="Close" onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '0 !important' }}>
        <Typography variant="body2" color="text.secondary">
          {task.status === 'done' ? `Done ${task.completedAt ? new Date(task.completedAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}` : task.status === 'cancelled' ? 'Cancelled' : 'Open'}
          {giver ? ` · given by ${giver.uid === myUid() ? 'you' : giver.name}` : ''}
          {task.postponed > 0 ? ` · postponed ${task.postponed === 1 ? 'once' : `${task.postponed} times`}` : ''}
          {task.recurringId ? ' · repeats' : ''}
        </Typography>
        {siblings.length > 0 && (
          <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {siblings.map((sib) => {
              const m = team.members.find((x) => x.uid === sib.assignee);
              const Icon = STATUS_ICON[sib.status] ?? RadioButtonUnchecked;
              return (
                <Box key={sib.id} sx={(t) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 26, px: 1, borderRadius: 999, bgcolor: t.tokens.chip, fontSize: 13 })}>
                  <Icon sx={(t) => ({ fontSize: 15, color: sib.status === 'done' ? statusColors(t).done : 'text.secondary' })} />
                  {m?.name ?? 'Former member'}
                  {sib.closedBy && <Box component="span" sx={{ color: 'text.secondary' }}>· closed</Box>}
                </Box>
              );
            })}
          </Box>
        )}
        {task.notes && <Typography sx={{ mt: 2, fontSize: 14.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{task.notes}</Typography>}
        {steps.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Steps · {p.done}/{p.total}</Typography>
            <LinearProgress variant="determinate" value={p.total ? (p.done / p.total) * 100 : 0} sx={(t) => ({ height: 6, borderRadius: 3, bgcolor: t.tokens.chip, mb: 1 })} />
            {steps.filter((s) => !s.parentId).map((s) => (
              <Box key={s.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 0.25 }}>
                {s.done ? <CheckCircle sx={(t) => ({ fontSize: 18, color: statusColors(t).done })} /> : <RadioButtonUnchecked sx={{ fontSize: 18, color: 'text.secondary' }} />}
                <Typography sx={{ fontSize: 14, ...(s.done && { textDecoration: 'line-through', color: 'text.secondary' }) }}>{s.title}</Typography>
              </Box>
            ))}
          </Box>
        )}
        {(images.length > 0 || (manage && !team.archived)) && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Images{images.length ? ` · ${images.length}` : ''}</Typography>
              {manage && !team.archived && (
                <Button size="small" startIcon={adding ? <CircularProgress size={14} /> : <AddPhotoAlternateOutlined />} disabled={adding} onClick={() => imageRef.current?.click()}>Add image</Button>
              )}
              <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={addImages} />
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {images.map((a, i) => <Thumb key={a.id} attachment={a} size={72} onClick={() => setViewer(i)} label={`Open image ${i + 1}`} />)}
            </Box>
          </Box>
        )}
        <ReviewActions task={task} team={team} />
        <TaskFiles task={task} team={team} canAdd={manage && !team.archived} asAdmin={task.assignee !== myUid()} />
        <Comments task={task} team={team} />
        {admin && !team.archived && task.status !== 'pending' && (
          <Button size="small" startIcon={<Replay />} sx={{ mt: 2 }} onClick={() => attempt(() => updateTeamTask(team.id, task, { status: 'pending' }), 'Opened again')}>Open it again</Button>
        )}
        <Box sx={{ height: 16 }} />
      </DialogContent>
      {viewer !== null && <ImageViewer attachments={images} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
    </Dialog>
  );
}

function BoardTask({ task, team, today, onOpen, onEdit }) {
  const [menuEl, setMenuEl] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const person = team.members.find((m) => m.uid === task.assignee);
  const Icon = STATUS_ICON[task.status] ?? RadioButtonUnchecked;
  const late = isLate(task, today, new Date());
  const admin = isTeamAdmin(team);
  const manage = canManageTask(task, team) && !team.archived;
  const set = (status) => attempt(() => updateTeamTask(team.id, task, { status }));
  const steps = task.subtasks ?? [];
  const leaves = steps.filter((s) => !steps.some((c) => c.parentId === s.id));
  return (
    <Box
      sx={(t) => ({
        ...cardSx(t), p: 1.25, pl: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1.25, cursor: 'pointer',
        ...(late && { borderColor: hexAlpha(t.palette.error.main, 0.45) }),
        ...(task.review === 'waiting' && { borderColor: hexAlpha(t.palette.warning.main, 0.6) }),
        '&:hover': { bgcolor: t.tokens.cardHover },
      })}
      onClick={() => onOpen(task)}
    >
      <Icon sx={(t) => ({ mt: 0.25, fontSize: 22, color: task.status === 'done' ? statusColors(t).done : task.status === 'cancelled' ? 'text.disabled' : priorityColor(t, task.priority) })} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 15, wordBreak: 'break-word', ...(task.status !== 'pending' && { textDecoration: 'line-through', color: 'text.secondary' }) }}>
          {task.title}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
            <PersonAvatar person={person ?? { name: '?' }} size={20} />
            <Typography variant="body2" color="text.secondary">{person ? person.name : 'Former member'}</Typography>
          </Box>
          <Typography variant="body2" color={late && task.date < today ? 'error' : 'text.secondary'}>· {shortLabel(task.date, today)}</Typography>
          {task.dueAt && <DueChip task={task} />}
          <ReviewChip task={task} />
          <TeamTagChips task={task} teamTags={team.tags} />
          {leaves.length > 0 && (
            <Typography variant="body2" color="text.secondary">· {leaves.filter((s) => s.done).length}/{leaves.length} steps</Typography>
          )}
          {task.comments > 0 && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: 'text.secondary' }}>
              <ChatBubbleOutlineRounded sx={{ fontSize: 15 }} /><Typography variant="body2">{task.comments}</Typography>
            </Box>
          )}
          {(task.files?.length ?? 0) + (task.attachments?.length ?? 0) > 0 && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: 'text.secondary' }}>
              <AttachFileRounded sx={{ fontSize: 15 }} /><Typography variant="body2">{(task.files?.length ?? 0) + (task.attachments?.length ?? 0)}</Typography>
            </Box>
          )}
          {task.notes && <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>· {task.notes.split('\n')[0]}</Typography>}
        </Box>
      </Box>
      {manage && (
        <IconButton
          size="small"
          aria-label={`More actions for "${task.title}"`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuEl(e.currentTarget);
          }}
        >
          <MoreVert fontSize="small" />
        </IconButton>
      )}
      <Menu anchorEl={menuEl} open={Boolean(menuEl)} onClose={() => setMenuEl(null)} onClick={(e) => e.stopPropagation()}>
        <MenuItem onClick={() => { setMenuEl(null); onEdit(task); }}>
          <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon><ListItemText>Edit or reassign</ListItemText>
        </MenuItem>
        {task.review === 'waiting' && (
          <MenuItem onClick={() => { setMenuEl(null); attempt(() => reviewTask(team.id, task, 'approve'), 'Approved'); }}>
            <ListItemIcon><VerifiedRounded fontSize="small" color="success" /></ListItemIcon><ListItemText>Approve</ListItemText>
          </MenuItem>
        )}
        {task.status === 'pending' && task.assignee !== myUid() && (
          <MenuItem onClick={() => { setMenuEl(null); attempt(() => nudgeTask(team.id, task), 'Reminder sent'); }}>
            <ListItemIcon><NotificationsActiveOutlined fontSize="small" /></ListItemIcon><ListItemText>Remind {person?.name.split(' ')[0] ?? ''}</ListItemText>
          </MenuItem>
        )}
        {task.status === 'pending' ? (
          <MenuItem onClick={() => { setMenuEl(null); set('cancelled'); }}>
            <ListItemIcon><BlockOutlined fontSize="small" /></ListItemIcon><ListItemText>Cancel task</ListItemText>
          </MenuItem>
        ) : (
          <MenuItem onClick={() => { setMenuEl(null); set('pending'); }}>
            <ListItemIcon><Replay fontSize="small" /></ListItemIcon><ListItemText>Open it again</ListItemText>
          </MenuItem>
        )}
        {admin && (
          <MenuItem onClick={() => { setMenuEl(null); setConfirm(true); }} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteOutlined fontSize="small" color="error" /></ListItemIcon><ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>
      <Box onClick={(e) => e.stopPropagation()}>
        <Confirm
          open={confirm}
          danger
          title="Delete this task?"
          text={`"${task.title}" disappears from ${person ? `${person.name}'s` : 'their'} list too.`}
          action="Delete"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            await attempt(() => deleteTeamTask(team.id, task), 'Task deleted');
            setConfirm(false);
          }}
        />
      </Box>
    </Box>
  );
}

function Board({ team, board, today, onAssign, onOpen, onEdit, mineOnly }) {
  const [who, setWho] = useState('all');
  const [status, setStatus] = useState('open');
  const [tag, setTag] = useState('all');
  const me = myUid();
  const groups = team.groups ?? [];
  const matchWho = (t) => {
    if (who === 'all') return true;
    if (who.startsWith('g:')) return (groups.find((g) => g.id === who.slice(2))?.members ?? []).includes(t.assignee);
    return t.assignee === who;
  };
  const review = (board?.tasks ?? []).filter((t) => t.review === 'waiting').length;
  const tasks = (board?.tasks ?? [])
    .filter((t) => !mineOnly || t.assignedBy === me)
    .filter(matchWho)
    .filter((t) => tag === 'all' || (t.teamTagIds ?? []).includes(tag))
    .filter((t) => (status === 'open' ? t.status === 'pending' : status === 'done' ? t.status === 'done' : status === 'review' ? t.review === 'waiting' : status === 'late' ? isLate(t, today, new Date()) : true))
    .sort((a, b) => {
      if (status === 'all' && a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      const da = a.dueAt ?? `${a.date}T99`;
      const db = b.dueAt ?? `${b.date}T99`;
      return status === 'done' ? (b.completedAt ?? 0) - (a.completedAt ?? 0) : da.localeCompare(db) || a.priority - b.priority;
    });
  return (
    <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField select size="small" value={who} onChange={(e) => setWho(e.target.value)} sx={{ minWidth: 170 }} aria-label="Whose tasks">
          <MenuItem value="all">Everyone</MenuItem>
          {groups.map((g) => <MenuItem key={g.id} value={`g:${g.id}`}>Group: {g.name}</MenuItem>)}
          {team.members.map((m) => <MenuItem key={m.uid} value={m.uid}>{m.name}{m.uid === me ? ' (you)' : ''}</MenuItem>)}
        </TextField>
        {(team.tags ?? []).length > 0 && (
          <TextField select size="small" value={tag} onChange={(e) => setTag(e.target.value)} sx={{ minWidth: 140 }} aria-label="Team tag">
            <MenuItem value="all">All tags</MenuItem>
            {team.tags.map((x) => <MenuItem key={x.id} value={x.id}># {x.name}</MenuItem>)}
          </TextField>
        )}
        <ToggleButtonGroup exclusive size="small" value={status} onChange={(_, v) => v && setStatus(v)}
          sx={{ gap: 1, flexWrap: 'wrap', '& .MuiToggleButtonGroup-grouped': { border: 1, borderColor: 'divider', borderRadius: '999px !important', px: 1.5, ml: '0 !important', textTransform: 'none' } }}
        >
          <ToggleButton value="open">Open</ToggleButton>
          <ToggleButton value="review">To review{review ? ` · ${review}` : ''}</ToggleButton>
          <ToggleButton value="late">Late</ToggleButton>
          <ToggleButton value="done">Done</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        {/* Phones use the floating button instead. */}
        {onAssign && (
          <Button variant="contained" startIcon={<AddTaskRounded />} onClick={() => onAssign(who === 'all' || who.startsWith('g:') ? null : who)} sx={{ display: { xs: 'none', md: 'inline-flex' } }}>
            Give a task
          </Button>
        )}
      </Box>
      {tasks.length === 0 && (
        <Box sx={(t) => ({ ...cardSx(t), p: 3, textAlign: 'center' })}>
          <Typography color="text.secondary">
            {status === 'open' ? 'No open team tasks.' : status === 'review' ? 'Nothing waiting for review.' : status === 'late' ? 'Nothing late. Nice.' : status === 'done' ? 'Nothing completed in the last six weeks.' : 'No team tasks yet.'}
          </Typography>
        </Box>
      )}
      {tasks.map((t) => <BoardTask key={t.id} task={t} team={team} today={today} onOpen={onOpen} onEdit={onEdit} />)}
    </Box>
  );
}

/** For members: the team's tasks in their own list. */
function MyTeamTasks({ team, today, onOpenDay }) {
  useStoreVersion();
  const mine = allTasks().filter((t) => t.teamId === team.id)
    .sort((a, b) => (a.status === b.status ? (a.dueAt ?? `${a.date}T99`).localeCompare(b.dueAt ?? `${b.date}T99`) : a.status === 'pending' ? -1 : 1))
    .slice(0, 50);
  const by = (uid) => team.members.find((m) => m.uid === uid)?.name;
  return (
    <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <Typography variant="body2" color="text.secondary">
        Tasks given to you in {team.name} are in your Tasks list too. Complete, postpone, tick steps and add notes there.
      </Typography>
      {mine.length === 0 && (
        <Box sx={(t) => ({ ...cardSx(t), p: 3, textAlign: 'center' })}>
          <Typography color="text.secondary">No tasks from this team yet.</Typography>
        </Box>
      )}
      {mine.map((t) => {
        const Icon = STATUS_ICON[t.status] ?? RadioButtonUnchecked;
        return (
          <ButtonBase key={t.id} onClick={() => onOpenDay(t.date, t.id)}
            sx={(th) => ({ ...cardSx(th), p: 1.25, pl: 1.5, display: 'flex', gap: 1.25, alignItems: 'flex-start', justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: th.tokens.cardHover } })}
          >
            <Icon sx={(th) => ({ mt: 0.25, fontSize: 22, color: t.status === 'done' ? statusColors(th).done : priorityColor(th, t.priority) })} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 15, ...(t.status !== 'pending' && { textDecoration: 'line-through', color: 'text.secondary' }) }}>{t.title}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center', mt: 0.5 }}>
                <Typography variant="body2" color="text.secondary">{shortLabel(t.date, today)}{by(t.assignedBy) ? ` · from ${by(t.assignedBy)}` : ''}</Typography>
                {t.dueAt && <DueChip task={t} />}
              </Box>
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function PersonMenu({ team, member }) {
  const [el, setEl] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const me = myUid();
  const iOwn = team.role === 'owner';
  const canRemove = member.uid !== me && member.role !== 'owner' && (iOwn || member.role === 'member');
  const items = [];
  if (member.uid !== me && member.role === 'member') {
    items.push({ icon: <AdminPanelSettingsRounded fontSize="small" />, label: 'Make admin', run: () => attempt(() => setMemberRole(team.id, member.uid, 'admin'), `${member.name} is now an admin`) });
  }
  if (iOwn && member.role === 'admin') {
    items.push({ icon: <PersonOutlineRounded fontSize="small" />, label: 'Make member', run: () => attempt(() => setMemberRole(team.id, member.uid, 'member'), `${member.name} is now a member`) });
  }
  if (iOwn && member.uid !== me) {
    items.push({
      icon: <StarRounded fontSize="small" />, label: 'Make owner',
      confirm: { title: `Hand ${team.name} over to ${member.name}?`, text: 'They become the owner and you stay on as an admin. Only they can undo this.', action: 'Make owner' },
      run: () => attempt(() => setMemberRole(team.id, member.uid, 'owner'), `${member.name} now owns the team`),
    });
  }
  if (canRemove) {
    items.push({
      icon: <PersonRemoveOutlined fontSize="small" color="error" />, label: 'Remove from team', danger: true,
      confirm: { title: `Remove ${member.name}?`, text: 'Tasks the team gave them stay in their own list, as their own tasks.', action: 'Remove', danger: true },
      run: () => attempt(() => removeMember(team.id, member.uid), `${member.name} was removed`),
    });
  }
  if (!items.length) return <Box sx={{ width: 34 }} />;
  return (
    <>
      <IconButton size="small" aria-label={`Manage ${member.name}`} onClick={(e) => setEl(e.currentTarget)}><MoreVert fontSize="small" /></IconButton>
      <Menu anchorEl={el} open={Boolean(el)} onClose={() => setEl(null)}>
        {items.map((it) => (
          <MenuItem
            key={it.label}
            sx={it.danger ? { color: 'error.main' } : undefined}
            onClick={() => {
              setEl(null);
              if (it.confirm) setConfirm(it);
              else it.run();
            }}
          >
            <ListItemIcon>{it.icon}</ListItemIcon>
            <ListItemText>{it.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      {confirm && (
        <Confirm
          open
          {...confirm.confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}

function People({ team, onInvite, onOpenPerson }) {
  const admin = isTeamAdmin(team);
  const [shareFor, setShareFor] = useState(null);
  const requests = team.requests ?? [];
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1, sm: 1.5 } })}>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1, pb: 0.5 }}>
          <Typography sx={{ fontWeight: 600, flex: 1 }}>{team.members.length} {team.members.length === 1 ? 'person' : 'people'}</Typography>
          {admin && !team.archived && <Button startIcon={<GroupAddRounded />} onClick={onInvite}>Invite</Button>}
        </Box>
        {team.members.map((m) => (
          <Box key={m.uid} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 1 }}>
            <ButtonBase onClick={() => onOpenPerson(m)} sx={(t) => ({ flex: 1, minWidth: 0, display: 'flex', gap: 1.5, alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', borderRadius: 3, '&:hover': { bgcolor: t.tokens.cardHover } })}>
              <PersonAvatar person={m} size={36} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 500 }}>{m.name}{m.uid === myUid() ? ' (you)' : ''}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>{[m.title, m.email].filter(Boolean).join(' · ')}</Typography>
              </Box>
            </ButtonBase>
            <RolePill role={m.role} />
            {admin && !team.archived ? <PersonMenu team={team} member={m} /> : null}
          </Box>
        ))}
      </Box>

      {admin && requests.length > 0 && (
        <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1, sm: 1.5 }, borderColor: hexAlpha(t.palette.primary.main, 0.45) })}>
          <Typography sx={{ fontWeight: 600, px: 1, pb: 0.5 }}>Asking to join · {requests.length}</Typography>
          {requests.map((r) => (
            <Box key={r.uid} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 1, flexWrap: 'wrap' }}>
              <PersonAvatar person={r} size={36} />
              <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 500 }}>{r.name}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>{r.email ?? ''} · used the invite link</Typography>
              </Box>
              <Button size="small" onClick={() => attempt(() => answerJoinRequest(team.id, r.uid, false), 'Request declined')}>Decline</Button>
              <Button size="small" variant="contained" startIcon={<HowToRegOutlined />} onClick={() => attempt(() => answerJoinRequest(team.id, r.uid, true), `${r.name} joined`)}>Let in</Button>
            </Box>
          ))}
        </Box>
      )}

      {admin && team.invites.length > 0 && (
        <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1, sm: 1.5 } })}>
          <Typography sx={{ fontWeight: 600, px: 1, pb: 0.5 }}>Waiting to join · {team.invites.length}</Typography>
          {team.invites.map((i) => (
            <Box key={i.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 1 }}>
              <Box sx={(t) => ({ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: t.tokens.chip, color: 'text.secondary', flexShrink: 0 })}>
                <MailOutlineRounded fontSize="small" />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 14.5 }}>{i.email}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {i.role === 'admin' ? 'As admin' : 'As member'} · invited by {i.invitedByName} · {new Date(i.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </Typography>
              </Box>
              <Button size="small" onClick={() => setShareFor(i)}>Message</Button>
              <Tooltip title="Cancel invite">
                <IconButton size="small" aria-label={`Cancel the invite for ${i.email}`} onClick={() => attempt(() => cancelInvite(team.id, i.id), 'Invite cancelled')}>
                  <DeleteOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Box>
      )}
      <Dialog open={Boolean(shareFor)} onClose={() => setShareFor(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Send {shareFor?.email} the invite</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {shareFor && <ShareInvite team={team} emails={[shareFor.email]} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setShareFor(null)}>Done</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

const ADMIN_TABS = [['overview', 'Overview'], ['tasks', 'Tasks'], ['calendar', 'Calendar'], ['workload', 'Workload'], ['reports', 'Reports'], ['people', 'People'], ['activity', 'Activity'], ['settings', 'Settings']];

function TeamDetail({ team, today, onBack, onOpenDay, wide }) {
  useStoreVersion();
  const admin = isTeamAdmin(team);
  const canGive = !team.archived && (admin || Boolean(team.settings?.membersCanAssign));
  const [tab, setTab] = useState(admin ? 'overview' : 'mine');
  const [menuEl, setMenuEl] = useState(null);
  const [edit, setEdit] = useState(false);
  const [invite, setInvite] = useState(false);
  const [assign, setAssign] = useState(null); // { task?, assignee?, template? }
  const [open, setOpen] = useState(null); // a board task shown in full
  const [person, setPerson] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [boardError, setBoardError] = useState('');
  const board = selectBoard(team.id);
  const { online } = selectSync();
  const given = (board?.tasks ?? []).some((t) => t.assignedBy === myUid() && t.assignee !== myUid());

  useEffect(() => {
    const adminTabs = ADMIN_TABS.map(([v]) => v).filter((v) => v !== 'people');
    if (!admin) setTab((t) => (adminTabs.includes(t) ? 'mine' : t));
    else setTab((t) => (t === 'mine' || t === 'given' ? 'overview' : t));
  }, [admin]);

  useEffect(() => {
    const [from, to] = boardRange(today);
    setBoardError('');
    loadBoard(team.id, from, to).catch((err) => setBoardError(err.status === 0 ? 'offline' : err.message));
  }, [admin, team.id, today]);

  const leave = {
    title: `Leave ${team.name}?`,
    text: 'Tasks the team gave you stay in your list, as your own. An admin can invite you again.',
    action: 'Leave team', danger: true,
    run: () => attempt(() => removeMember(team.id, myUid()), `You left ${team.name}`),
  };
  const del = {
    title: `Delete ${team.name}?`,
    text: 'The team and its invites are deleted for everyone. Tasks it gave out stay in each person’s list, as their own.',
    action: 'Delete team', danger: true,
    run: () => attempt(() => deleteTeam(team.id), `${team.name} was deleted`),
  };
  const needsBoard = ['overview', 'tasks', 'calendar', 'workload', 'reports', 'given'].includes(tab);
  const tabs = admin ? ADMIN_TABS : [['mine', 'My tasks'], ...(given || team.settings?.membersCanAssign ? [['given', 'Given by me']] : []), ['people', 'People']];

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        {!wide && <IconButton aria-label="All teams" onClick={onBack} sx={{ ml: -1 }}><ArrowBack /></IconButton>}
        <TeamAvatar team={team} size={48} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" noWrap sx={{ fontSize: 22, fontWeight: 500 }}>{team.name}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            You are {team.role === 'owner' ? 'the owner' : team.role === 'admin' ? 'an admin' : 'a member'} · {team.members.length} {team.members.length === 1 ? 'person' : 'people'}
            {team.archived ? ' · archived' : ''}
          </Typography>
        </Box>
        {admin && !team.archived && (
          <Tooltip title="Edit team">
            <IconButton aria-label="Edit team" onClick={() => setEdit(true)}><EditOutlined /></IconButton>
          </Tooltip>
        )}
        {admin && wide && !team.archived && <Button variant="outlined" startIcon={<GroupAddRounded />} onClick={() => setInvite(true)}>Invite</Button>}
        <IconButton aria-label="Team options" onClick={(e) => setMenuEl(e.currentTarget)}><MoreVert /></IconButton>
        <Menu anchorEl={menuEl} open={Boolean(menuEl)} onClose={() => setMenuEl(null)}>
          {admin && !team.archived && (
            <MenuItem onClick={() => { setMenuEl(null); setInvite(true); }}>
              <ListItemIcon><GroupAddRounded fontSize="small" /></ListItemIcon><ListItemText>Invite people</ListItemText>
            </MenuItem>
          )}
          {admin && !team.archived && (
            <MenuItem onClick={() => { setMenuEl(null); setEdit(true); }}>
              <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon><ListItemText>Edit team</ListItemText>
            </MenuItem>
          )}
          {admin && (
            <MenuItem onClick={() => { setMenuEl(null); setTab('settings'); }}>
              <ListItemIcon><ArchiveOutlined fontSize="small" /></ListItemIcon><ListItemText>Settings</ListItemText>
            </MenuItem>
          )}
          {admin && <Divider />}
          {team.role !== 'owner' && (
            <MenuItem onClick={() => { setMenuEl(null); setConfirm(leave); }} sx={{ color: 'error.main' }}>
              <ListItemIcon><LogoutRounded fontSize="small" color="error" /></ListItemIcon><ListItemText>Leave team</ListItemText>
            </MenuItem>
          )}
          {team.role === 'owner' && (
            <MenuItem onClick={() => { setMenuEl(null); setConfirm(del); }} sx={{ color: 'error.main' }}>
              <ListItemIcon><DeleteOutlined fontSize="small" color="error" /></ListItemIcon><ListItemText>Delete team</ListItemText>
            </MenuItem>
          )}
        </Menu>
      </Box>

      {!online && (
        <Alert severity="warning" icon={<CloudOffRounded />} sx={{ mb: 2, borderRadius: 3 }}>
          You&apos;re offline. Team changes need a connection; your own tasks still work.
        </Alert>
      )}
      {team.archived && (
        <Alert severity="info" icon={<ArchiveOutlined />} sx={{ mb: 2, borderRadius: 3 }}
          action={team.role === 'owner' ? <Button color="inherit" size="small" onClick={() => setTab('settings')}>Settings</Button> : null}
        >
          This team is archived. You can read everything; nothing new happens in it.
        </Alert>
      )}

      <Tabs value={tabs.some(([v]) => v === tab) ? tab : tabs[0][0]} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, minHeight: 40, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontSize: 15, minWidth: 0, px: 1.75 } }}>
        {tabs.map(([v, l]) => <Tab key={v} value={v} label={v === 'people' && admin && team.requests?.length ? `${l} · ${team.requests.length}` : l} />)}
      </Tabs>

      {needsBoard && !board && (
        boardError
          ? <Alert severity={boardError === 'offline' ? 'warning' : 'error'} sx={{ borderRadius: 3 }}>{boardError === 'offline' ? 'Connect to see your team’s tasks.' : boardError}</Alert>
          : <LinearProgress sx={{ borderRadius: 2 }} />
      )}
      {admin && tab === 'overview' && board && <Overview team={team} board={board} today={today} onOpenTasks={() => setTab('tasks')} />}
      {admin && tab === 'tasks' && board && (
        <Board team={team} board={board} today={today} onAssign={canGive ? (assignee) => setAssign({ assignee }) : null} onOpen={setOpen} onEdit={(task) => setAssign({ task })} />
      )}
      {admin && tab === 'calendar' && board && <TeamCalendar team={team} board={board} today={today} onOpenTask={setOpen} />}
      {admin && tab === 'workload' && board && <Workload team={team} board={board} today={today} onOpenPerson={setPerson} />}
      {admin && tab === 'reports' && board && <Report team={team} board={board} today={today} />}
      {admin && tab === 'activity' && <ActivityLog team={team} />}
      {admin && tab === 'settings' && <TeamSettings team={team} onUseTemplate={(template) => setAssign({ template })} onDelete={() => setConfirm(del)} />}
      {!admin && tab === 'mine' && <MyTeamTasks team={team} today={today} onOpenDay={onOpenDay} />}
      {!admin && tab === 'given' && board && (
        <Board team={team} board={board} today={today} mineOnly onAssign={canGive ? (assignee) => setAssign({ assignee }) : null} onOpen={setOpen} onEdit={(task) => setAssign({ task })} />
      )}
      {tab === 'people' && <People team={team} onInvite={() => setInvite(true)} onOpenPerson={setPerson} />}

      {canGive && (admin ? !['people', 'activity', 'settings'].includes(tab) : tab === 'given') && !wide && board && (
        <Box sx={{ position: 'fixed', right: 16, bottom: 'calc(96px + env(safe-area-inset-bottom))', zIndex: 2 }}>
          <Button variant="contained" size="large" startIcon={<AddTaskRounded />} onClick={() => setAssign({})} sx={{ borderRadius: 4, height: 56, boxShadow: 3 }}>
            Give a task
          </Button>
        </Box>
      )}
      {!admin && canGive && wide && tab === 'mine' && (
        <Button variant="outlined" startIcon={<AddTaskRounded />} onClick={() => setAssign({})} sx={{ mt: 2 }}>Give a task</Button>
      )}

      {edit && <TeamFormDialog open team={team} onClose={() => setEdit(false)} />}
      {invite && <InviteDialog open team={team} onClose={() => setInvite(false)} />}
      {open && <BoardTaskDialog task={open} team={team} today={today} onClose={() => setOpen(null)} onEdit={(task) => { setOpen(null); setAssign({ task }); }} />}
      {person && (
        <PersonDialog team={team} member={team.members.find((m) => m.uid === person.uid) ?? person} board={board} today={today}
          onClose={() => setPerson(null)} onOpenTask={(t) => { setPerson(null); setOpen(t); }}
          onAssign={(uid) => { setPerson(null); setAssign({ assignee: uid }); }}
        />
      )}
      {assign && (
        <AssignDialog open team={team} task={assign.task} defaultAssignee={assign.assignee} template={assign.template} today={today} onClose={() => setAssign(null)}
          onSaved={(_, info) => showToast(assign.task ? 'Task saved' : info?.repeating ? 'Repeating task set up' : info?.count > 1 ? `Task given to ${info.count} people` : 'Task given')}
        />
      )}
      {confirm && (
        <Confirm open {...confirm} onCancel={() => setConfirm(null)} onConfirm={async () => { await confirm.run(); setConfirm(null); }} />
      )}
    </Box>
  );
}

/** Teams: your teams, invites waiting for you, and each team's tasks and people. */
export default function TeamsView({ today, selectedTeam, onSelectTeam, onOpenDay, wide }) {
  useStoreVersion();
  const teams = selectTeams();
  const invites = selectInvites();
  const [creating, setCreating] = useState(false);
  const team = selectedTeam ? selectTeam(selectedTeam) : null;

  useEffect(() => {
    loadTeams().catch(() => {});
  }, []);
  // On a wide screen one team is always open.
  const shown = team ?? (wide ? teams[0] ?? null : null);
  useEffect(() => {
    if (selectedTeam && !team && areTeamsLoaded()) onSelectTeam(null); // left or deleted
  }, [selectedTeam, team, teams.length, onSelectTeam]);

  const sortedInvites = useMemo(() => [...invites].sort((a, b) => b.createdAt - a.createdAt), [invites]);
  const list = (
    <Box sx={{ display: 'grid', gap: 1.25, alignContent: 'start', gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography component="h1" sx={{ flex: 1, fontSize: 26, fontWeight: 500 }}>Teams</Typography>
        <Button variant="contained" startIcon={<GroupsRounded />} onClick={() => setCreating(true)}>New team</Button>
      </Box>
      {sortedInvites.length > 0 && (
        <Typography sx={{ fontWeight: 600, mt: 1 }}>Invites for you</Typography>
      )}
      {sortedInvites.map((i) => <InviteCard key={i.id} invite={i} />)}
      {teams.length > 0 && sortedInvites.length > 0 && <Typography sx={{ fontWeight: 600, mt: 1 }}>Your teams</Typography>}
      {teams.map((t) => <TeamRow key={t.id} team={t} active={shown?.id === t.id} onClick={() => onSelectTeam(t.id)} />)}
      {teams.length === 0 && sortedInvites.length === 0 && (
        <Box sx={(t) => ({ ...cardSx(t), p: 3, display: 'grid', gap: 1.25, justifyItems: 'start' })}>
          <GroupsRounded color="primary" sx={{ fontSize: 40 }} />
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Work together</Typography>
          <Typography color="text.secondary">
            Make a team for your company, invite people by their email, and give them tasks. You see who finished what;
            they see the tasks in their own list, on the web and on Android.
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Invited somewhere? Sign in with the email that was invited and the invite shows up here.
          </Typography>
          <Button variant="outlined" startIcon={<GroupsRounded />} onClick={() => setCreating(true)} sx={{ mt: 0.5 }}>Create a team</Button>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={pageSx}>
      {wide ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 3, alignItems: 'start' }}>
          {list}
          {shown ? <TeamDetail key={shown.id} team={shown} today={today} onBack={() => onSelectTeam(null)} onOpenDay={onOpenDay} wide /> : <Box />}
        </Box>
      ) : shown ? (
        <TeamDetail key={shown.id} team={shown} today={today} onBack={() => onSelectTeam(null)} onOpenDay={onOpenDay} />
      ) : list}
      {creating && <TeamFormDialog open onClose={() => setCreating(false)} onSaved={(t) => onSelectTeam(t.id)} />}
    </Box>
  );
}

