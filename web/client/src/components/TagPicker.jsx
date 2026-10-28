import { Alert, Checkbox, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import SellOutlined from '@mui/icons-material/SellOutlined';
import LabelOffOutlined from '@mui/icons-material/LabelOffOutlined';
import { TagAvatar } from './TagChip.jsx';
import { MAX_TAGS_PER_TASK, selectTags, useStoreVersion } from '../lib/store.js';

/**
 * Multi-select menu of tags. With `onNoTag` (new tasks) it also offers "No tag", the explicit
 * choice for a task without tags; `warning` explains why it opened by itself.
 */
export default function TagPicker({ anchorEl, open, onClose, selected, onChange, onManage, noTag = false, onNoTag, warning }) {
  useStoreVersion();
  const tags = selectTags();
  const full = selected.length >= MAX_TAGS_PER_TASK;
  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (!full) onChange([...selected, id]);
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      onClick={(e) => e.stopPropagation()}
      slotProps={{ paper: { sx: { minWidth: 240, maxHeight: 420 } } }}
    >
      {warning && (
        <Alert severity="warning" sx={{ mx: 1, mb: 1, py: 0, borderRadius: 2, maxWidth: 300 }}>{warning}</Alert>
      )}
      {onNoTag && (
        <MenuItem
          onClick={() => {
            onNoTag(!noTag);
            if (!noTag) onClose();
          }}
          dense
          sx={{ py: 0.5 }}
        >
          <ListItemIcon sx={{ minWidth: '32px !important' }}><LabelOffOutlined fontSize="small" /></ListItemIcon>
          <ListItemText secondary="Add it without a tag">No tag</ListItemText>
          <Checkbox edge="end" size="small" checked={noTag} tabIndex={-1} sx={{ ml: 1 }} />
        </MenuItem>
      )}
      {onNoTag && (tags.length > 0 || onManage) && <Divider />}
      {tags.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5, maxWidth: 260 }}>
          No tags yet. Create one per company or project.
        </Typography>
      )}
      {tags.map((tag) => (
        <MenuItem key={tag.id} onClick={() => toggle(tag.id)} dense sx={{ py: 0.5 }} disabled={full && !selected.includes(tag.id)}>
          <ListItemIcon sx={{ minWidth: '32px !important' }}>
            <TagAvatar tag={tag} size={20} />
          </ListItemIcon>
          <ListItemText>{tag.name}</ListItemText>
          <Checkbox edge="end" size="small" checked={selected.includes(tag.id)} tabIndex={-1} sx={{ ml: 1 }} />
        </MenuItem>
      ))}
      {full && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: 'block' }}>
          Up to {MAX_TAGS_PER_TASK} tags per task
        </Typography>
      )}
      {onManage && <Divider />}
      {onManage && (
        <MenuItem
          onClick={() => {
            onClose();
            onManage();
          }}
        >
          <ListItemIcon><SellOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>{tags.length ? 'Manage tags' : 'Create a tag'}</ListItemText>
        </MenuItem>
      )}
    </Menu>
  );
}
