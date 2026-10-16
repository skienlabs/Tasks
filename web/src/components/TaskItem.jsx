import { memo, useState } from 'react';
import { Box, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Replay from '@mui/icons-material/Replay';
import Flag from '@mui/icons-material/Flag';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import TodayOutlined from '@mui/icons-material/TodayOutlined';
import NotesRounded from '@mui/icons-material/NotesRounded';
import Check from '@mui/icons-material/Check';
import { PRIORITIES, priorityColor } from '../theme.js';
import { shortLabel } from '../lib/dates.js';
import {
  cancelTask, completeTask, deleteTask, moveTasks, postponeTask, restoreTask, updateTask,
} from '../lib/store.js';

function Meta({ icon, children, color = 'text.secondary' }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color, fontSize: 12.5, whiteSpace: 'nowrap' }}>
      {icon}
      {children}
    </Box>
  );
}

function TaskItem({ task, today, showOrigin, onOpen }) {
  const [menuEl, setMenuEl] = useState(null);
  const pending = task.status === 'pending';
  const done = task.status === 'done';
  const cancelled = task.status === 'cancelled';
  const close = () => setMenuEl(null);
  const act = (fn) => () => {
    close();
    fn();
  };

  return (
    <Box
      role="listitem"
      onClick={() => onOpen(task)}
      sx={(t) => ({
        display: 'flex', alignItems: 'flex-start', gap: 0.5, pl: 0.5, pr: 0.5, py: 0.5,
        borderRadius: 3, cursor: 'pointer', transition: 'background-color 120ms',
        '&:hover': { bgcolor: t.tokens.surfaceHigh },
        '@media (hover: hover)': {
          '& .task-actions': { opacity: menuEl ? 1 : 0 },
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
          <Tooltip title="Postpone to tomorrow">
            <IconButton
              aria-label={`Postpone "${task.title}" to tomorrow`}
              onClick={(e) => {
                e.stopPropagation();
                postponeTask(task.id, today);
              }}
            >
              <EventRepeatOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <IconButton
          aria-label={`More actions for "${task.title}"`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuEl(e.currentTarget);
          }}
        >
          <MoreVert fontSize="small" />
        </IconButton>
      </Box>

      <Menu
        anchorEl={menuEl}
        open={Boolean(menuEl)}
        onClose={close}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        <MenuItem onClick={act(() => onOpen(task))}>
          <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        {!pending && (
          <MenuItem onClick={act(() => restoreTask(task.id))}>
            <ListItemIcon><Replay fontSize="small" /></ListItemIcon>
            <ListItemText>Mark as pending</ListItemText>
          </MenuItem>
        )}
        {pending && task.date !== today && (
          <MenuItem onClick={act(() => moveTasks([task.id], today))}>
            <ListItemIcon><TodayOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Move to today</ListItemText>
          </MenuItem>
        )}
        {pending && (
          <MenuItem onClick={act(() => postponeTask(task.id, today))}>
            <ListItemIcon><EventRepeatOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Postpone to tomorrow</ListItemText>
          </MenuItem>
        )}
        {pending && (
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="caption" color="text.secondary">Priority</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              {PRIORITIES.map((p) => (
                <Tooltip key={p.value} title={p.label}>
                  <IconButton
                    size="small"
                    aria-label={`Priority ${p.label}`}
                    onClick={act(() => updateTask(task.id, { priority: p.value }))}
                    sx={(t) => ({
                      color: priorityColor(t, p.value),
                      bgcolor: task.priority === p.value ? t.tokens.surfaceHigh : 'transparent',
                      outline: task.priority === p.value ? `1px solid ${t.tokens.outline}` : 'none',
                    })}
                  >
                    {p.value === 4 ? <FlagOutlined fontSize="small" /> : <Flag fontSize="small" />}
                  </IconButton>
                </Tooltip>
              ))}
            </Box>
          </Box>
        )}
        <Divider />
        {pending && (
          <MenuItem onClick={act(() => cancelTask(task.id))}>
            <ListItemIcon><BlockOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Cancel task</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={act(() => deleteTask(task.id))} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteOutlined fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}

export default memo(TaskItem);
