import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  LinearProgress, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import LinkRounded from '@mui/icons-material/LinkRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import ShareRounded from '@mui/icons-material/ShareRounded';
import { tagColor } from '../../theme.js';
import {
  archiveTeam, deleteGroup, deleteRecurring, deleteTeamTag, deleteTemplate, loadRecurring, loadTeamLink, loadTemplates, makeTeamLink,
  saveGroup, saveRecurring, saveTeamTag, saveTemplate, selectTeamList, setTeamSettings, showToast, stopTeamLink, useStoreVersion,
} from '../../lib/store.js';
import { ColorPicker, personName } from './parts.jsx';
import { ruleLabel, RulePicker } from './TeamDialogs.jsx';
import { cardSx } from './Insights.jsx';

function Card({ title, subtitle, action, children }) {
  return (
    <Box sx={(t) => ({ ...cardSx(t), p: { xs: 1.5, sm: 2 } })}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: children ? 1.25 : 0 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
        </Box>
        {action}
      </Box>
      {children}
    </Box>
  );
}

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

// ---- Invite link ---------------------------------------------------------------------------

export function InviteLink({ team }) {
  const [link, setLink] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    loadTeamLink(team.id).then(setLink, () => setLink(null));
  }, [team.id]);
  const make = async () => {
    setBusy(true);
    const l = await attempt(() => makeTeamLink(team.id), link ? 'New link made; the old one no longer works' : null);
    if (l) setLink(l);
    setBusy(false);
  };
  const stop = async () => {
    setBusy(true);
    if (await attempt(() => stopTeamLink(team.id).then(() => true), 'Invite link turned off')) setLink(null);
    setBusy(false);
  };
  const share = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <Card
      title="Invite link"
      subtitle="Anyone with the link can ask to join. You approve each request, so a link that travels too far lets nobody in."
    >
      {link === undefined && <LinearProgress sx={{ borderRadius: 2 }} />}
      {link === null && (
        <Button variant="contained" startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LinkRounded />} disabled={busy || team.archived} onClick={make}>
          Make an invite link
        </Button>
      )}
      {link && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Box component="img" src={link.qr} alt="QR code for the invite link" sx={{ width: 168, height: 168, borderRadius: 2, bgcolor: '#fff', p: 0.5, border: 1, borderColor: 'divider' }} />
          <Box sx={{ flex: '1 1 220px', minWidth: 0, display: 'grid', gap: 1 }}>
            <TextField size="small" value={link.url} fullWidth slotProps={{ htmlInput: { readOnly: true, onFocus: (e) => e.target.select(), 'aria-label': 'Invite link' } }} />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" startIcon={<ContentCopyRounded />} onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                } catch {
                  showToast('Select the link and copy it');
                }
              }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
              {share && (
                <Button size="small" variant="outlined" startIcon={<ShareRounded />} onClick={() => navigator.share({ title: `Join ${team.name} on Tasks`, url: link.url }).catch(() => {})}>Share</Button>
              )}
              <Button size="small" startIcon={<RefreshRounded />} disabled={busy} onClick={make}>New link</Button>
              <Button size="small" color="error" startIcon={<LinkOffRounded />} disabled={busy} onClick={stop}>Turn off</Button>
            </Box>
            <Typography variant="caption" color="text.secondary">People scan the QR code with their phone camera, or open the link. Requests show under People.</Typography>
          </Box>
        </Box>
      )}
    </Card>
  );
}

// ---- Groups ---------------------------------------------------------------------------------

