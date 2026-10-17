// Square crop for a tag logo: drag to move, scroll / pinch / slider to zoom.
// Zooming out past "fill" lets a wide logo fit whole, with see-through edges.
import { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Slider, Typography } from '@mui/material';
import ZoomOutRounded from '@mui/icons-material/ZoomOutRounded';
import ZoomInRounded from '@mui/icons-material/ZoomInRounded';
import FitScreenRounded from '@mui/icons-material/FitScreenRounded';
import CropFreeRounded from '@mui/icons-material/CropFreeRounded';

const VIEW = 280; // on-screen crop square (CSS px)
export const LOGO_PX = 128; // saved logo size
const MAX_LOGO_CHARS = 60000;

function clampOffset(o, scale, iw, ih) {
  // Keep the image covering the square when it is larger than it; centre it otherwise.
  const w = iw * scale;
  const h = ih * scale;
  const cx = w >= VIEW ? Math.min(0, Math.max(VIEW - w, o.x)) : (VIEW - w) / 2;
  const cy = h >= VIEW ? Math.min(0, Math.max(VIEW - h, o.y)) : (VIEW - h) / 2;
  return { x: cx, y: cy };
}

/** Renders the crop to a small data URL (WebP, else PNG, else JPEG) within the server limit. */
function render(img, scale, offset) {
  const canvas = document.createElement('canvas');
  canvas.width = LOGO_PX;
  canvas.height = LOGO_PX;
  const ctx = canvas.getContext('2d');
  const k = LOGO_PX / VIEW;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, offset.x * k, offset.y * k, img.naturalWidth * scale * k, img.naturalHeight * scale * k);
  const webp = canvas.toDataURL('image/webp', 0.9).startsWith('data:image/webp');
  let data = webp ? canvas.toDataURL('image/webp', 0.9) : canvas.toDataURL('image/png');
  if (data.length > MAX_LOGO_CHARS && webp) data = canvas.toDataURL('image/webp', 0.7);
  if (data.length > MAX_LOGO_CHARS) {
    // Last resort JPEG, which has no transparency: put it on white.
    const flat = document.createElement('canvas');
    flat.width = LOGO_PX;
    flat.height = LOGO_PX;
    const f = flat.getContext('2d');
    f.fillStyle = '#fff';
    f.fillRect(0, 0, LOGO_PX, LOGO_PX);
    f.drawImage(canvas, 0, 0);
    data = flat.toDataURL('image/jpeg', 0.85);
  }
  if (data.length > MAX_LOGO_CHARS) throw new Error('Logo is too detailed; try a simpler image');
  return data;
}

/** Loads a picked file into an <img>; rejects files that aren't images or are huge. */
export async function loadImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
  if (file.size > 15 * 1024 * 1024) throw new Error('Image is larger than 15 MB');
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Couldn't read that image");
  }
  // SVGs without a size report 0x0 in some browsers.
  if (img.naturalWidth * img.naturalHeight > 60_000_000) {
    URL.revokeObjectURL(url);
    throw new Error('Image is too large (over 60 megapixels)');
  }
  return { img, url };
}

