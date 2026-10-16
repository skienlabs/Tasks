import { Checkbox, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import SellOutlined from '@mui/icons-material/SellOutlined';
import { TagAvatar } from './TagChip.jsx';
import { selectTags, useStoreVersion } from '../lib/store.js';

/** Multi-select menu of tags. */
export default function TagPicker({ anchorEl, open, onClose, selected, onChange, onManage }) {
  useStoreVersion();
  const tags = selectTags();
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      onClick={(e) => e.stopPropagation()}
      slotProps={{ paper: { sx: { minWidth: 240, maxHeight: 420 } } }}
    >
      {tags.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5, maxWidth: 260 }}>
          No tags yet. Create one per company or project.
        </Typography>
      )}
      {tags.map((tag) => (
        <MenuItem key={tag.id} onClick={() => toggle(tag.id)} dense sx={{ py: 0.5 }}>
          <ListItemIcon sx={{ minWidth: '32px !important' }}>
            <TagAvatar tag={tag} size={20} />
          </ListItemIcon>
          <ListItemText>{tag.name}</ListItemText>
          <Checkbox edge="end" size="small" checked={selected.includes(tag.id)} tabIndex={-1} sx={{ ml: 1 }} />
        </MenuItem>
      ))}
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