function GroupDialog({ team, group, onClose }) {
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState(group?.color ?? 'blue');
  const [members, setMembers] = useState(group?.members ?? []);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    if (await attempt(() => saveGroup(team.id, { id: group?.id, name: name.trim(), color, members }), group ? 'Group saved' : 'Group made')) onClose();
    setBusy(false);
  };
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{group ? 'Edit group' : 'New group'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        <TextField label="Name" placeholder="e.g. Design, Night shift" value={name} onChange={(e) => setName(e.target.value)} autoFocus slotProps={{ htmlInput: { maxLength: 40 } }} />
        <ColorPicker value={color} onChange={setColor} />
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>People in it</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {team.members.map((m) => {
              const on = members.includes(m.uid);
              return <Chip key={m.uid} label={m.name} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'} onClick={() => setMembers(on ? members.filter((x) => x !== m.uid) : [...members, m.uid])} />;
            })}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !name.trim()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

function Groups({ team }) {
  const [edit, setEdit] = useState(null);
  const groups = team.groups ?? [];
  return (
    <Card
      title="Groups"
      subtitle="Smaller groups inside the team (Design, Sales, Night shift…). Give a task to a whole group at once."
      action={!team.archived && <Button size="small" startIcon={<AddRounded />} onClick={() => setEdit({})}>New group</Button>}
    >
      {groups.length === 0 && <Typography variant="body2" color="text.secondary">No groups yet.</Typography>}
      <Box sx={{ display: 'grid', gap: 0.5 }}>
        {groups.map((g) => (
          <Box key={g.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.5 }}>
            <Box sx={(t) => ({ width: 12, height: 12, borderRadius: '4px', bgcolor: tagColor(t, g.color).main })} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14.5, fontWeight: 500 }} noWrap>{g.name}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>{g.members.length ? g.members.map((u) => personName(team, u).split(' ')[0]).join(', ') : 'Nobody yet'}</Typography>
            </Box>
            {!team.archived && (
              <>
                <IconButton size="small" aria-label={`Edit ${g.name}`} onClick={() => setEdit(g)}><EditOutlined fontSize="small" /></IconButton>
                <IconButton size="small" aria-label={`Delete ${g.name}`} onClick={() => attempt(() => deleteGroup(team.id, g.id), 'Group deleted')}><DeleteOutlined fontSize="small" /></IconButton>
              </>
            )}
          </Box>
        ))}
      </Box>
      {edit && <GroupDialog team={team} group={edit.id ? edit : null} onClose={() => setEdit(null)} />}
    </Card>
  );
}

// ---- Team tags ------------------------------------------------------------------------------

