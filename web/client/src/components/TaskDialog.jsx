import { useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField,
  ToggleButton, ToggleButtonGroup, Typography, useMediaQuery,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import LabelOffOutlined from '@mui/icons-material/LabelOffOutlined';
import Flag from '@mui/icons-material/Flag';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import { PRIORITIES, priorityColor } from '../theme.js';
import { MAX_DATE, MIN_DATE, addDays, isValidKey } from '../lib/dates.js';
import {
  MAX_TAGS_PER_TASK, createTask, deleteTask, getTask, memberName, selectTags, showToast, taskAccess, updateTask, useStoreVersion,
} from '../lib/store.js';
import { TimeLimitField } from './Due.jsx';
import { isValidDue } from '../lib/due.js';
import TagChip from './TagChip.jsx';
import { StepsEditor, StepsInline } from './Steps.jsx';
import { ImageViewer, ImagesEditor, MAX_IMAGES } from './Images.jsx';
import { prepareImage } from '../lib/images.js';
import { addAttachment, removeAttachment } from '../lib/store.js';

function Form({ task, defaultDate, defaultTagId, today, onClose, onManageTags, fullScreen }) {
  useStoreVersion();
  const allTags = selectTags();
  const [tagIds, setTagIds] = useState(task?.tagIds ?? (defaultTagId ? [defaultTagId] : []));
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 4);
  // New tasks go on today or later; an existing task may keep the (past) day it's on.
  const [date, setDate] = useState(task?.date ?? (defaultDate < today ? today : defaultDate));
  const earliest = task && task.date < today ? task.date : today;
  const dateOk = isValidKey(date) && (date >= today || (task && date === task.date));
  const [steps, setSteps] = useState(task?.subtasks ?? []);
  const [stepsChanged, setStepsChanged] = useState(false);
  const [dueAt, setDueAt] = useState(task?.dueAt ?? null);
  // A task from a team: you work on it; what it is (title, priority, time limit, steps) is the admins' call.
  const { team, restricted } = taskAccess(task);
  const live = task ? getTask(task.id) ?? task : null; // ticking steps here applies at once
  // Images: saved ones (minus any removed here) plus new ones, uploaded on Save.
  const [removed, setRemoved] = useState(() => new Set());
  const [pending, setPending] = useState([]);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState('');
  const [viewer, setViewer] = useState(null);
  const saved = (task?.attachments ?? []).filter((a) => !removed.has(a.id) && !a.uploading);
  const imageItems = [
    ...saved.map((a) => ({ key: a.id, attachment: a })),
    ...pending.map((p) => ({ key: p.id, pending: p })),
  ];
  const valid = title.trim().length > 0 && dateOk && (dueAt === null || isValidDue(dueAt));

  const addFiles = async (files) => {
    setImgError('');
    const room = MAX_IMAGES - imageItems.length;
    if (room <= 0) return setImgError(`Up to ${MAX_IMAGES} images per task`);
    setImgBusy(true);
    const out = [];
    for (const f of files.slice(0, room)) {
      try {
        out.push(await prepareImage(f));
      } catch (err) {
        setImgError(err.message);
      }
    }
    if (files.length > room) setImgError(`Up to ${MAX_IMAGES} images per task`);
    setPending((p) => [...p, ...out]);
    setImgBusy(false);
  };
  const removeImage = (it) => {
    if (it.pending) {
      URL.revokeObjectURL(it.pending.previewUrl);
      setPending((p) => p.filter((x) => x.id !== it.pending.id));
    } else {
      setRemoved((r) => new Set([...r, it.attachment.id]));
    }
  };
  const uploadImages = (taskId) => {
    for (const id of removed) removeAttachment(taskId, id);
    for (const img of pending) addAttachment(taskId, img);
  };

  const [tagsChanged, setTagsChanged] = useState(false);
  // A new task needs a tag, or "No tag" chosen on purpose.
  const [noTag, setNoTag] = useState(false);
  const [tagError, setTagError] = useState(false);
  const tagsOk = Boolean(task) || noTag || tagIds.some((id) => allTags.some((t) => t.id === id));
  const tagsRef = useRef(null);

  const save = () => {
    if (!valid) return;
    if (!tagsOk) {
      setTagError(true);
      tagsRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (task) {
      if (!getTask(task.id)) {
        // Deleted (e.g. on another device) while this was open: don't lose the edits.
        const draft = { title, notes, priority, date, tagIds, subtasks: steps, dueAt };
        showToast('This task was deleted, so changes weren’t saved', () => createTask(draft), 'Add as new');
        onClose();
        return;
      }
      // Send only what was edited here, so changes made meanwhile elsewhere aren't overwritten.
      const patch = {};
      if (title.replace(/\s+/g, ' ').trim() !== task.title) patch.title = title;
      if (notes.trim() !== task.notes) patch.notes = notes;
      if (priority !== task.priority) patch.priority = priority;
      if (date !== task.date) patch.date = date;
      if (tagsChanged) patch.tagIds = tagIds;
      if (stepsChanged && JSON.stringify(steps) !== JSON.stringify(task.subtasks ?? [])) patch.subtasks = steps;
      if (dueAt !== (task.dueAt ?? null)) patch.dueAt = dueAt;
      if (restricted) for (const k of ['title', 'priority', 'subtasks', 'dueAt']) delete patch[k];
      if (Object.keys(patch).length) updateTask(task.id, patch);
      uploadImages(task.id);
    } else {
      const { task: created } = createTask({ title, notes, priority, date, tagIds, subtasks: steps, dueAt });
      uploadImages(created.id);
    }
    onClose();
  };

  const toggleTag = (id) => {
    setTagsChanged(true);
    setNoTag(false);
    setTagError(false);
    setTagIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      return ids.length >= MAX_TAGS_PER_TASK ? ids : [...ids, id];
    });
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
      <DialogContent
        sx={{ display: 'grid', gap: 2.5, alignContent: 'start', pt: '8px !important' }}
        onPaste={(e) => {
          const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }}
      >
        {task?.teamId && (
          <Alert severity="info" icon={false} sx={{ borderRadius: 3 }}>
            {team ? <><b>{team.name}</b> · </> : null}
            {restricted
              ? `Given to you${memberName(task.teamId, task.assignedBy) ? ` by ${memberName(task.teamId, task.assignedBy)}` : ''}. You can complete it, postpone it, tick its steps, and add notes, tags and images; its admins change the rest.`
              : 'A team task. As an admin you can change everything; it stays in this person’s list.'}
          </Alert>
        )}
        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={!task}
          disabled={restricted}
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
        {restricted ? (
          (live?.subtasks?.length ?? 0) > 0 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Steps</Typography>
              <StepsInline task={live} disabled={live.status === 'cancelled'} />
            </Box>
          )
        ) : (
          <StepsEditor
            value={steps}
            onChange={(v) => {
              setSteps(v);
              setStepsChanged(true);
            }}
          />
        )}
        <ImagesEditor
          items={imageItems}
          onAdd={addFiles}
          onRemove={removeImage}
          onOpen={(i) => imageItems[i]?.attachment && setViewer(saved.findIndex((a) => a.id === imageItems[i].attachment.id))}
          busy={imgBusy}
          error={imgError}
        />
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Priority</Typography>
          <ToggleButtonGroup
            exclusive
            value={priority}
            onChange={(_, v) => v && setPriority(v)}
            disabled={restricted}
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
        <Box ref={tagsRef}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" color={tagError ? 'error' : 'text.secondary'} sx={{ flex: 1 }}>
              Tags{task ? '' : ' *'}
            </Typography>
            <Button size="small" onClick={onManageTags}>{allTags.length ? 'Manage' : 'Create tag'}</Button>
          </Box>
          {tagError && (
            <Alert severity="warning" sx={{ mb: 1.25, borderRadius: 3 }}>Pick a tag for this task, or choose “No tag”.</Alert>
          )}
          {!task && (
            <Chip
              icon={<LabelOffOutlined />}
              label="No tag"
              onClick={() => {
                setNoTag((v) => !v);
                setTagIds([]);
                setTagsChanged(true);
                setTagError(false);
              }}
              color={noTag ? 'primary' : 'default'}
              variant={noTag ? 'filled' : 'outlined'}
              sx={{ mb: allTags.length ? 1 : 0 }}
            />
          )}
          {allTags.length > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {allTags.map((tag) => (
                <TagChip
                  key={tag.id}
                  tag={tag}
                  selected={tagIds.includes(tag.id)}
                  onClick={() => toggleTag(tag.id)}
                />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: task ? 0 : 1 }}>Tag tasks by company or project.</Typography>
          )}
        </Box>
        <Box>
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            error={!dateOk}
            helperText={!isValidKey(date) ? 'Pick a date' : dateOk ? undefined : 'Pick today or a later day'}
            sx={{ minWidth: 200 }}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: earliest < MIN_DATE ? MIN_DATE : earliest, max: MAX_DATE } }}
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
        <TimeLimitField value={dueAt} onChange={setDueAt} date={date} disabled={restricted} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, mt: fullScreen ? 'auto' : 0 }}>
        {task && !restricted && (
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
        <Button type="submit" variant="contained" disabled={!valid || imgBusy}>
          {task ? 'Save' : 'Add task'}
        </Button>
      </DialogActions>
      <ImageViewer attachments={saved} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
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
