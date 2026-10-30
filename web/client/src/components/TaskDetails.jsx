import { useEffect, useState } from 'react';
import { Box, Button, IconButton, LinearProgress, Tooltip, Typography } from '@mui/material';
import Close from '@mui/icons-material/Close';
import CheckCircle from '@mui/icons-material/CheckCircle';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import Flag from '@mui/icons-material/Flag';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import SellOutlined from '@mui/icons-material/SellOutlined';
import NotesRounded from '@mui/icons-material/NotesRounded';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import Replay from '@mui/icons-material/Replay';
import { PRIORITIES, priorityColor } from '../theme.js';
import TagChip from './TagChip.jsx';
import TaskMenu, { postponeLabel } from './TaskMenu.jsx';
import { CarriedBadge } from './TaskItem.jsx';
import { StepsInline } from './Steps.jsx';
import { ImageViewer, Thumb } from './Images.jsx';
import { formatDate, isCarried, relativeLabel, shortLabel } from '../lib/dates.js';
import { completeTask, memberName, postponeTask, restoreTask, selectTaskTags, selectTeam } from '../lib/store.js';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import { DueChip } from './Due.jsx';
import { progress } from '../lib/subtasks.js';
import TaskTeamPanel, { TaskFiles } from './teams/TaskTeamPanel.jsx';

const STATUS = {
  pending: { label: 'Open', icon: RadioButtonUnchecked },
  done: { label: 'Done', icon: CheckCircle },
  cancelled: { label: 'Cancelled', icon: BlockOutlined },
};

const when = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Row({ icon, label, children }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '28px 92px minmax(0, 1fr)', alignItems: 'start', columnGap: 1, py: 0.75 }}>
      <Box sx={{ color: 'text.secondary', display: 'grid', placeItems: 'center', pt: 0.15 }}>{icon}</Box>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Box sx={{ minWidth: 0, fontSize: 14 }}>{children}</Box>
    </Box>
  );
}

function SectionTitle({ icon, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2.5, mb: 0.75, color: 'text.secondary' }}>
      {icon}
      <Typography sx={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>{children}</Typography>
    </Box>
  );
}

