import { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import Flag from '@mui/icons-material/Flag';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import ShareRounded from '@mui/icons-material/ShareRounded';
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined';
import { PRIORITIES, priorityColor } from '../../theme.js';
import { MAX_DATE, addDays, isValidKey } from '../../lib/dates.js';
import { isValidDue } from '../../lib/due.js';
import { androidApp } from '../../lib/config.js';
import { assignTask, createTeam, inviteToTeam, myUid, updateTeam, updateTeamTask } from '../../lib/store.js';
import { StepsEditor } from '../Steps.jsx';
import { TimeLimitField } from '../Due.jsx';
import { ColorPicker, PersonAvatar, ROLE_LABEL, TeamAvatar, inviteMessage, parseEmails } from './parts.jsx';

function Shell({ open, onClose, title, children, actions, busy, onSubmit, maxWidth = 'sm' }) {
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'));
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth={maxWidth}
      slotProps={{ paper: { sx: fullScreen ? { borderRadius: 0 } : undefined } }}
    >
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        sx={{ display: 'flex', flexDirection: 'column', height: fullScreen ? '100%' : 'auto' }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1.5 }}>
          <Box sx={{ flex: 1 }}>{title}</Box>
          <IconButton aria-label="Close" onClick={onClose} disabled={busy}><Close /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, alignContent: 'start', pt: '8px !important' }}>{children}</DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, mt: fullScreen ? 'auto' : 0 }}>{actions}</DialogActions>
      </Box>
    </Dialog>
  );
}

