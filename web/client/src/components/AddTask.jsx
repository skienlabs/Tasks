import { useEffect, useState } from 'react';
import { Box, Button, IconButton, InputBase, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import Add from '@mui/icons-material/Add';
import Flag from '@mui/icons-material/Flag';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import Check from '@mui/icons-material/Check';
import SellOutlined from '@mui/icons-material/SellOutlined';
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
  useEffect(() => {
    setTagIds(defaultTagId ? [defaultTagId] : []);
  }, [defaultTagId]);
  const [menuEl, setMenuEl] = useState(null);
  const [tagEl, setTagEl] = useState(null);
  const selectedTags = tagIds.map(selectTag).filter(Boolean);
  const [focused, setFocused] = useState(false);
  const text = title.trim();

  const submit = () => {
    if (!text) return;
    createTask({ title: text, priority, date, tagIds: selectedTags.map((t) => t.id) });
    setTitle('');
    setPriority(4);
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
      <Tooltip title={selectedTags.length ? selectedTags.map((t) => t.name).join(', ') : 'Tags'}>
        <IconButton aria-label="Set tags" onClick={(e) => setTagEl(e.currentTarget)} sx={{ color: selectedTags.length ? 'primary.main' : 'text.secondary', gap: 0.5 }}>
          {selectedTags.length ? (
            <Box sx={{ display: 'flex' }}>
              {selectedTags.slice(0, 3).map((t, i) => (
                <Box key={t.id} sx={{ ml: i ? -0.75 : 0, borderRadius: '50%', boxShadow: (th) => `0 0 0 2px ${th.palette.background.default}` }}>
                  <TagAvatar tag={t} size={22} />
                </Box>
              ))}
            </Box>
          ) : <SellOutlined />}
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
      <TagPicker
        anchorEl={tagEl}
        open={Boolean(tagEl)}
        onClose={() => setTagEl(null)}
        selected={tagIds}
        onChange={setTagIds}
        onManage={onManageTags}
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
