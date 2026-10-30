import { useEffect, useRef, useState } from 'react';
import AttachFileRounded from '@mui/icons-material/AttachFileRounded';
import BookmarkAddOutlined from '@mui/icons-material/BookmarkAddOutlined';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';
import LogoCropper, { loadImage } from '../LogoCropper.jsx';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem,
  Switch, TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import Flag from '@mui/icons-material/Flag';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import ShareRounded from '@mui/icons-material/ShareRounded';
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined';
import { PRIORITIES, priorityColor, tagColor } from '../../theme.js';
import { MAX_DATE, addDays, isValidKey } from '../../lib/dates.js';
import { isValidDue } from '../../lib/due.js';
import { androidApp } from '../../lib/config.js';
import {
  MAX_FILE_BYTES, assignTask, assignTasks, createTeam, inviteToTeam, isTeamAdmin, loadTemplates, myUid, saveRecurring, saveTemplate,
  selectTeamList, showToast, updateTeam, updateTeamTask, uploadFile, useStoreVersion,
} from '../../lib/store.js';
import { StepsEditor } from '../Steps.jsx';
import { TimeLimitField } from '../Due.jsx';
import { ColorPicker, PersonAvatar, ROLE_LABEL, TeamAvatar, inviteMessage, parseEmails } from './parts.jsx';

