import { memo, useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import Flag from '@mui/icons-material/Flag';
import TodayOutlined from '@mui/icons-material/TodayOutlined';
import NotesRounded from '@mui/icons-material/NotesRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import Check from '@mui/icons-material/Check';
import { PRIORITIES, priorityColor, tagColor } from '../theme.js';
import TagChip from './TagChip.jsx';
import TaskMenu, { postponeLabel } from './TaskMenu.jsx';
import { StepsInline, StepsProgress } from './Steps.jsx';
import { ImageStrip, ImageViewer } from './Images.jsx';
import { carriedLabel, isCarried, shortLabel } from '../lib/dates.js';
import { completeTask, postponeTask, restoreTask, selectTag, useStoreVersion } from '../lib/store.js';

function Meta({ icon, children, color = 'text.secondary' }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color, fontSize: 12.5, whiteSpace: 'nowrap' }}>
      {icon}
      {children}
    </Box>
  );
}

/** Red pill on a task that moved here by itself from an earlier day. */
export function CarriedBadge({ task, today, muted }) {
  return (
    <Box
      component="span"
      sx={(t) => ({
        display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 22, px: 1, borderRadius: 999,
        fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
        color: muted ? 'text.secondary' : 'error.main',
        bgcolor: muted ? t.tokens.surfaceHighest : t.tokens.carriedBg,
        border: `1px solid ${muted ? 'transparent' : t.tokens.carriedBorder}`,
      })}
    >
      <HistoryRounded sx={{ fontSize: 14 }} />
      {carriedLabel(task.carriedFrom, today)}
    </Box>
  );
}

/**
 * One task card. Clicking it selects it (details pane); editing is only in the ⋮ menu.
 * `showOrigin` marks a task still sitting on an earlier day (a device whose clock was off).
 */
