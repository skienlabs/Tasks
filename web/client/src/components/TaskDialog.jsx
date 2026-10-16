import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField,
  ToggleButton, ToggleButtonGroup, Typography, useMediaQuery,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import Flag from '@mui/icons-material/Flag';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import { PRIORITIES, priorityColor } from '../theme.js';
import { addDays, isValidKey } from '../lib/dates.js';
import { createTask, deleteTask, getTask, selectTags, updateTask, useStoreVersion } from '../lib/store.js';
import TagChip from './TagChip.jsx';

function Form({ task, defaultDate, defaultTagId, today, onClose, onManageTags, fullScreen }) {
  useStoreVersion();
  const allTags = selectTags();
  const [tagIds, setTagIds] = useState(task?.tagIds ?? (defaultTagId ? [defaultTagId] : []));
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 4);
  const [date, setDate] = useState(task?.date ?? defaultDate);
  const valid = title.trim().length > 0 && isValidKey(date);

  const save = () => {
    if (!valid) return;
    if (task) {
      const current = getTask(task.id);
      if (!current) return onClose();
      const patch = {};
      if (title.replace(/\s+/g, ' ').trim() !== current.title) patch.title = title;
      if (notes.trim() !== current.notes) patch.notes = notes;
      if (priority !== current.priority) patch.priority = priority;
      if (date !== current.date) patch.date = date;
      const nextTags = tagIds.filter((id) => allTags.some((t) => t.id === id)).sort();
      if (nextTags.join() !== (current.tagIds ?? []).join()) patch.tagIds = nextTags;
      if (Object.keys(patch).length) updateTask(task.id, patch);
    } else {
      createTask({ title, notes, priority, date, tagIds });
    }
    onClose();
  };

  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      sx={{ display: 'flex', flexDirection: 'column', height: fullScreen ? '100%' : 'auto' }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1.5 }}>
        <Box sx={{ flex: 1 }}>{task ? 'Edit task' : 'New task'}</Box>
        <IconButton aria-label="Close" onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2.5, alignContent: 'start', pt: '8px !important' }}>
        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={!task}
          required
          fullWidth
          multiline
          maxRows={4}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        <TextField
          label="Details"
          placeholder="Add notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
          multiline
          minRows={3}
          maxRows={10}
          slotProps={{ htmlInput: { maxLength: 5000 } }}
        />
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Priority</Typography>
          <ToggleButtonGroup
            exclusive
            value={priority}
            onChange={(_, v) => v && setPriority(v)}
            size="small"
            sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButtonGroup-grouped': { border: 1, borderColor: 'divider', borderRadius: '999px !important', px: 1.75, ml: '0 !important' } }}
          >
            {PRIORITIES.map((p) => (
              <ToggleButton key={p.value} value={p.value} sx={{ gap: 0.75, textTransform: 'none' }}>
                {p.value === 4
                  ? <FlagOutlined fontSize="small" />
                  : <Flag fontSize="small" sx={(t) => ({ color: priorityColor(t, p.value) })} />}
                {p.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Tags</Typography>
            <Button size="small" onClick={onManageTags}>{allTags.length ? 'Manage' : 'Create tag'}</Button>
          </Box>
          {allTags.length > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {allTags.map((tag) => (
                <TagChip
                  key={tag.id}
                  tag={tag}
                  selected={tagIds.includes(tag.id)}
                  onClick={() => setTagIds((ids) => (ids.includes(tag.id) ? ids.filter((x) => x !== tag.id) : [...ids, tag.id]))}
                />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">Tag tasks by company or project.</Typography>
          )}
        </Box>
        <Box>
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            sx={{ minWidth: 200 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            {[
              ['Today', today],
              ['Tomorrow', addDays(today, 1)],
              ['Next week', addDays(today, 7)],
            ].map(([label, d]) => (
              <Chip
                key={label}
                label={label}
                onClick={() => setDate(d)}
                color={date === d ? 'primary' : 'default'}
                variant={date === d ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, mt: fullScreen ? 'auto' : 0 }}>
        {task && (
          <Button
            color="error"
            onClick={() => {
              deleteTask(task.id);
              onClose();
            }}
            sx={{ mr: 'auto' }}
          >
            Delete
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={!valid}>
          {task ? 'Save' : 'Add task'}
        </Button>
      </DialogActions>
    </Box>
  );
}

export default function TaskDialog({ open, task, defaultDate, defaultTagId, today, onClose, onManageTags }) {
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'));
  // Freeze the props while open so the form doesn't change during the close animation.
  const [session, setSession] = useState({ open: false, key: 0, task: null, date: null });
  if (open && !session.open) {
    setSession({ open: true, key: session.key + 1, task: task ?? null, date: defaultDate, tagId: defaultTagId ?? null });
  }
  if (!open && session.open) setSession({ ...session, open: false });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: fullScreen ? { borderRadius: 0 } : undefined } }}
    >
      {session.key > 0 && (
        <Form
          key={session.key}
          task={session.task}
          defaultDate={session.date}
          defaultTagId={session.tagId}
          today={today}
          onClose={onClose}
          onManageTags={onManageTags}
          fullScreen={fullScreen}
        />
      )}
    </Dialog>
  );
}