export default function LogoCropper({ source, onCancel, onDone }) {
  const { img } = source;
  const iw = img.naturalWidth || 512;
  const ih = img.naturalHeight || 512;
  const fit = VIEW / Math.max(iw, ih); // whole image visible
  const fill = VIEW / Math.min(iw, ih); // square fully covered
  const minScale = fit;
  const maxScale = Math.max(fill * 6, fit * 2);
  const [scale, setScale] = useState(fill);
  const [offset, setOffset] = useState(() => clampOffset({ x: (VIEW - iw * fill) / 2, y: (VIEW - ih * fill) / 2 }, fill, iw, ih));
  const [error, setError] = useState('');
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  useEffect(() => () => URL.revokeObjectURL(source.url), [source]);

  /** Zooms around a point in the square (keeps that point under the finger / cursor). */
  const zoomTo = (next, cx = VIEW / 2, cy = VIEW / 2) => {
    const s = Math.min(maxScale, Math.max(minScale, next));
    setOffset((o) => clampOffset({ x: cx - ((cx - o.x) * s) / scale, y: cy - ((cy - o.y) * s) / scale }, s, iw, ih));
    setScale(s);
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = null;
  };
  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const pts = pointers.current;
    if (pts.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }, scale, iw, ih));
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const other = a === prev ? b : a;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0) {
        const rect = e.currentTarget.getBoundingClientRect();
        zoomTo(scale * (after / before), (e.clientX + other.x) / 2 - rect.left, (e.clientY + other.y) / 2 - rect.top);
      }
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e) => pointers.current.delete(e.pointerId);
  const onWheel = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    zoomTo(scale * Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
  };
  const onKey = (e) => {
    const step = 8;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }, scale, iw, ih));
    } else if (e.key === '+' || e.key === '=') zoomTo(scale * 1.1);
    else if (e.key === '-') zoomTo(scale / 1.1);
  };

  const save = () => {
    try {
      onDone(render(img, scale, offset));
    } catch (err) {
      setError(err.message);
    }
  };

  // Slider works on a log scale so zooming feels even.
  const toSlider = (s) => Math.log(s / minScale) / Math.log(maxScale / minScale);
  const fromSlider = (v) => minScale * (maxScale / minScale) ** v;

  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Crop logo</DialogTitle>
      <DialogContent sx={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
        <Box
          tabIndex={0}
          role="application"
          aria-label="Crop area. Drag or use the arrow keys to move, plus and minus to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onKeyDown={onKey}
          sx={(t) => ({
            position: 'relative', width: VIEW, height: VIEW, overflow: 'hidden', touchAction: 'none', cursor: 'grab',
            borderRadius: 3, outline: 'none',
            // Checkerboard shows which parts will be see-through.
            backgroundColor: t.palette.mode === 'dark' ? '#2a2a2e' : '#e8eaed',
            backgroundImage: `conic-gradient(${t.palette.mode === 'dark' ? '#38383d' : '#f6f7f8'} 25%, transparent 0 50%, ${t.palette.mode === 'dark' ? '#38383d' : '#f6f7f8'} 0 75%, transparent 0)`,
            backgroundSize: '20px 20px',
            '&:active': { cursor: 'grabbing' },
            '&:focus-visible': { boxShadow: `0 0 0 3px ${t.palette.primary.main}` },
          })}
        >
          <Box
            component="img"
            src={source.url}
            alt=""
            draggable={false}
            sx={{
              position: 'absolute', left: 0, top: 0, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none',
              width: iw * scale, height: ih * scale, transform: `translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
          {/* How it will look as a tag icon: rounded corners, with a light grid. */}
          <Box
            aria-hidden
            sx={{
              position: 'absolute', inset: 0, borderRadius: '22%', pointerEvents: 'none',
              boxShadow: '0 0 0 400px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(255,255,255,0.9)',
              backgroundImage: 'linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.25) 1px, transparent 1px)',
              backgroundSize: `${VIEW / 3}px ${VIEW / 3}px`, backgroundPosition: '-1px -1px',
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: VIEW }}>
          <IconButton aria-label="Zoom out" onClick={() => zoomTo(scale / 1.2)} size="small"><ZoomOutRounded /></IconButton>
          <Slider
            aria-label="Zoom"
            min={0}
            max={1}
            step={0.001}
            value={toSlider(scale)}
            onChange={(_, v) => zoomTo(fromSlider(v))}
            sx={{ flex: 1 }}
          />
          <IconButton aria-label="Zoom in" onClick={() => zoomTo(scale * 1.2)} size="small"><ZoomInRounded /></IconButton>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<FitScreenRounded />} onClick={() => { setScale(fit); setOffset(clampOffset({ x: 0, y: 0 }, fit, iw, ih)); }}>
            Fit whole image
          </Button>
          <Button size="small" startIcon={<CropFreeRounded />} onClick={() => { setScale(fill); setOffset(clampOffset({ x: (VIEW - iw * fill) / 2, y: (VIEW - ih * fill) / 2 }, fill, iw, ih)); }}>
            Fill
          </Button>
        </Box>
        {error && <Typography color="error" variant="body2">{error}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={save}>Use logo</Button>
      </DialogActions>
    </Dialog>
  );
}
