import { useState } from 'react';
import { Box, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Replay from '@mui/icons-material/Replay';
import Flag from '@mui/icons-material/Flag';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import TodayOutlined from '@mui/icons-material/TodayOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import { PRIORITIES, priorityColor } from '../theme.js';
import TagPicker from './TagPicker.jsx';
import { shortLabel } from '../lib/dates.js';
import {
  cancelTask, deleteTask, moveTasks, postponeTarget, postponeTask, restoreTask, taskAccess, updateTask,
} from '../lib/store.js';

export function postponeLabel(task, today) {
  const target = shortLabel(postponeTarget(task, today), today);
  return target === 'Tomorrow' ? 'Postpone to tomorrow' : `Postpone to ${target}`;
}

/**
 * The ⋮ button and its menu: Edit (the only way into the task form), tags, priority,
 * move/postpone, cancel and delete. Used on task cards and in the details pane.
 */
export default function TaskMenu({ task, today, onEdit, onManageTags, onDeleted, size = 'medium' }) {
  const [menuEl, setMenuEl] = useState(null);
  const [tagEl, setTagEl] = useState(null);
  const pending = task.status === 'pending';
  const label = postponeLabel(task, today);
  // Team tasks: the person works on it; priority, cancel and delete are for the team's admins.
  const { restricted } = taskAccess(task);
  const close = () => setMenuEl(null);
  const act = (fn) => () => {
    close();
    fn();
  };

  // Clicks inside the menu and the tag picker (portals) must not reach the task card behind them.
  return (
    <Box component="span" sx={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
      <Tooltip title="More actions">
        <IconButton
          size={size}
          aria-label={`More actions for "${task.title}"`}
          aria-haspopup="menu"
          aria-expanded={menuEl ? 'true' : undefined}
          className={menuEl ? 'menu-open' : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setMenuEl(e.currentTarget);
          }}
        >
          <MoreVert fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={menuEl}
        open={Boolean(menuEl)}
        onClose={close}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        <MenuItem onClick={act(() => onEdit(task))}>
          <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            setTagEl(menuEl);
            close();
            e.stopPropagation();
          }}
        >
          <ListItemIcon><SellOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Tags</ListItemText>
        </MenuItem>
        {!pending && !(restricted && task.status === 'cancelled') && (
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
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        )}
        {pending && !restricted && (
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
        {!restricted && <Divider />}
        {pending && !restricted && (
          <MenuItem onClick={act(() => cancelTask(task.id))}>
            <ListItemIcon><BlockOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Cancel task</ListItemText>
          </MenuItem>
        )}
        {!restricted && (
          <MenuItem
            onClick={act(() => {
              deleteTask(task.id);
              onDeleted?.();
            })}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon><DeleteOutlined fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>
      <TagPicker
        anchorEl={tagEl}
        open={Boolean(tagEl)}
        onClose={() => setTagEl(null)}
        selected={task.tagIds ?? []}
        onChange={(ids) => updateTask(task.id, { tagIds: ids })}
        onManage={onManageTags}
      />
    </Box>
  );
}
