import { useRef, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, TextField, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import Add from '@mui/icons-material/Add';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';
import Check from '@mui/icons-material/Check';
import { TAG_COLORS, tagColor } from '../theme.js';
import { TagAvatar } from './TagChip.jsx';
import { removeTag, saveTag, selectTags, useStoreVersion } from '../lib/store.js';

const LOGO_PX = 96;
const MAX_LOGO_CHARS = 60000;

/** Shrinks any image the browser can read to a small square logo (data URL). */
async function toLogo(file) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
  if (file.size > 10 * 1024 * 1024) throw new Error('Image is larger than 10 MB');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = LOGO_PX;
    canvas.height = LOGO_PX;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(LOGO_PX / img.naturalWidth, LOGO_PX / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (LOGO_PX - w) / 2, (LOGO_PX - h) / 2, w, h);
    let data = canvas.toDataURL('image/webp', 0.9);
    if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/png');
    if (data.length > MAX_LOGO_CHARS) data = canvas.toDataURL('image/jpeg', 0.85);
    if (data.length > MAX_LOGO_CHARS) throw new Error('Logo is too detailed; try a simpler image');
    return data;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Logo')) throw err;
    throw new Error("Couldn't read that image");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function TagForm({ tag, onDone }) {
  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState(tag?.color ?? 'blue');
  const [logo, setLogo] = useState(tag?.logo ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const preview = { name: name || '?', color, logo };

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      setLogo(await toLogo(file));
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await saveTag(tag?.id, { name, color, logo });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={(t) => ({
            width: 72, height: 72, borderRadius: 4, display: 'grid', placeItems: 'center', flexShrink: 0,
            bgcolor: tagColor(t, color).bg, border: `1px solid ${tagColor(t, color).border}`,
          })}
        >
          <TagAvatar tag={preview} size={48} />
        </Box>
        <Box sx={{ display: 'grid', gap: 1, justifyItems: 'start' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddPhotoAlternateOutlined />}
            onClick={() => fileRef.current?.click()}
          >
            {logo ? 'Change logo' : 'Upload logo'}
          </Button>
          {logo && (
            <Button size="small" color="inherit" onClick={() => setLogo(null)} sx={{ color: 'text.secondary' }}>
              Remove logo
            </Button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={pick} />
        </Box>
      </Box>

      <TextField
        label="Name"
        placeholder="e.g. company name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        required
        fullWidth
        slotProps={{ htmlInput: { maxLength: 40 } }}
      />

      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Color</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {Object.entries(TAG_COLORS).map(([key, c]) => (
            <Tooltip key={key} title={c.label}>
              <ButtonBase
                onClick={() => setColor(key)}
                aria-label={c.label}
                aria-pressed={color === key}
                sx={(t) => ({
                  width: 34, height: 34, borderRadius: '50%', bgcolor: tagColor(t, key).main,
                  color: t.palette.mode === 'dark' ? '#000' : '#fff',
                  outline: color === key ? `2px solid ${tagColor(t, key).main}` : 'none',
                  outlineOffset: 3,
                })}
              >
                {color === key && <Check sx={{ fontSize: 20 }} />}
              </ButtonBase>
            </Tooltip>
          ))}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button onClick={onDone} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={busy || !name.trim()} startIcon={busy ? <CircularProgress size={16} /> : null}>
          {tag ? 'Save' : 'Create tag'}
        </Button>
      </Box>
    </Box>
  );
}

export default function TagManager({ open, onClose }) {
  useStoreVersion();
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'));
  const [editing, setEditing] = useState(null); // null | 'new' | tag
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState('');
  const tags = selectTags();

  const close = () => {
    setEditing(null);
    setConfirm(null);
    setError('');
    onClose();
  };

  const doDelete = async (tag) => {
    setError('');
    try {
      await removeTag(tag.id);
      setConfirm(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullScreen={fullScreen} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1.5 }}>
        <Box sx={{ flex: 1 }}>{editing === 'new' ? 'New tag' : editing ? 'Edit tag' : 'Tags'}</Box>
        <IconButton aria-label="Close" onClick={close}><Close /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        {editing ? (
          <TagForm key={editing === 'new' ? 'new' : editing.id} tag={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        ) : (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Use tags for each company or project. Add a logo so you can spot them at a glance.
            </Typography>
            {tags.map((tag) => (
              <Box
                key={tag.id}
                sx={(t) => ({
                  display: 'flex', alignItems: 'center', gap: 1.5, p: 1, pl: 1.5, borderRadius: 3,
                  bgcolor: confirm === tag.id ? tagColor(t, 'red').bg : 'transparent',
                  '&:hover': { bgcolor: confirm === tag.id ? tagColor(t, 'red').bg : t.tokens.surfaceHighest },
                })}
              >
                <TagAvatar tag={tag} size={32} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 500 }}>{tag.name}</Typography>
                  {confirm === tag.id && (
                    <Typography variant="caption" color="error.main">Delete? It is removed from all tasks.</Typography>
                  )}
                </Box>
                <Box sx={(t) => ({ width: 10, height: 10, borderRadius: '50%', bgcolor: tagColor(t, tag.color).main })} />
                {confirm === tag.id ? (
                  <>
                    <Button size="small" onClick={() => setConfirm(null)}>Keep</Button>
                    <Button size="small" color="error" variant="contained" onClick={() => doDelete(tag)}>Delete</Button>
                  </>
                ) : (
                  <>
                    <IconButton aria-label={`Edit ${tag.name}`} onClick={() => setEditing(tag)}><EditOutlined fontSize="small" /></IconButton>
                    <IconButton aria-label={`Delete ${tag.name}`} onClick={() => setConfirm(tag.id)}><DeleteOutlined fontSize="small" /></IconButton>
                  </>
                )}
              </Box>
            ))}
            {error && <Alert severity="error" sx={{ borderRadius: 3, mt: 1 }}>{error}</Alert>}
          </Box>
        )}
      </DialogContent>
      {!editing && (
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="contained" startIcon={<Add />} onClick={() => setEditing('new')} autoFocus>New tag</Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