/** New team, or rename / recolour one (`team`). */
export function TeamFormDialog({ open, team, onClose, onSaved }) {
  const [name, setName] = useState(team?.name ?? '');
  const [color, setColor] = useState(team?.color ?? 'blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = name.trim().length > 0;
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = team ? await updateTeam(team.id, { name: name.trim(), color }) : await createTeam(name.trim(), color);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell
      open={open}
      onClose={onClose}
      busy={busy}
      onSubmit={submit}
      maxWidth="xs"
      title={team ? 'Team settings' : 'New team'}
      actions={(
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!ok || busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>
            {team ? 'Save' : 'Create team'}
          </Button>
        </>
      )}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <TeamAvatar team={{ name: name || 'Team', color }} size={48} />
        <Typography color="text.secondary" variant="body2">
          {team ? 'Everyone in the team sees the new name.' : 'A team for your company or crew. You can invite people next.'}
        </Typography>
      </Box>
      <TextField label="Team name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required fullWidth
        placeholder="e.g. Skien Software Lab" slotProps={{ htmlInput: { maxLength: 60 } }}
      />
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Colour</Typography>
        <ColorPicker value={color} onChange={setColor} />
      </Box>
      {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}
    </Shell>
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The invite message with Copy and Share, for sending it on WhatsApp, email, Slack... */
export function ShareInvite({ team, emails }) {
  const [copied, setCopied] = useState(false);
  const text = inviteMessage(team, emails, Boolean(androidApp()));
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <Box>
      <TextField
        label="Message to send them"
        value={text}
        multiline
        fullWidth
        minRows={5}
        slotProps={{ htmlInput: { readOnly: true, onFocus: (e) => e.target.select() } }}
      />
      <Box sx={{ display: 'flex', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          startIcon={<ContentCopyRounded />}
          onClick={async () => setCopied(await copyText(text))}
        >
          {copied ? 'Copied' : 'Copy message'}
        </Button>
        {canShare && (
          <Button variant="outlined" startIcon={<ShareRounded />} onClick={() => navigator.share({ title: `Join ${team.name} on Tasks`, text }).catch(() => {})}>
            Share
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** Invite people by email. The invite waits in the app for them; you share the message yourself. */
export function InviteDialog({ open, team, onClose }) {
  const [text, setText] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { invited, alreadyMembers }
  const { good, bad } = parseEmails(text);
  const submit = async () => {
    if (busy) return;
    if (bad.length) return setError(`Not an email address: ${bad.slice(0, 3).join(', ')}`);
    if (!good.length) return setError('Enter at least one email address');
    setBusy(true);
    setError('');
    try {
      setResult(await inviteToTeam(team.id, good, role));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Shell open={open} onClose={onClose} title="Invites sent" actions={<Button variant="contained" onClick={onClose}>Done</Button>}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <MarkEmailReadOutlined color="primary" sx={{ mt: 0.25 }} />
          <Box>
            {result.invited.length > 0 && (
              <Typography>
                {result.invited.length === 1 ? 'The invite is' : `${result.invited.length} invites are`} waiting in Tasks for{' '}
                <b>{result.invited.join(', ')}</b>. They see it as soon as they sign in with that email.
              </Typography>
            )}
            {result.alreadyMembers.length > 0 && (
              <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
                Already in the team: {result.alreadyMembers.join(', ')}
              </Typography>
            )}
          </Box>
        </Box>
        {result.invited.length > 0 && (
          <>
            <Typography variant="body2" color="text.secondary">
              Tasks doesn&apos;t send emails itself. Send them this message so they know where to go:
            </Typography>
            <ShareInvite team={team} emails={result.invited} />
          </>
        )}
      </Shell>
    );
  }

  return (
    <Shell
      open={open}
      onClose={onClose}
      busy={busy}
      onSubmit={submit}
      title={`Invite to ${team.name}`}
      actions={(
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy || !good.length} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>
            {good.length > 1 ? `Invite ${good.length} people` : 'Invite'}
          </Button>
        </>
      )}
    >
      <TextField
        label="Email addresses"
        placeholder="anna@company.com, raj@gmail.com"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError('');
        }}
        autoFocus
        multiline
        minRows={3}
        fullWidth
        helperText="Separate several with commas or new lines. They join by signing in with this email (Google or email and password)."
      />
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>They join as</Typography>
        <ToggleButtonGroup exclusive size="small" value={role} onChange={(_, v) => v && setRole(v)}
          sx={{ gap: 1, '& .MuiToggleButtonGroup-grouped': { border: 1, borderColor: 'divider', borderRadius: '999px !important', px: 2, ml: '0 !important', textTransform: 'none' } }}
        >
          <ToggleButton value="member">Member</ToggleButton>
          <ToggleButton value="admin">Admin</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {role === 'admin'
            ? 'Admins give out tasks, see everyone’s progress and manage people.'
            : 'Members work on the tasks given to them: complete, postpone, tick steps, add notes and images.'}
        </Typography>
      </Box>
      {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}
    </Shell>
  );
}

/** Give someone a task (`task` to edit one already given). */
export function AssignDialog({ open, team, task, today, defaultAssignee, onClose, onSaved }) {
  const members = team.members;
  const [assignee, setAssignee] = useState(task?.assignee ?? defaultAssignee ?? members.find((m) => m.uid !== myUid())?.uid ?? myUid());
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 4);
  const [date, setDate] = useState(task?.date ?? today);
  const [dueAt, setDueAt] = useState(task?.dueAt ?? null);
  const [steps, setSteps] = useState(task?.subtasks ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dateOk = isValidKey(date) && (date >= today || (task && date === task.date));
  const valid = title.trim() && dateOk && members.some((m) => m.uid === assignee) && (dueAt === null || isValidDue(dueAt));

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      let saved;
      if (task) {
        const patch = {};
        if (assignee !== task.assignee) patch.assignee = assignee;
        if (title.replace(/\s+/g, ' ').trim() !== task.title) patch.title = title;
        if (notes.trim() !== task.notes) patch.notes = notes;
        if (priority !== task.priority) patch.priority = priority;
        if (date !== task.date) patch.date = date;
        if (dueAt !== (task.dueAt ?? null)) patch.dueAt = dueAt;
        if (JSON.stringify(steps) !== JSON.stringify(task.subtasks ?? [])) patch.subtasks = steps;
        saved = Object.keys(patch).length ? await updateTeamTask(team.id, task, patch) : task;
      } else {
        saved = await assignTask(team.id, {
          assignee, title, notes, priority, date, ...(dueAt ? { dueAt } : {}), ...(steps.length ? { subtasks: steps } : {}),
        });
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      open={open}
      onClose={onClose}
      busy={busy}
      onSubmit={submit}
      title={task ? 'Edit team task' : 'Give a task'}
      actions={(
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!valid || busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>
            {task ? 'Save' : 'Give task'}
          </Button>
        </>
      )}
    >
      <TextField
        select
        label="For"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        fullWidth
        helperText={task && assignee !== task.assignee ? 'It moves to their list; your tags on it stay behind.' : 'It shows up in their Tasks, on the day you pick.'}
      >
        {members.map((m) => (
          <MenuItem key={m.uid} value={m.uid}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
              <PersonAvatar person={m} size={26} />
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.name}{m.uid === myUid() ? ' (you)' : ''}
              </Box>
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 'auto', pl: 1 }}>{ROLE_LABEL[m.role]}</Typography>
            </Box>
          </MenuItem>
        ))}
      </TextField>
      <TextField label="Task" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!task} required fullWidth multiline maxRows={4}
        slotProps={{ htmlInput: { maxLength: 500 } }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <TextField label="Details" placeholder="What needs to happen, links, who to ask…" value={notes} onChange={(e) => setNotes(e.target.value)}
        fullWidth multiline minRows={2} maxRows={8} slotProps={{ htmlInput: { maxLength: 5000 } }}
      />
      <StepsEditor value={steps} onChange={setSteps} />
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Priority</Typography>
        <ToggleButtonGroup exclusive value={priority} onChange={(_, v) => v && setPriority(v)} size="small"
          sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButtonGroup-grouped': { border: 1, borderColor: 'divider', borderRadius: '999px !important', px: 1.75, ml: '0 !important' } }}
        >
          {PRIORITIES.map((p) => (
            <ToggleButton key={p.value} value={p.value} sx={{ gap: 0.75, textTransform: 'none' }}>
              {p.value === 4 ? <FlagOutlined fontSize="small" /> : <Flag fontSize="small" sx={(t) => ({ color: priorityColor(t, p.value) })} />}
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TextField
          label="Day"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={!dateOk}
          helperText={dateOk ? ' ' : 'Pick today or a later day'}
          sx={{ minWidth: 200 }}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: task && task.date < today ? task.date : today, max: MAX_DATE } }}
        />
        <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
          {[['Today', today], ['Tomorrow', addDays(today, 1)]].map(([l, d]) => (
            <Button key={l} size="small" variant={date === d ? 'contained' : 'outlined'} onClick={() => setDate(d)}>{l}</Button>
          ))}
        </Box>
      </Box>
      <TimeLimitField value={dueAt} onChange={setDueAt} date={date} />
      {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}
    </Shell>
  );
}
