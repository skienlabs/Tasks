import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, IconButton, TextField, Tooltip, Typography,
} from '@mui/material';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import AttachFileRounded from '@mui/icons-material/AttachFileRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import SendRounded from '@mui/icons-material/SendRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import {
  deleteComment, deleteFile, downloadFile, isTeamAdmin, loadComments, myUid, nudgeTask, postComment, reviewTask,
  selectComments, selectSync, selectTeam, showToast, uploadFile, useStoreVersion,
} from '../../lib/store.js';
import { PersonAvatar, ReviewChip } from './parts.jsx';

const SECTION = { display: 'flex', alignItems: 'center', gap: 1, mt: 2.5, mb: 0.75, color: 'text.secondary' };
const sectionLabel = { fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' };

export const fileSize = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
function FileIcon({ mime }) {
  if (mime === 'application/pdf') return <PictureAsPdfOutlined sx={{ color: 'error.main' }} />;
  if (/sheet|excel|csv/.test(mime)) return <TableChartOutlined sx={{ color: 'success.main' }} />;
  if (/word|document|text/.test(mime)) return <DescriptionOutlined sx={{ color: 'primary.main' }} />;
  return <InsertDriveFileOutlined color="action" />;
}

const ago = (ms) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** May I change this team task as an admin (or as the member who gave it, when the team allows)? */
export function canManageTask(task, team) {
  if (!task?.teamId || !team) return false;
  if (isTeamAdmin(team)) return true;
  return Boolean(team.settings?.membersCanAssign && task.assignedBy === myUid());
}

/** Files on a task: download, remove (yours, or any as an admin), add (yours or as an admin). */
export function TaskFiles({ task, team, canAdd, asAdmin }) {
  const files = task.files ?? [];
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const { online } = selectSync();
  const me = myUid();
  const admin = team && isTeamAdmin(team);
  if (!files.length && !canAdd) return null;
  const pick = async (e) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!list.length) return;
    setBusy(true);
    try {
      for (const f of list) await uploadFile(task, f, { asAdmin });
      showToast(list.length === 1 ? 'File added' : `${list.length} files added`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box>
      <Box sx={SECTION}>
        <AttachFileRounded sx={{ fontSize: 18 }} />
        <Typography sx={sectionLabel}>Files{files.length ? ` · ${files.length}` : ''}</Typography>
        <Box sx={{ flex: 1 }} />
        {canAdd && (
          <Button size="small" startIcon={busy ? <CircularProgress size={14} /> : <AttachFileRounded />} disabled={busy || !online} onClick={() => inputRef.current?.click()}>
            Add file
          </Button>
        )}
        <input ref={inputRef} type="file" multiple hidden onChange={pick} />
      </Box>
      {files.length === 0 && <Typography variant="body2" color="text.secondary">PDFs, documents, sheets… up to 10 MB each.</Typography>}
      <Box sx={{ display: 'grid', gap: 0.75 }}>
        {files.map((f) => (
          <Box key={f.id} sx={(t) => ({ display: 'flex', alignItems: 'center', gap: 1.25, p: 1, pl: 1.25, borderRadius: '12px', bgcolor: t.tokens.surfaceHighest })}>
            <FileIcon mime={f.mime} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 14 }}>{f.name}</Typography>
              <Typography variant="caption" color="text.secondary">{fileSize(f.size)}</Typography>
            </Box>
            <Tooltip title="Download">
              <IconButton size="small" aria-label={`Download ${f.name}`} onClick={() => downloadFile(f).catch((err) => showToast(err.message))}>
                <DownloadRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            {(f.addedBy === me || task.assignee === me || !task.teamId || admin) && (
              <Tooltip title="Remove">
                <IconButton size="small" aria-label={`Remove ${f.name}`} disabled={!online}
                  onClick={() => deleteFile(task, f.id).then(() => showToast('File removed'), (err) => showToast(err.message))}
                >
                  <DeleteOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** The conversation on a team task (shared by everyone who has a copy of it). */
export function Comments({ task, team }) {
  useStoreVersion();
  const thread = selectComments(task.id);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { online } = selectSync();
  const me = myUid();
  const admin = team && isTeamAdmin(team);
  useEffect(() => {
    loadComments(task.id).catch((err) => setError(err.status === 0 ? 'Connect to see the comments.' : err.message));
  }, [task.id]);
  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await postComment(task.id, value);
      setText('');
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };
  const comments = thread?.comments ?? [];
  return (
    <Box>
      <Box sx={SECTION}>
        <ChatBubbleOutlineRounded sx={{ fontSize: 18 }} />
        <Typography sx={sectionLabel}>Comments{comments.length ? ` · ${comments.length}` : ''}</Typography>
      </Box>
      {error && !thread && <Typography variant="body2" color="text.secondary">{error}</Typography>}
      <Box sx={{ display: 'grid', gap: 1.25 }}>
        {comments.map((c) => (
          <Box key={c.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <PersonAvatar person={c} size={28} />
            <Box sx={(t) => ({ flex: 1, minWidth: 0, px: 1.25, py: 0.75, borderRadius: '4px 14px 14px 14px', bgcolor: c.uid === me ? t.tokens.primaryContainer : t.tokens.surfaceHighest })}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }} noWrap>{c.uid === me ? 'You' : c.name}</Typography>
                <Typography variant="caption" color="text.secondary" title={new Date(c.createdAt).toLocaleString()}>{ago(c.createdAt)}</Typography>
                <Box sx={{ flex: 1 }} />
                {(c.uid === me || admin) && (
                  <IconButton size="small" aria-label="Delete comment" sx={{ m: -0.5 }} disabled={!online}
                    onClick={() => deleteComment(task.id, c.id).catch((err) => showToast(err.message))}
                  >
                    <DeleteOutlined sx={{ fontSize: 16 }} />
                  </IconButton>
                )}
              </Box>
              <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
      {!team?.archived && (
        <Box component="form" onSubmit={(e) => { e.preventDefault(); send(); }} sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', mt: 1.25 }}>
          <TextField
            size="small" fullWidth multiline maxRows={5} placeholder={online ? 'Write a comment…' : 'Comments need a connection'}
            value={text} onChange={(e) => setText(e.target.value)} disabled={!online}
            slotProps={{ htmlInput: { maxLength: 2000, 'aria-label': 'Comment' } }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <IconButton type="submit" color="primary" aria-label="Send comment" disabled={!text.trim() || busy || !online}>
            {busy ? <CircularProgress size={20} /> : <SendRounded />}
          </IconButton>
        </Box>
      )}
    </Box>
  );
}

/** Approve / send back (for whoever manages the task), and a reminder for open ones. */
export function ReviewActions({ task, team }) {
  const [note, setNote] = useState('');
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState('');
  if (!canManageTask(task, team) || team.archived) return null;
  const run = async (kind, fn, msg) => {
    setBusy(kind);
    try {
      await fn();
      if (msg) showToast(msg);
      setReturning(false);
      setNote('');
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy('');
    }
  };
  const mine = task.assignee === myUid();
  return (
    <Box sx={{ display: 'grid', gap: 1, mt: 2 }}>
      {task.review === 'waiting' && (
        <Alert severity="warning" icon={<VerifiedRounded />} sx={{ borderRadius: 3 }}>
          Finished and waiting for your review.
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {task.review === 'waiting' && (
          <>
            <Button variant="contained" color="success" startIcon={busy === 'approve' ? <CircularProgress size={16} color="inherit" /> : <VerifiedRounded />}
              disabled={Boolean(busy)} onClick={() => run('approve', () => reviewTask(team.id, task, 'approve'), 'Approved')}
            >
              Approve
            </Button>
            <Button variant="outlined" color="error" startIcon={<UndoRounded />} disabled={Boolean(busy)} onClick={() => setReturning((r) => !r)}>
              Send back
            </Button>
          </>
        )}
        {task.status === 'pending' && !mine && (
          <Button variant="outlined" startIcon={busy === 'nudge' ? <CircularProgress size={16} /> : <NotificationsActiveOutlined />} disabled={Boolean(busy)}
            onClick={() => run('nudge', () => nudgeTask(team.id, task), 'Reminder sent')}
          >
            Remind
          </Button>
        )}
      </Box>
      {returning && (
        <Box sx={{ display: 'grid', gap: 1 }}>
          <TextField label="What needs another look?" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={() => setReturning(false)}>Cancel</Button>
            <Button variant="contained" color="error" disabled={Boolean(busy)} startIcon={busy === 'return' ? <CircularProgress size={16} color="inherit" /> : null}
              onClick={() => run('return', () => reviewTask(team.id, task, 'return', note), 'Sent back')}
            >
              Send back
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** Everything team-related on a task's details: sign-off, files, comments. */
export default function TaskTeamPanel({ task }) {
  useStoreVersion();
  const team = selectTeam(task.teamId);
  if (!task.teamId || !team) return null;
  const manage = canManageTask(task, team);
  return (
    <Box>
      {(task.review || task.needsReview || task.closedBy) && (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <ReviewChip task={task} size="medium" />
          {task.review === 'waiting' && task.assignee === myUid() && !manage && (
            <Typography variant="body2" color="text.secondary">An admin will look at it soon.</Typography>
          )}
        </Box>
      )}
      <ReviewActions task={task} team={team} />
      <TaskFiles task={task} team={team} canAdd={!team.archived && (manage || task.assignee === myUid())} asAdmin={manage && task.assignee !== myUid()} />
      <Comments task={task} team={team} />
    </Box>
  );
}