/** Read-only view of a task, with quick actions. Editing stays behind ⋮ → Edit. */
export default function TaskDetails({ task, today, onClose, onEdit, onManageTags, variant = 'pane' }) {
  const [viewer, setViewer] = useState(null);
  useEffect(() => setViewer(null), [task.id]);
  const pending = task.status === 'pending';
  const done = task.status === 'done';
  const status = STATUS[task.status] ?? STATUS.pending;
  const tags = selectTaskTags(task); // user's tag order: the first is the company
  const steps = task.subtasks ?? [];
  const p = progress(steps);
  const images = task.attachments ?? [];
  const carried = isCarried(task);
  const prio = PRIORITIES[(task.priority ?? 4) - 1];
  const StatusIcon = status.icon;

  return (
    <Box
      component="aside"
      aria-label={`Details: ${task.title}`}
      sx={(t) => ({
        ...(variant === 'pane' && {
          position: 'sticky', top: 88, alignSelf: 'start', maxHeight: 'calc(100dvh - 104px)', overflowY: 'auto',
          borderRadius: '24px', bgcolor: t.tokens.surfaceHigh, border: `1px solid ${t.palette.divider}`,
        }),
        p: 2.5, pt: 2,
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
        <Box
          sx={(t) => ({
            display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 28, px: 1.25, borderRadius: 999, fontSize: 13, fontWeight: 600,
            color: done ? t.palette.success.main : pending ? t.palette.primary.main : 'text.secondary',
            bgcolor: t.tokens.surfaceHighest,
          })}
        >
          <StatusIcon sx={{ fontSize: 16 }} />
          {status.label}
        </Box>
        <Box sx={{ flex: 1 }} />
        <TaskMenu task={task} today={today} onEdit={onEdit} onManageTags={onManageTags} onDeleted={onClose} />
        <Tooltip title="Close">
          <IconButton aria-label="Close details" onClick={onClose}><Close fontSize="small" /></IconButton>
        </Tooltip>
      </Box>

      <Typography
        component="h2"
        sx={{
          fontSize: 22, lineHeight: 1.3, fontWeight: 500, wordBreak: 'break-word', textWrap: 'pretty',
          textDecoration: pending ? 'none' : 'line-through', color: pending ? 'text.primary' : 'text.secondary',
        }}
      >
        {task.title}
      </Typography>
      {carried && (
        <Box sx={{ mt: 1 }}>
          <CarriedBadge task={task} today={today} muted={!pending} tag={tags[0]} />
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
        {pending ? (
          <Button variant="contained" startIcon={<TaskAltRounded />} onClick={() => completeTask(task.id)}>Complete</Button>
        ) : (
          <Button variant="contained" startIcon={<Replay />} onClick={() => restoreTask(task.id)}>
            {done ? 'Mark not done' : 'Restore'}
          </Button>
        )}
        {pending && (
          <Button variant="outlined" startIcon={<EventRepeatOutlined />} title={postponeLabel(task, today)} onClick={() => postponeTask(task.id, today)}>
            Postpone
          </Button>
        )}
      </Box>

      <Box sx={(t) => ({ mt: 2, pt: 1, borderTop: `1px solid ${t.palette.divider}` })}>
        <Row icon={<EventOutlined sx={{ fontSize: 18 }} />} label="Date">
          {relativeLabel(task.date, today)}
          <Typography component="span" variant="body2" color="text.secondary"> · {formatDate(task.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Typography>
        </Row>
        <Row
          icon={task.priority < 4
            ? <Flag sx={(t) => ({ fontSize: 18, color: priorityColor(t, task.priority) })} />
            : <FlagOutlined sx={{ fontSize: 18 }} />}
          label="Priority"
        >
          {prio.label}
        </Row>
        {task.dueAt && (
          <Row icon={<TimerOutlined sx={{ fontSize: 18 }} />} label="Time limit">
            <DueChip task={task} size="medium" />
          </Row>
        )}
        {task.teamId && (
          <Row icon={<GroupsRounded sx={{ fontSize: 18 }} />} label="Team">
            {selectTeam(task.teamId)?.name ?? 'Team task'}
            {memberName(task.teamId, task.assignedBy) && (
              <Typography component="span" variant="body2" color="text.secondary"> · given by {memberName(task.teamId, task.assignedBy)}</Typography>
            )}
          </Row>
        )}
        <Row icon={<SellOutlined sx={{ fontSize: 18 }} />} label="Tags">
          {tags.length ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{tags.map((tag) => <TagChip key={tag.id} tag={tag} dense />)}</Box>
          ) : <Typography variant="body2" color="text.secondary">None</Typography>}
        </Row>
        {carried && (
          <Row icon={<HistoryRounded sx={{ fontSize: 18 }} />} label="First due">
            {formatDate(task.carriedFrom, { weekday: 'short', day: 'numeric', month: 'short' })}
            <Typography component="span" variant="body2" color="text.secondary"> · moved to {shortLabel(task.date, today).toLowerCase()} by itself</Typography>
          </Row>
        )}
        {task.postponed > 0 && (
          <Row icon={<EventRepeatOutlined sx={{ fontSize: 18 }} />} label="Postponed">
            {task.postponed === 1 ? 'Once' : `${task.postponed} times`}
            {task.originalDate && task.originalDate !== task.date && (
              <Typography component="span" variant="body2" color="text.secondary"> · first planned for {formatDate(task.originalDate, { day: 'numeric', month: 'short' })}</Typography>
            )}
          </Row>
        )}
        <Row icon={<ScheduleOutlined sx={{ fontSize: 18 }} />} label="Created">{when(task.createdAt)}</Row>
        {done && task.completedAt && (
          <Row icon={<CheckCircle sx={{ fontSize: 18, color: 'success.main' }} />} label="Completed">{when(task.completedAt)}</Row>
        )}
      </Box>

      {task.notes && (
        <>
          <SectionTitle icon={<NotesRounded sx={{ fontSize: 18 }} />}>Details</SectionTitle>
          <Typography sx={{ fontSize: 14.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{task.notes}</Typography>
        </>
      )}

      {steps.length > 0 && (
        <>
          <SectionTitle icon={<ChecklistRounded sx={{ fontSize: 18 }} />}>Steps · {p.done}/{p.total}</SectionTitle>
          <LinearProgress
            variant="determinate"
            value={p.total ? (p.done / p.total) * 100 : 0}
            color={p.done === p.total ? 'success' : 'primary'}
            sx={(t) => ({ height: 6, borderRadius: 3, bgcolor: t.tokens.surfaceHighest, mb: 0.5 })}
          />
          <StepsInline task={task} disabled={task.status === 'cancelled'} />
        </>
      )}

      {images.length > 0 && (
        <>
          <SectionTitle icon={<ImageOutlined sx={{ fontSize: 18 }} />}>Images · {images.length}</SectionTitle>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 1 }}>
            {images.map((a, i) => (
              <Box key={a.id} sx={{ '& > *': { width: '100% !important', height: 'auto !important', aspectRatio: '1' } }}>
                <Thumb attachment={a} size={84} onClick={() => setViewer(i)} label={`Open image ${i + 1} of ${images.length}`} />
              </Box>
            ))}
          </Box>
        </>
      )}

      {task.teamId ? <TaskTeamPanel task={task} /> : <TaskFiles task={task} team={null} canAdd />}

      {viewer !== null && (
        <ImageViewer attachments={images} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      )}
    </Box>
  );
}
