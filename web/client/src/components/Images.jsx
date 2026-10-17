import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, ButtonBase, CircularProgress, Dialog, IconButton, Skeleton, Tooltip, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';
import BrokenImageOutlined from '@mui/icons-material/BrokenImageOutlined';
import { useImage } from '../lib/images.js';

export const MAX_IMAGES = 20;

/** One attachment thumbnail (or a local preview URL for an image not uploaded yet). */
export function Thumb({ attachment, previewUrl, size = 64, onClick, label, children }) {
  const remote = useImage(previewUrl ? null : attachment?.id ?? null, 'thumb');
  const url = previewUrl ?? (attachment ? remote.url : null);
  const error = !previewUrl && remote.error;
  return (
    <ButtonBase
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={label ?? 'Open image'}
      sx={(t) => ({
        position: 'relative', width: size, height: size, borderRadius: 2, overflow: 'hidden', flexShrink: 0,
        bgcolor: t.tokens.surfaceHighest, border: `1px solid ${t.palette.divider}`,
      })}
    >
      {url && <Box component="img" src={url} alt="" draggable={false} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      {!url && !error && <Skeleton variant="rectangular" width={size} height={size} />}
      {error && <BrokenImageOutlined sx={{ color: 'text.secondary' }} />}
      {attachment?.uploading && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,0.35)' }}>
          <CircularProgress size={20} sx={{ color: '#fff' }} />
        </Box>
      )}
      {children}
    </ButtonBase>
  );
}

/** Small row of thumbnails on a task card. */
export function ImageStrip({ attachments, onOpen }) {
  const shown = attachments.slice(0, 4);
  const more = attachments.length - shown.length;
  return (
    <Box sx={{ display: 'flex', gap: 0.75, mt: 0.75 }} onClick={(e) => e.stopPropagation()}>
      {shown.map((a, i) => (
        <Thumb key={a.id} attachment={a} size={48} onClick={() => onOpen(i)} label={`Open image ${i + 1} of ${attachments.length}`}>
          {more > 0 && i === shown.length - 1 && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', fontWeight: 600 }}>
              +{more}
            </Box>
          )}
        </Thumb>
      ))}
    </Box>
  );
}

function FullImage({ attachment }) {
  const full = useImage(attachment.id, 'full');
  const thumb = useImage(attachment.id, 'thumb');
  const url = full.url ?? thumb.url;
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
      {url && (
        <Box component="img" src={url} alt="" sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none' }} draggable={false} />
      )}
      {!full.url && !full.error && <CircularProgress sx={{ position: 'absolute', color: '#fff' }} />}
      {full.error && !thumb.url && <Typography sx={{ color: '#fff' }}>Couldn&apos;t load this image</Typography>}
    </Box>
  );
}

/** Full-screen viewer with previous / next (arrow keys or swipe). */
export function ImageViewer({ attachments, index, onClose, onIndex }) {
  const open = index !== null && index >= 0 && index < attachments.length;
  const touch = useRef(null);
  const go = useCallback((d) => {
    if (!open) return;
    onIndex((index + d + attachments.length) % attachments.length);
  }, [open, index, attachments.length, onIndex]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go]);
  if (!open) return null;
  const many = attachments.length > 1;
  return (
    <Dialog open fullScreen onClose={onClose} slotProps={{ paper: { sx: { bgcolor: '#000', backgroundImage: 'none' } } }}>
      <Box
        sx={{ position: 'relative', width: '100%', height: '100%', p: { xs: 0, sm: 4 } }}
        onClick={onClose}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        <Box onClick={(e) => e.stopPropagation()} sx={{ width: '100%', height: '100%' }}>
          <FullImage key={attachments[index].id} attachment={attachments[index]} />
        </Box>
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 12, color: '#fff', bgcolor: 'rgba(255,255,255,0.12)' }}>
          <CloseRounded />
        </IconButton>
        {many && (
          <>
            <IconButton aria-label="Previous image" onClick={(e) => { e.stopPropagation(); go(-1); }} sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#fff', bgcolor: 'rgba(255,255,255,0.12)' }}>
              <ChevronLeft />
            </IconButton>
            <IconButton aria-label="Next image" onClick={(e) => { e.stopPropagation(); go(1); }} sx={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#fff', bgcolor: 'rgba(255,255,255,0.12)' }}>
              <ChevronRight />
            </IconButton>
            <Typography sx={{ position: 'absolute', bottom: 'max(16px, env(safe-area-inset-bottom))', left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
              {index + 1} / {attachments.length}
            </Typography>
          </>
        )}
      </Box>
    </Dialog>
  );
}

/**
 * Image picker for the task form. `items` mixes saved attachments ({ attachment })
 * and new ones not uploaded yet ({ pending: prepared image }).
 */
export function ImagesEditor({ items, onAdd, onRemove, onOpen, busy, error }) {
  const input = useRef(null);
  const full = items.length >= MAX_IMAGES;
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Images{items.length ? ` · ${items.length}` : ''}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {items.map((it, i) => (
          <Box key={it.key} sx={{ position: 'relative' }}>
            <Thumb attachment={it.attachment} previewUrl={it.pending?.previewUrl} size={76} onClick={() => onOpen(i)} />
            <Tooltip title="Remove image">
              <IconButton
                size="small"
                aria-label="Remove image"
                onClick={() => onRemove(it)}
                sx={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, bgcolor: 'background.paper', border: 1, borderColor: 'divider', '&:hover': { bgcolor: 'background.paper' } }}
              >
                <CloseRounded sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
        <ButtonBase
          disabled={full || busy}
          onClick={() => input.current?.click()}
          aria-label="Add images"
          sx={(t) => ({
            width: 76, height: 76, borderRadius: 2, border: `1px dashed ${t.tokens.outline}`, color: 'primary.main',
            display: 'grid', placeItems: 'center', opacity: full ? 0.4 : 1,
          })}
        >
          {busy ? <CircularProgress size={22} /> : <AddPhotoAlternateOutlined />}
        </ButtonBase>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) onAdd(files);
          }}
        />
      </Box>
      {error && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{error}</Typography>}
      {!items.length && !error && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Screenshots, photos of a whiteboard, receipts… You can also paste an image here.
        </Typography>
      )}
    </Box>
  );
}
