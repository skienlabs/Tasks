import { useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, InputBase, ListItemIcon, ListItemText, Menu, MenuItem, Popover, Tooltip } from '@mui/material';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import { TimeLimitField } from './Due.jsx';
import { describeDue, isValidDue } from '../lib/due.js';
import Add from '@mui/icons-material/Add';
import Flag from '@mui/icons-material/Flag';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import Check from '@mui/icons-material/Check';
import SellOutlined from '@mui/icons-material/SellOutlined';
import LabelOffOutlined from '@mui/icons-material/LabelOffOutlined';
import { PRIORITIES, priorityColor } from '../theme.js';
import { createTask, selectTag, useStoreVersion } from '../lib/store.js';
import { TagAvatar } from './TagChip.jsx';
import TagPicker from './TagPicker.jsx';

export default function AddTask({ date, inputRef, defaultTagId, onManageTags }) {
  useStoreVersion();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState(4);
  // Tags stay selected between adds (handy when entering several tasks for one company).
  const [tagIds, setTagIds] = useState(defaultTagId ? [defaultTagId] : []);
  // Every new task gets a tag, or "No tag" chosen on purpose (also kept between adds).
  const [noTag, setNoTag] = useState(false);
  const [tagWarning, setTagWarning] = useState('');
  useEffect(() => {
    setTagIds(defaultTagId ? [defaultTagId] : []);
    setNoTag(false);
  }, [defaultTagId]);
  const [menuEl, setMenuEl] = useState(null);
  const [tagEl, setTagEl] = useState(null);
  const selectedTags = tagIds.map(selectTag).filter(Boolean);
  const [focused, setFocused] = useState(false);
  // Optional time limit for the next task (off unless switched on here).
  const [dueAt, setDueAt] = useState(null);
  const [dueEl, setDueEl] = useState(null);
  const dueOk = dueAt === null || isValidDue(dueAt);
  const text = title.trim();

  const tagAnchor = useRef(null);
  const submit = () => {
    if (!text || !dueOk) return;
    if (!selectedTags.length && !noTag) {
      setTagWarning('Pick a tag for this task, or choose “No tag”.');
      setTagEl(tagAnchor.current);
      return;
    }
    const { saved } = createTask({ title: text, priority, date, tagIds: selectedTags.map((t) => t.id), dueAt });
    const usedPriority = priority;
    setTitle('');
    setPriority(4);
    setDueAt(null);
    // If the save fails, give the text back (unless something new was typed meanwhile).
    saved.then((ok) => {
      if (ok) return;
      setTitle((cur) => (cur ? cur : text));
      setPriority((p) => (p === 4 ? usedPriority : p));
    });
  };

  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      sx={(t) => ({
        display: 'flex', alignItems: 'center', gap: 0.5, pl: 1.5, pr: 0.75, minHeight: 56, borderRadius: 7,
        border: `1px solid ${focused ? t.palette.primary.main : t.tokens.outline}`,
        boxShadow: focused ? `0 0 0 1px ${t.palette.primary.main}` : 'none',
        bgcolor: t.palette.mode === 'dark' ? t.tokens.surfaceHigh : t.tokens.surface,
        transition: 'border-color 120ms, box-shadow 120ms',
      })}
    >
      <Add sx={{ color: 'primary.main' }} />
      <InputBase
        inputRef={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        placeholder="Add a task"
        inputProps={{ maxLength: 500, 'aria-label': 'Add a task', enterKeyHint: 'done' }}
        sx={{ flex: 1, fontSize: 16, ml: 0.5 }}
      />
      <Tooltip title={selectedTags.length ? selectedTags.map((t) => t.name).join(', ') : noTag ? 'No tag' : 'Tags (required)'}>
        <IconButton
          ref={tagAnchor}
          aria-label={selectedTags.length ? 'Set tags' : noTag ? 'Set tags (No tag)' : 'Set tags (required)'}
          onClick={(e) => {
            setTagWarning('');
            setTagEl(e.currentTarget);
          }}
          sx={{ color: selectedTags.length || noTag ? 'primary.main' : 'text.secondary', gap: 0.5 }}
        >
          {selectedTags.length ? (
            <Box sx={{ display: 'flex' }}>
              {selectedTags.slice(0, 3).map((t, i) => (
                <Box key={t.id} sx={{ ml: i ? -0.75 : 0, borderRadius: '50%', boxShadow: (th) => `0 0 0 2px ${th.palette.background.default}` }}>
                  <TagAvatar tag={t} size={22} />
                </Box>
              ))}
            </Box>
          ) : noTag ? <LabelOffOutlined /> : <SellOutlined />}
        </IconButton>
      </Tooltip>
      <Tooltip title={dueAt && dueOk ? `Time limit: ${describeDue(dueAt).full}` : 'Time limit'}>
        <IconButton aria-label="Set a time limit" onClick={(e) => setDueEl(e.currentTarget)} sx={{ color: dueAt ? 'primary.main' : 'text.secondary' }}>
          <TimerOutlined />
        </IconButton>
      </Tooltip>
      <Tooltip title={`Priority: ${PRIORITIES[priority - 1].label}`}>
        <IconButton aria-label="Set priority" onClick={(e) => setMenuEl(e.currentTarget)} sx={(t) => ({ color: priorityColor(t, priority) })}>
          {priority === 4 ? <FlagOutlined /> : <Flag />}
        </IconButton>
      </Tooltip>
      {text && (
        <Button type="submit" variant="contained" sx={{ ml: 0.5 }}>
          Add
        </Button>
      )}
      <Popover
        open={Boolean(dueEl)}
        anchorEl={dueEl}
        onClose={() => {
          setDueEl(null);
          inputRef?.current?.focus();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 2, width: 320, maxWidth: 'calc(100vw - 24px)', mt: 1, borderRadius: 4 } } }}
      >
        <TimeLimitField value={dueAt} onChange={setDueAt} date={date} />
        {dueAt !== null && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => setDueEl(null)} disabled={!dueOk}>Done</Button>
          </Box>
        )}
      </Popover>
      <TagPicker
        anchorEl={tagEl}
        open={Boolean(tagEl)}
        onClose={() => setTagEl(null)}
        selected={tagIds}
        onChange={(ids) => {
          setTagIds(ids);
          if (ids.length) {
            setNoTag(false);
            setTagWarning('');
          }
        }}
        onManage={onManageTags}
        noTag={noTag}
        onNoTag={(v) => {
          setNoTag(v);
          if (v) {
            setTagIds([]);
            setTagWarning('');
            setTimeout(() => inputRef?.current?.focus(), 0);
          }
        }}
        warning={tagWarning}
      />
      <Menu anchorEl={menuEl} open={Boolean(menuEl)} onClose={() => setMenuEl(null)}>
        {PRIORITIES.map((p) => (
          <MenuItem
            key={p.value}
            selected={p.value === priority}
            onClick={() => {
              setPriority(p.value);
              setMenuEl(null);
              inputRef?.current?.focus();
            }}
          >
            <ListItemIcon>
              {p.value === 4 ? <FlagOutlined fontSize="small" /> : <Flag fontSize="small" sx={(t) => ({ color: priorityColor(t, p.value) })} />}
            </ListItemIcon>
            <ListItemText>{p.label}</ListItemText>
            {p.value === priority && <Check fontSize="small" color="primary" sx={{ ml: 2 }} />}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