function TeamTags({ team }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [editing, setEditing] = useState(null);
  const tags = team.tags ?? [];
  const add = async () => {
    if (!name.trim()) return;
    if (await attempt(() => saveTeamTag(team.id, { name: name.trim(), color }))) setName('');
  };
  return (
    <Card title="Team tags" subtitle="Tags everyone in the team sees on its tasks (Urgent, Client A…). People keep their own tags too.">
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
        {tags.length === 0 && <Typography variant="body2" color="text.secondary">No team tags yet.</Typography>}
        {tags.map((tag) => (
          <Chip
            key={tag.id}
            label={`# ${tag.name}`}
            onClick={team.archived ? undefined : () => setEditing({ ...tag })}
            onDelete={team.archived ? undefined : () => attempt(() => deleteTeamTag(team.id, tag.id), 'Team tag deleted')}
            sx={(t) => {
              const c = tagColor(t, tag.color);
              return { fontWeight: 600, color: c.main, bgcolor: c.bg, border: `1px solid ${c.border}`, '& .MuiChip-deleteIcon': { color: c.main } };
            }}
          />
        ))}
      </Box>
      {!team.archived && (
        <Box component="form" onSubmit={(e) => { e.preventDefault(); add(); }} sx={{ display: 'grid', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField size="small" label="New team tag" value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} sx={{ flex: 1 }} />
            <Button type="submit" variant="outlined" disabled={!name.trim()}>Add</Button>
          </Box>
          <ColorPicker value={color} onChange={setColor} />
        </Box>
      )}
      {editing && (
        <Dialog open onClose={() => setEditing(null)} fullWidth maxWidth="xs">
          <DialogTitle>Edit team tag</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
            <TextField label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus slotProps={{ htmlInput: { maxLength: 40 } }} />
            <ColorPicker value={editing.color} onChange={(c) => setEditing({ ...editing, color: c })} />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="contained" disabled={!editing.name.trim()} onClick={async () => {
              if (await attempt(() => saveTeamTag(team.id, editing), 'Team tag saved')) setEditing(null);
            }}
            >
              Save
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Card>
  );
}

// ---- Templates and repeating tasks -------------------------------------------------------------

function Templates({ team, onUse }) {
  useStoreVersion();
  const list = selectTeamList('templates', team.id);
  const [renaming, setRenaming] = useState(null);
  useEffect(() => {
    loadTemplates(team.id).catch(() => {});
  }, [team.id]);
  return (
    <Card title="Templates" subtitle="Tasks you give often. Save one from “Give a task” (Save as template), then start from it.">
      {!list && <LinearProgress sx={{ borderRadius: 2 }} />}
      {list?.length === 0 && <Typography variant="body2" color="text.secondary">No templates yet.</Typography>}
      <Box sx={{ display: 'grid', gap: 0.5 }}>
        {list?.map((tp) => (
          <Box key={tp.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14.5, fontWeight: 500 }} noWrap>{tp.name}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {[tp.subtasks?.length ? `${tp.subtasks.length} steps` : null, tp.dueTime ? `by ${tp.dueTime}` : null, tp.needsReview ? 'needs sign-off' : null].filter(Boolean).join(' · ') || tp.title}
              </Typography>
            </Box>
            {!team.archived && <Button size="small" onClick={() => onUse(tp)}>Use</Button>}
            {!team.archived && <IconButton size="small" aria-label={`Rename ${tp.name}`} onClick={() => setRenaming({ ...tp })}><EditOutlined fontSize="small" /></IconButton>}
            {!team.archived && <IconButton size="small" aria-label={`Delete ${tp.name}`} onClick={() => attempt(() => deleteTemplate(team.id, tp.id), 'Template deleted')}><DeleteOutlined fontSize="small" /></IconButton>}
          </Box>
        ))}
      </Box>
      {renaming && (
        <Dialog open onClose={() => setRenaming(null)} fullWidth maxWidth="xs">
          <DialogTitle>Rename template</DialogTitle>
          <DialogContent sx={{ pt: '8px !important' }}>
            <TextField fullWidth label="Name" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} autoFocus slotProps={{ htmlInput: { maxLength: 60 } }} />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button variant="contained" disabled={!renaming.name.trim()} onClick={async () => {
              const { id, name } = renaming;
              const tp = list.find((x) => x.id === id);
              const { name: _n, id: _i, createdBy: _c, updatedAt: _u, ...data } = tp;
              if (await attempt(() => saveTemplate(team.id, { id, name: name.trim(), data }), 'Template renamed')) setRenaming(null);
            }}
            >
              Save
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Card>
  );
}

function Repeating({ team }) {
  useStoreVersion();
  const list = selectTeamList('recurring', team.id);
  const [editing, setEditing] = useState(null);
  useEffect(() => {
    loadRecurring(team.id).catch(() => {});
  }, [team.id]);
  return (
    <Card title="Repeating tasks" subtitle="Given out by themselves on their days. Set one up from “Give a task” → Repeat.">
      {!list && <LinearProgress sx={{ borderRadius: 2 }} />}
      {list?.length === 0 && <Typography variant="body2" color="text.secondary">None yet.</Typography>}
      <Box sx={{ display: 'grid', gap: 0.5 }}>
        {list?.map((r) => (
          <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, opacity: r.active ? 1 : 0.6 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14.5, fontWeight: 500 }} noWrap>{r.title}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {ruleLabel(r.rule)} · {r.assignees.length > 2 ? `${r.assignees.length} people` : r.assignees.map((u) => personName(team, u).split(' ')[0]).join(', ')}
                {r.active ? ` · next ${new Date(`${r.nextDate}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}` : ' · paused'}
              </Typography>
            </Box>
            {!team.archived && (
              <>
                <Tooltip title={r.active ? 'Pause' : 'Resume'}>
                  <IconButton size="small" aria-label={r.active ? `Pause ${r.title}` : `Resume ${r.title}`} onClick={() => attempt(() => saveRecurring(team.id, { id: r.id, active: !r.active }), r.active ? 'Paused' : 'Resumed')}>
                    {r.active ? <PauseRounded fontSize="small" /> : <PlayArrowRounded fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <IconButton size="small" aria-label={`Change when ${r.title} repeats`} onClick={() => setEditing({ id: r.id, rule: r.rule })}><EditOutlined fontSize="small" /></IconButton>
                <IconButton size="small" aria-label={`Stop ${r.title}`} onClick={() => attempt(() => deleteRecurring(team.id, r.id), 'Stopped repeating')}><DeleteOutlined fontSize="small" /></IconButton>
              </>
            )}
          </Box>
        ))}
      </Box>
      {editing && (
        <Dialog open onClose={() => setEditing(null)} fullWidth maxWidth="sm">
          <DialogTitle>When it repeats</DialogTitle>
          <DialogContent sx={{ pt: '8px !important' }}>
            <RulePicker rule={editing.rule} onChange={(rule) => rule && setEditing({ ...editing, rule })} />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="contained" onClick={async () => {
              if (await attempt(() => saveRecurring(team.id, { id: editing.id, rule: editing.rule }), 'Saved')) setEditing(null);
            }}
            >
              Save
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Card>
  );
}

// ---- Settings tab ---------------------------------------------------------------------------

export default function TeamSettings({ team, onUseTemplate, onDelete }) {
  const owner = team.role === 'owner';
  const [confirmArchive, setConfirmArchive] = useState(false);
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {team.archived && (
        <Alert severity="info" sx={{ borderRadius: 3 }}>This team is archived: everything stays readable, but nothing can change until its owner brings it back.</Alert>
      )}
      <Card title="Who can give tasks">
        <FormControlLabel
          control={<Switch checked={Boolean(team.settings?.membersCanAssign)} disabled={team.archived}
            onChange={(e) => attempt(() => setTeamSettings(team.id, { membersCanAssign: e.target.checked }), e.target.checked ? 'Members can give tasks now' : 'Only admins give tasks now')}
          />}
          label={(
            <Box>
              <Typography sx={{ fontSize: 15 }}>Members can give tasks too</Typography>
              <Typography variant="body2" color="text.secondary">
                They can give tasks to anyone in the team and follow the ones they gave. Off: only the owner and admins give tasks.
              </Typography>
            </Box>
          )}
          sx={{ ml: -1, mr: 0, alignItems: 'flex-start', '& .MuiSwitch-root': { mt: -0.5 } }}
        />
      </Card>
      <InviteLink team={team} />
      <Groups team={team} />
      <TeamTags team={team} />
      <Templates team={team} onUse={onUseTemplate} />
      <Repeating team={team} />
      {owner && (
        <Card
          title={team.archived ? 'Bring the team back' : 'Archive the team'}
          subtitle={team.archived ? 'Everyone can work in it again.' : 'For a finished project: it stays readable for everyone, but nothing new happens in it. You can bring it back any time.'}
          action={(
            <Button variant="outlined" startIcon={team.archived ? <UnarchiveOutlined /> : <ArchiveOutlined />}
              onClick={() => (team.archived ? attempt(() => archiveTeam(team.id, false), `${team.name} is back`) : setConfirmArchive(true))}
            >
              {team.archived ? 'Unarchive' : 'Archive'}
            </Button>
          )}
        />
      )}
      {owner && (
        <Card
          title="Delete the team"
          subtitle="Deleted for everyone. Tasks it gave out stay in each person’s list, as their own."
          action={<Button color="error" variant="outlined" startIcon={<DeleteOutlined />} onClick={onDelete}>Delete</Button>}
        />
      )}
      {confirmArchive && (
        <Dialog open onClose={() => setConfirmArchive(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Archive {team.name}?</DialogTitle>
          <DialogContent><Typography color="text.secondary">People keep their tasks. Nobody can give new tasks, comment or invite until you bring it back.</Typography></DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setConfirmArchive(false)}>Cancel</Button>
            <Button variant="contained" onClick={async () => {
              await attempt(() => archiveTeam(team.id, true), `${team.name} archived`);
              setConfirmArchive(false);
            }}
            >
              Archive
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