function TaskItem({ task, today, showOrigin, selected, onSelect, onEdit, onManageTags }) {
  useStoreVersion(); // re-render when a tag is renamed or recolored
  const [stepsOpen, setStepsOpen] = useState(false);
  const [viewer, setViewer] = useState(null);
  const steps = task.subtasks ?? [];
  const images = task.attachments ?? [];
  const tags = (task.tagIds ?? []).map(selectTag).filter(Boolean);
  const pending = task.status === 'pending';
  const done = task.status === 'done';
  const cancelled = task.status === 'cancelled';
  const carried = isCarried(task);
  const late = pending && (carried || showOrigin); // red outline while it's still open
  const label = postponeLabel(task, today);

  return (
    <Box
      role="listitem"
      tabIndex={0}
      aria-selected={selected || undefined}
      aria-label={`${task.title}${late ? `, ${carried ? carriedLabel(task.carriedFrom, today).toLowerCase() : 'from an earlier day'}` : ''}`}
      onClick={() => onSelect(task)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onSelect(task);
        }
      }}
      sx={(t) => ({
        display: 'flex', alignItems: 'flex-start', gap: 0.5, pl: 0.5, pr: 0.5, py: 0.5,
        borderRadius: 3, cursor: 'pointer', transition: 'background-color 120ms, border-color 120ms', position: 'relative',
        border: '1px solid transparent', outline: 'none',
        ...(late && { borderColor: t.tokens.carriedBorder, bgcolor: t.tokens.carriedBg, my: 0.75 }),
        ...(selected && {
          bgcolor: late ? t.tokens.carriedBg : t.tokens.surfaceHigh,
          borderColor: late ? 'error.main' : t.palette.primary.main,
        }),
        ...(tags.length && {
          '&::before': {
            content: '""', position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 2,
            bgcolor: tagColor(t, tags[0].color).main, opacity: pending ? 1 : 0.4,
          },
        }),
        '&:hover': { bgcolor: late ? t.tokens.carriedBg : t.tokens.surfaceHigh },
        '&:focus-visible': { borderColor: t.palette.primary.main },
        '@media (hover: hover)': {
          '& .task-actions': { opacity: selected ? 1 : 0 },
          '& .task-actions:has(.menu-open)': { opacity: 1 },
          '&:hover .task-actions, &:focus-within .task-actions': { opacity: 1 },
        },
      })}
    >
      <Tooltip title={pending ? 'Mark complete' : done ? 'Mark not done' : 'Restore'}>
        <IconButton
          aria-label={pending ? `Complete "${task.title}"` : `Restore "${task.title}"`}
          onClick={(e) => {
            e.stopPropagation();
            if (pending) completeTask(task.id);
            else restoreTask(task.id);
          }}
          sx={(t) => ({
            p: 1, color: done ? 'primary.main' : 'text.secondary',
            '&:hover .ring': { bgcolor: `${priorityColor(t, task.priority)}22` },
            '&:hover .ring-check': { opacity: 1 },
          })}
        >
          {pending && (
            <Box
              className="ring"
              sx={(t) => ({
                width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
                border: `2px solid ${priorityColor(t, task.priority)}`,
                transition: 'background-color 120ms',
              })}
            >
              <Check className="ring-check" sx={(t) => ({ fontSize: 15, opacity: 0, color: priorityColor(t, task.priority), transition: 'opacity 120ms' })} />
            </Box>
          )}
          {done && <CheckCircle sx={{ fontSize: 26, m: '-2px' }} />}
          {cancelled && <BlockOutlined sx={{ fontSize: 24, m: '-1px' }} />}
        </IconButton>
      </Tooltip>

      <Box sx={{ flex: 1, minWidth: 0, py: 1.1 }}>
        <Typography
          sx={{
            fontSize: 15, lineHeight: 1.4, wordBreak: 'break-word',
            textDecoration: pending ? 'none' : 'line-through',
            color: pending ? 'text.primary' : 'text.secondary',
            opacity: cancelled ? 0.7 : 1,
          }}
        >
          {task.title}
        </Typography>
        {(tags.length > 0 || carried) && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, mt: 0.6 }}>
            {carried && <CarriedBadge task={task} today={today} muted={!pending} />}
            {tags.map((tag) => (
              <Box key={tag.id} component="span" sx={{ display: 'inline-flex', opacity: pending ? 1 : 0.6 }}>
                <TagChip tag={tag} dense />
              </Box>
            ))}
          </Box>
        )}
        {steps.length > 0 && (
          <Box sx={{ mt: 0.5 }}>
            <StepsProgress steps={steps} open={stepsOpen} onToggle={() => setStepsOpen((o) => !o)} />
            {stepsOpen && <StepsInline task={task} disabled={cancelled} />}
          </Box>
        )}
        {images.length > 0 && <ImageStrip attachments={images} onOpen={setViewer} />}
        {(task.notes || task.priority < 4 || task.postponed > 0 || showOrigin || cancelled) && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.25, mt: 0.4 }}>
            {showOrigin && (
              <Meta color="error.main" icon={<TodayOutlined sx={{ fontSize: 14 }} />}>
                {shortLabel(task.date, today)}
              </Meta>
            )}
            {task.priority < 4 && pending && (
              <Meta icon={<Flag sx={(t) => ({ fontSize: 14, color: priorityColor(t, task.priority) })} />}>
                {PRIORITIES[task.priority - 1].label}
              </Meta>
            )}
            {task.postponed > 0 && pending && (
              <Meta icon={<EventRepeatOutlined sx={{ fontSize: 14 }} />}>
                Postponed{task.postponed > 1 ? ` ×${task.postponed}` : ''}
              </Meta>
            )}
            {cancelled && <Meta>Cancelled</Meta>}
            {task.notes && (
              <Meta icon={<NotesRounded sx={{ fontSize: 14 }} />}>
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: { xs: 180, sm: 360 } }}>
                  {task.notes.split('\n')[0]}
                </Box>
              </Meta>
            )}
          </Box>
        )}
      </Box>

      <Box className="task-actions" sx={{ display: 'flex', alignItems: 'center', transition: 'opacity 120ms', pt: 0.25 }}>
        {pending && (
          <Tooltip title={label}>
            <IconButton
              aria-label={`${label}: "${task.title}"`}
              onClick={(e) => {
                e.stopPropagation();
                postponeTask(task.id, today);
              }}
            >
              <EventRepeatOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <TaskMenu task={task} today={today} onEdit={onEdit} onManageTags={onManageTags} />
      </Box>

      {viewer !== null && (
        <Box onClick={(e) => e.stopPropagation()}>
          <ImageViewer attachments={images} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
        </Box>
      )}
    </Box>
  );
}

export default memo(TaskItem);