export function Shell({ open, onClose, title, children, actions, busy, onSubmit, maxWidth = 'sm' }) {
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
  const [logo, setLogo] = useState(team?.logo ?? null);
  const [cropping, setCropping] = useState(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = name.trim().length > 0;
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      setCropping(await loadImage(file));
    } catch (err) {
      setError(err.message);
    }
  };
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = team
        ? await updateTeam(team.id, { name: name.trim(), color, ...(logo !== (team.logo ?? null) ? { logo } : {}) })
        : await createTeam(name.trim(), color, logo);
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
      title={team ? 'Edit team' : 'New team'}
      actions={(
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!ok || busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>
            {team ? 'Save' : 'Create team'}
          </Button>
        </>
      )}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <TeamAvatar team={{ name: name || 'Team', color, logo }} size={64} />
        <Box sx={{ display: 'grid', gap: 0.75, justifyItems: 'start', minWidth: 0 }}>
          <Button variant="outlined" size="small" startIcon={<AddPhotoAlternateOutlined />} onClick={() => fileRef.current?.click()}>
            {logo ? 'Change logo' : 'Add a logo'}
          </Button>
          {logo && (
            <Button size="small" color="inherit" onClick={() => setLogo(null)} sx={{ color: 'text.secondary' }}>Remove logo</Button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={pick} />
        </Box>
      </Box>
      {cropping && (
        <LogoCropper source={cropping} onCancel={() => setCropping(null)} onDone={(data) => { setLogo(data); setCropping(null); }} />
      )}
      <Typography color="text.secondary" variant="body2">
        {team ? 'Everyone in the team sees the changes.' : 'A team for your company or crew. You can invite people next.'}
      </Typography>
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pillGroup = { gap: 1, flexWrap: 'wrap', '& .MuiToggleButtonGroup-grouped': { border: 1, borderColor: 'divider', borderRadius: '999px !important', px: 1.5, ml: '0 !important', textTransform: 'none' } };

/** "Every weekday", "Every Mon, Wed", "Monthly on the 15th"… */
export function ruleLabel(rule) {
  if (!rule) return '';
  if (rule.freq === 'daily') return 'Every day';
  if (rule.freq === 'weekdays') return 'Every weekday';
  if (rule.freq === 'weekly') return `Every ${(rule.days ?? []).map((d) => WEEKDAYS[d]).join(', ')}`;
  if (rule.freq === 'monthly') return rule.day >= 29 ? `Monthly on the ${rule.day}th (or the month's last day)` : `Monthly on day ${rule.day}`;
  return '';
}

function PeoplePicker({ team, value, onChange, groupId, onGroup }) {
  const me = myUid();
  const groups = team.groups ?? [];
  const toggle = (uid) => {
    onGroup(null);
    onChange(value.includes(uid) ? value.filter((x) => x !== uid) : [...value, uid]);
  };
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>For</Typography>
      {groups.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
          {groups.map((g) => (
            <Chip
              key={g.id}
              label={`${g.name} · ${g.members.length}`}
              color={groupId === g.id ? 'primary' : 'default'}
              variant={groupId === g.id ? 'filled' : 'outlined'}
              onClick={() => {
                if (groupId === g.id) {
                  onGroup(null);
                  onChange([]);
                } else {
                  onGroup(g.id);
                  onChange(g.members);
                }
              }}
            />
          ))}
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {team.members.map((m) => (
          <Chip
            key={m.uid}
            avatar={<Avatar src={m.photo || undefined} imgProps={{ referrerPolicy: 'no-referrer' }}>{m.name.charAt(0).toUpperCase()}</Avatar>}
            label={`${m.name}${m.uid === me ? ' (you)' : ''}`}
            color={value.includes(m.uid) ? 'primary' : 'default'}
            variant={value.includes(m.uid) ? 'filled' : 'outlined'}
            onClick={() => toggle(m.uid)}
            aria-pressed={value.includes(m.uid)}
          />
        ))}
      </Box>
    </Box>
  );
}

export function TeamTagPicker({ team, value, onChange }) {
  const tags = team.tags ?? [];
  if (!tags.length) return null;
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Team tags</Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {tags.map((tag) => {
          const on = value.includes(tag.id);
          return (
            <Chip
              key={tag.id}
              label={`# ${tag.name}`}
              onClick={() => onChange(on ? value.filter((x) => x !== tag.id) : [...value, tag.id])}
              aria-pressed={on}
              sx={(t) => {
                const c = tagColor(t, tag.color);
                return { fontWeight: 600, color: on ? c.main : 'text.secondary', bgcolor: on ? c.bg : 'transparent', border: `1px solid ${on ? c.border : t.palette.divider}` };
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}

export function RulePicker({ rule, onChange }) {
  const freq = rule?.freq ?? 'never';
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Repeat</Typography>
      <ToggleButtonGroup exclusive size="small" value={freq} sx={pillGroup}
        onChange={(_, v) => {
          if (!v) return;
          if (v === 'never') onChange(null);
          else if (v === 'weekly') onChange({ freq: 'weekly', days: rule?.days ?? [1] });
          else if (v === 'monthly') onChange({ freq: 'monthly', day: rule?.day ?? 1 });
          else onChange({ freq: v });
        }}
      >
        <ToggleButton value="never">Never</ToggleButton>
        <ToggleButton value="daily">Daily</ToggleButton>
        <ToggleButton value="weekdays">Weekdays</ToggleButton>
        <ToggleButton value="weekly">Weekly</ToggleButton>
        <ToggleButton value="monthly">Monthly</ToggleButton>
      </ToggleButtonGroup>
      {freq === 'weekly' && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1.25 }}>
          {WEEKDAYS.map((d, i) => {
            const on = rule.days.includes(i);
            return (
              <Chip key={d} label={d} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                onClick={() => {
                  const days = on ? rule.days.filter((x) => x !== i) : [...rule.days, i].sort();
                  if (days.length) onChange({ ...rule, days });
                }}
              />
            );
          })}
        </Box>
      )}
      {freq === 'monthly' && (
        <TextField select size="small" label="Day of the month" value={rule.day} onChange={(e) => onChange({ ...rule, day: Number(e.target.value) })} sx={{ mt: 1.5, minWidth: 180 }}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
        </TextField>
      )}
    </Box>
  );
}

/** Give someone (or several people, or a group) a task, or set up a repeating one; `task` edits one already given. */
export function AssignDialog({ open, team, task, today, defaultAssignee, template: startTemplate, onClose, onSaved }) {
  const members = team.members;
  const admin = isTeamAdmin(team);
  const [people, setPeople] = useState(() => {
    if (task) return [task.assignee];
    if (defaultAssignee) return [defaultAssignee];
    const other = members.find((m) => m.uid !== myUid());
    return [other?.uid ?? myUid()];
  });
  const [groupId, setGroupId] = useState(null);
  const [mode, setMode] = useState('each');
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 4);
  const [date, setDate] = useState(task?.date ?? today);
  const [dueAt, setDueAt] = useState(task?.dueAt ?? null);
  const [dueTime, setDueTime] = useState('');
  const [steps, setSteps] = useState(task?.subtasks ?? []);
  const [needsReview, setNeedsReview] = useState(task?.needsReview ?? false);
  const [teamTagIds, setTeamTagIds] = useState(task?.teamTagIds ?? []);
  const [rule, setRule] = useState(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const fileRef = useRef(null);
  useStoreVersion();
  const templates = selectTeamList('templates', team.id);
  useEffect(() => {
    if (!task && (admin || team.settings?.membersCanAssign)) loadTemplates(team.id).catch(() => {});
  }, [task, admin, team.id, team.settings?.membersCanAssign]);

  const applyTemplate = (tp) => {
    if (!tp) return;
    setTitle(tp.title ?? '');
    setNotes(tp.notes ?? '');
    setPriority(tp.priority ?? 4);
    setSteps(tp.subtasks ?? []);
    setNeedsReview(Boolean(tp.needsReview));
    setTeamTagIds((tp.teamTagIds ?? []).filter((id) => (team.tags ?? []).some((x) => x.id === id)));
    if (tp.dueTime) {
      setDueTime(tp.dueTime);
      setDueAt(`${date}T${tp.dueTime}`);
    } else setDueAt(null);
  };
  const applied = useRef(false);
  useEffect(() => {
    if (startTemplate && !applied.current) {
      applied.current = true;
      applyTemplate(startTemplate);
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const repeating = !task && rule;
  const dateOk = isValidKey(date) && (date >= today || (task && date === task.date));
  const validPeople = people.length > 0 && people.every((uid) => members.some((m) => m.uid === uid));
  const valid = title.trim() && dateOk && validPeople && (repeating || dueAt === null || isValidDue(dueAt));

  const data = () => ({
    title, notes, priority,
    ...(steps.length ? { subtasks: steps } : {}),
    ...(needsReview ? { needsReview: true } : {}),
    ...(teamTagIds.length ? { teamTagIds } : {}),
  });

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      let saved;
      if (task) {
        const patch = {};
        if (people[0] !== task.assignee) patch.assignee = people[0];
        if (title.replace(/\s+/g, ' ').trim() !== task.title) patch.title = title;
        if (notes.trim() !== task.notes) patch.notes = notes;
        if (priority !== task.priority) patch.priority = priority;
        if (date !== task.date) patch.date = date;
        if (dueAt !== (task.dueAt ?? null)) patch.dueAt = dueAt;
        if (JSON.stringify(steps) !== JSON.stringify(task.subtasks ?? [])) patch.subtasks = steps;
        if (needsReview !== Boolean(task.needsReview)) patch.needsReview = needsReview;
        if (JSON.stringify(teamTagIds) !== JSON.stringify(task.teamTagIds ?? [])) patch.teamTagIds = teamTagIds;
        saved = Object.keys(patch).length ? await updateTeamTask(team.id, task, patch) : task;
      } else if (repeating) {
        await saveRecurring(team.id, {
          data: { ...data(), assignees: people, ...(people.length > 1 ? { mode } : {}), ...(dueTime ? { dueTime } : {}) },
          rule,
        });
        saved = null;
      } else {
        const body = { ...data(), date, ...(dueAt ? { dueAt } : {}) };
        const list = people.length === 1 && !groupId
          ? [await assignTask(team.id, { ...body, assignee: people[0] })]
          : await assignTasks(team.id, { ...body, ...(groupId ? { groupId } : { assignees: people }), mode });
        for (const t of list) {
          for (const f of files) await uploadFile(t, f, { asAdmin: t.assignee !== myUid() }).catch((err) => showToast(err.message));
        }
        saved = list[0];
      }
      onSaved?.(saved, { repeating: Boolean(repeating), count: people.length });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveAsTemplate = async () => {
    if (!title.trim()) return setError('Write the task first');
    setSavingTemplate(true);
    try {
      await saveTemplate(team.id, {
        name: title.trim().slice(0, 60),
        data: { ...data(), ...(dueTime || dueAt ? { dueTime: dueTime || dueAt.slice(11, 16) } : {}) },
      });
      showToast('Saved as a template');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const several = people.length > 1;
  return (
    <Shell
      open={open}
      onClose={onClose}
      busy={busy}
      onSubmit={submit}
      title={task ? 'Edit team task' : 'Give a task'}
      actions={(
        <>
          {!task && admin && (
            <Button onClick={saveAsTemplate} disabled={busy || savingTemplate} aria-label="Save as template" title="Save as template"
              sx={{ mr: 'auto', minWidth: 0, whiteSpace: 'nowrap', '& .label': { display: { xs: 'none', sm: 'inline' } }, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}
              startIcon={<BookmarkAddOutlined />}
            >
              <span className="label">Save as template</span>
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!valid || busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null} sx={{ whiteSpace: 'nowrap' }}>
            {task ? 'Save' : repeating ? 'Start repeating' : several ? `Give to ${people.length} people` : 'Give task'}
          </Button>
        </>
      )}
    >
      {!task && templates?.length > 0 && (
        <TextField select size="small" label="Start from a template" value="" onChange={(e) => applyTemplate(templates.find((x) => x.id === e.target.value))}>
          {templates.map((tp) => <MenuItem key={tp.id} value={tp.id}>{tp.name}</MenuItem>)}
        </TextField>
      )}
      {task ? (
        <TextField
          select
          label="For"
          value={people[0]}
          onChange={(e) => setPeople([e.target.value])}
          fullWidth
          helperText={people[0] !== task.assignee ? 'It moves to their list; your tags on it stay behind.' : 'It shows up in their Tasks, on the day you pick.'}
        >
          {members.map((m) => (
            <MenuItem key={m.uid} value={m.uid}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                <PersonAvatar person={m} size={26} />
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.name}{m.uid === myUid() ? ' (you)' : ''}
                </Box>
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 'auto', pl: 1 }}>{m.title || ROLE_LABEL[m.role]}</Typography>
              </Box>
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <PeoplePicker team={team} value={people} onChange={setPeople} groupId={groupId} onGroup={setGroupId} />
      )}
      {!task && several && (
        <Box>
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} sx={pillGroup}>
            <ToggleButton value="each">Each does their own</ToggleButton>
            <ToggleButton value="first">First one to finish closes it</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {mode === 'each' ? 'Everyone gets their own copy to tick off.' : 'Everyone sees it; when one person finishes, it closes for the others.'}
          </Typography>
        </Box>
      )}
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
      <TeamTagPicker team={team} value={teamTagIds} onChange={setTeamTagIds} />
      {!task && admin && <RulePicker rule={rule} onChange={setRule} />}
      {repeating ? (
        <Box sx={{ display: 'grid', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {ruleLabel(rule)}, starting today. Each one shows up in their Tasks on its day.
          </Typography>
          <TextField label="Finish by (time, optional)" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)}
            sx={{ maxWidth: 220 }} slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }}
          />
        </Box>
      ) : (
        <>
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
        </>
      )}
      <FormControlLabel
        control={<Switch checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />}
        label={(
          <Box>
            <Typography sx={{ fontSize: 15 }}>Needs sign-off</Typography>
            <Typography variant="body2" color="text.secondary">When it&apos;s done, an admin approves it or sends it back</Typography>
          </Box>
        )}
        sx={{ ml: -1, mr: 0 }}
      />
      {!task && !repeating && (
        <Box>
          <Button variant="outlined" size="small" startIcon={<AttachFileRounded />} onClick={() => fileRef.current?.click()}>Attach files</Button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => {
            const list = [...(e.target.files ?? [])];
            e.target.value = '';
            const big = list.find((f) => f.size > MAX_FILE_BYTES);
            if (big) setError(`${big.name} is over 10 MB`);
            setFiles((old) => [...old, ...list.filter((f) => f.size <= MAX_FILE_BYTES && f.size > 0)].slice(0, 20));
          }}
          />
          {files.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
              {files.map((f, i) => (
                <Chip key={`${f.name}-${i}`} size="small" label={f.name} onDelete={() => setFiles((old) => old.filter((_, j) => j !== i))} />
              ))}
            </Box>
          )}
        </Box>
      )}
      {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}
    </Shell>
  );
}
