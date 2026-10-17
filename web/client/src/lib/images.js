// Task images: shrink before upload, and load with the sign-in header (an <img src>
// can't send it), keeping object URLs in memory so each image downloads once.
import { useEffect, useState } from 'react';
import { ApiError, authHeaders, newId } from './api.js';

const FULL_PX = 1600;
const THUMB_PX = 400;
const MAX_FULL_CHARS = 6 * 1024 * 1024 * 1.33;

async function decode(file) {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image');
  if (globalThis.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> below */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error("This browser can't open that image (try JPEG or PNG)");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(src, maxPx) {
  const w0 = src.width;
  const h0 = src.height;
  const scale = Math.min(1, maxPx / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // JPEG has no transparency
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return { canvas, w, h };
}

const toDataUrl = (canvas, q) => canvas.toDataURL('image/jpeg', q);

/** Returns { id, image, thumb, width, height, previewUrl } ready for upload. */
export async function prepareImage(file) {
  const src = await decode(file);
  if (src.width * src.height > 60_000_000) throw new Error('That image is too large');
  const full = draw(src, FULL_PX);
  let image = toDataUrl(full.canvas, 0.82);
  if (image.length > MAX_FULL_CHARS) image = toDataUrl(full.canvas, 0.6);
  const small = draw(src, THUMB_PX);
  const thumb = toDataUrl(small.canvas, 0.75);
  src.close?.();
  const blob = await (await fetch(thumb)).blob();
  return { id: newId(), image, thumb, width: full.w, height: full.h, previewUrl: URL.createObjectURL(blob) };
}

const cache = new Map(); // `${id}:${size}` -> Promise<objectURL>

/** Lets a just-uploaded image show from the local copy instead of downloading it again. */
export function seedImage(id, size, url) {
  cache.set(`${id}:${size}`, Promise.resolve(url));
}

export function imageUrl(id, size = 'thumb') {
  const key = `${id}:${size}`;
  if (!cache.has(key)) {
    const p = (async () => {
      let res = await fetch(`/api/attachments/${id}?size=${size}`, { headers: await authHeaders() });
      if (res.status === 401) res = await fetch(`/api/attachments/${id}?size=${size}`, { headers: await authHeaders(true) });
      if (!res.ok) throw new ApiError(res.status, 'Image not available');
      return URL.createObjectURL(await res.blob());
    })();
    p.catch(() => cache.delete(key)); // let a later render retry
    cache.set(key, p);
  }
  return cache.get(key);
}

/** Object URL for an attachment, or null while loading / on error. */
export function useImage(id, size = 'thumb') {
  const [state, setState] = useState({ key: null, url: null, error: false });
  const key = `${id}:${size}`;
  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    imageUrl(id, size).then(
      (url) => alive && setState({ key, url, error: false }),
      () => alive && setState({ key, url: null, error: true }),
    );
    return () => { alive = false; };
  }, [id, size, key]);
  return state.key === key ? state : { key, url: null, error: false };
}

export function clearImages() {
  for (const p of cache.values()) p.then((u) => URL.revokeObjectURL(u), () => {});
  cache.clear();
}
