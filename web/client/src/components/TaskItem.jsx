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
import { PRIORITIES, hexAlpha, priorityColor, tagColor } from '../theme.js';
import { TagPlates } from './TagChip.jsx';
import TaskMenu, { postponeLabel } from './TaskMenu.jsx';
import { StepsInline, StepsProgress } from './Steps.jsx';
import { ImageStrip, ImageViewer } from './Images.jsx';
import { carriedLabel, isCarried, shortLabel } from '../lib/dates.js';
import { completeTask, postponeTask, restoreTask, selectTaskTags, useStoreVersion } from '../lib/store.js';
import { DueChip, TeamBadge } from './Due.jsx';
import { ReviewChip, TeamTagChips } from './teams/parts.jsx';
import { taskAccess } from '../lib/store.js';

function Meta({ icon, children, color = 'text.secondary' }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color, fontSize: 12.5, whiteSpace: 'nowrap' }}>
      {icon}
      {children}
    </Box>
  );
}

/**
 * The colour that marks a task from an earlier day: red when it's high priority (late and it
 * matters), otherwise its (first) tag's colour, or a neutral one without tags. `border` is soft
 * on purpose: it outlines the card without colouring it.
 */
export function carriedColor(t, tag, high = false) {
  const dark = t.palette.mode === 'dark';
  if (high) return { main: t.palette.error.main, border: hexAlpha(t.palette.error.main, dark ? 0.45 : 0.4) };
  if (tag) {
    const c = tagColor(t, tag.color);
    return { main: c.main, border: hexAlpha(c.main, dark ? 0.4 : 0.38) };
  }
  return { main: t.palette.text.secondary, border: t.tokens.outline };
}

/**
 * "From Tue 20 Oct" on a task that moved here by itself from an earlier day: a quiet, readable
 * pill (neutral background, normal text), with only the clock icon and a dot in the accent colour.
 */
export function CarriedBadge({ task, today, muted, tag }) {
  return (
    <Box
      component="span"
      sx={(t) => {
        const c = carriedColor(t, tag, task.priority === 1);
        const high = task.priority === 1 && !muted;
        return {
          display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 22, pl: 0.75, pr: 1, borderRadius: 999,
          fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          color: high ? c.main : 'text.secondary',
          bgcolor: t.tokens.chip,
          '& svg': { color: muted ? 'text.secondary' : c.main },
        };
      }}
    >
      <HistoryRounded sx={{ fontSize: 14 }} />
      {carriedLabel(task.carriedFrom, today)}
    </Box>
  );
}

/**
 * The task's tags as a slim rounded spine set just inside the card's left edge: one segment per
 * tag (up to four), so it never runs into the card's outline.
 */
function TagSpine({ tags, active }) {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute', left: 9, top: 16, bottom: 16, width: 4,
        display: 'flex', flexDirection: 'column', gap: '3px', pointerEvents: 'none',
        opacity: active ? 1 : 0.35, transition: 'opacity 150ms',
      }}
    >
      {tags.slice(0, 4).map((tag) => (
        <Box key={tag.id} sx={(t) => ({ flex: 1, minHeight: 6, borderRadius: 999, bgcolor: tagColor(t, tag.color).main })} />
      ))}
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
  const tags = selectTaskTags(task); // user's tag order: the first is the company
  const pending = task.status === 'pending';
  const done = task.status === 'done';
  const cancelled = task.status === 'cancelled';
  const carried = isCarried(task);
  const late = pending && (carried || showOrigin); // red outline while it's still open
  const label = postponeLabel(task, today);
  // A team task its admins cancelled stays cancelled for the person it was given to.
  const locked = cancelled && taskAccess(task).restricted;

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
      sx={(t) => {
        const dark = t.palette.mode === 'dark';
        const accent = late ? carriedColor(t, tags[0], task.priority === 1) : null;
        return {
          display: 'flex', alignItems: 'flex-start', gap: 0.5, pl: tags.length ? 1.75 : 0.5, pr: 0.5, py: 0.5,
          borderRadius: '16px', cursor: 'pointer', position: 'relative', outline: 'none',
          transition: 'background-color 120ms, border-color 120ms, box-shadow 120ms',
          border: '1px solid transparent',
          // Open tasks are calm, neutral cards: colour only marks things (the tag spine, a soft
          // outline for work from earlier days, the logo), never the whole card.
          ...(pending && {
            mb: 1,
            bgcolor: t.tokens.card,
            borderColor: accent ? accent.border : t.tokens.cardBorder,
            boxShadow: dark ? 'none' : '0 1px 2px rgba(15,23,42,.04)',
          }),
          ...(selected && {
            bgcolor: t.tokens.cardHover,
            borderColor: t.palette.primary.main,
            boxShadow: `0 0 0 3px ${hexAlpha(t.palette.primary.main, 0.14)}`,
          }),
          '&:hover': {
            bgcolor: t.tokens.cardHover,
            ...(pending && !selected && { borderColor: accent ? accent.main : t.tokens.outline }),
          },
          '&:focus-visible': { borderColor: t.palette.primary.main },
          '@media (hover: hover)': {
            '& .task-actions': { opacity: selected ? 1 : 0 },
            '& .task-actions:has(.menu-open)': { opacity: 1 },
            '&:hover .task-actions, &:focus-within .task-actions': { opacity: 1 },
          },
        };
      }}
    >
      {tags.length > 0 && <TagSpine tags={tags} active={pending} />}
      <Tooltip title={pending ? 'Mark complete' : done ? 'Mark not done' : 'Restore'}>
        <IconButton
          disabled={locked}
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
        {(carried || task.dueAt || task.teamId) && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.6 }}>
            {task.dueAt && <DueChip task={task} />}
            {task.teamId && <TeamBadge task={task} />}
            {task.teamId && <ReviewChip task={task} />}
            {task.teamId && <TeamTagChips task={task} />}
            {carried && <CarriedBadge task={task} today={today} muted={!pending} tag={tags[0]} />}
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

      {tags.length > 0 && (
        <Box sx={{ alignSelf: 'center', py: 1, pl: 1 }}>
          <TagPlates tags={tags} muted={!pending} />
        </Box>
      )}
      {/* Fixed width so tag plates line up whether one or two buttons show. */}
      <Box className="task-actions" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: 80, flexShrink: 0, transition: 'opacity 120ms', pt: 0.25 }}>
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
