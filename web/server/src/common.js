// Shared by the API routes: request schemas, input cleaning and checks.
import { MAX_SUBTASKS, SUBTASK_TITLE_MAX, progress } from './subtasks.js';
import { isValidDate } from './dates.js';
export const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
export const ID = { type: 'string', pattern: '^[A-Za-z0-9_-]{8,64}$' };
export const TITLE = { type: 'string', minLength: 1, maxLength: 500 };
export const NOTES = { type: 'string', maxLength: 5000 };
export const PRIORITY = { type: 'integer', minimum: 1, maximum: 4 };
export const STATUS = { type: 'string', enum: ['pending', 'done', 'cancelled'] };
export const COUNT = { type: 'integer', minimum: 0, maximum: 100000 };
export const TAG_IDS = { type: 'array', maxItems: 10, uniqueItems: true, items: ID };
export const TAG_COLORS = ['blue', 'red', 'green', 'yellow', 'orange', 'purple', 'pink', 'teal', 'indigo', 'brown', 'grey'];
export const TAG_NAME = { type: 'string', minLength: 1, maxLength: 40 };
export const TAG_COLOR = { type: 'string', enum: TAG_COLORS };
// Small raster logo, resized in the browser before upload (~96px). SVG is not accepted.
export const TAG_LOGO = {
  anyOf: [
    { type: 'null' },
    { type: 'string', maxLength: 60000, pattern: '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' },
  ],
};
export const MAX_TAGS = 50;
export const SUBTASKS = {
  type: 'array',
  maxItems: MAX_SUBTASKS,
  items: {
    type: 'object',
    required: ['id', 'title'],
    properties: {
      id: ID,
      parentId: { anyOf: [{ type: 'null' }, ID] },
      title: { type: 'string', minLength: 1, maxLength: SUBTASK_TITLE_MAX },
      done: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};
// Images are resized on the device first (~1600 px JPEG, a few hundred KB).
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_THUMB_BYTES = 300 * 1024;
export const MAX_ATTACHMENTS = 20;
export const IMAGE_DATA_URL = '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$';
export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;
export const TIMESTAMP = { type: 'integer', minimum: 0 };
// A deadline: local date and time on the device ("2026-10-30T17:00"), or null for none.
export const DUE_AT = { anyOf: [{ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$' }, { type: 'null' }] };
export const UID = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' };
export const TEAM_NAME = { type: 'string', minLength: 1, maxLength: 60 };
export const EMAIL = { type: 'string', minLength: 3, maxLength: 254 };
export const MAX_INVITES_AT_ONCE = 50;


export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function assertDate(value, name) {
  if (!isValidDate(value)) throw new HttpError(400, `${name} must be a real date (YYYY-MM-DD)`);
}

export function assertDueAt(value) {
  if (value == null) return;
  const [day, time] = value.split('T');
  const [h, m] = time.split(':').map(Number);
  if (!isValidDate(day) || h > 23 || m > 59) throw new HttpError(400, 'Deadline must be a real date and time');
}

/** True when two step lists differ only in what is ticked off. */
export function sameSteps(a, b) {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id && x.parentId === b[i].parentId && x.title === b[i].title);
}

// Control characters (except tab/newline) and zero-width characters are dropped.
export const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g;

export function cleanLine(value, what) {
  const s = value.toWellFormed().normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  if (!s) throw new HttpError(400, `${what} cannot be empty`);
  return s;
}

export const cleanName = (name) => cleanLine(name, 'Name');
export const cleanTitle = (title) => cleanLine(title, 'Title');
export const cleanNotes = (notes) => notes.toWellFormed().normalize('NFC').replace(INVISIBLE, '').replace(/\r\n?/g, '\n').trim();

/** Logo must really be a PNG, JPEG or WebP image of the type it claims. */
export function assertLogo(logo) {
  if (logo == null) return;
  const [, type, b64] = logo.match(/^data:image\/(png|jpeg|webp);base64,(.*)$/) || [];
  if (!type || b64.length % 4 !== 0) throw new HttpError(400, 'Logo is not a valid image');
  const buf = Buffer.from(b64, 'base64');
  const ok = {
    png: buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    jpeg: buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
    webp: buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP',
  }[type];
  if (!ok) throw new HttpError(400, 'Logo is not a valid image');
}

/** Decodes a data URL and checks the bytes really are that image type. */
export function decodeImage(dataUrl, what, maxBytes) {
  const [, type, b64] = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.*)$/s) || [];
  if (!type || b64.length % 4 !== 0) throw new HttpError(400, `${what} is not a valid image`);
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > maxBytes) throw new HttpError(413, `${what} is too large`);
  const ok = {
    png: buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    jpeg: buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
    webp: buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP',
  }[type];
  if (!ok) throw new HttpError(400, `${what} is not a valid image`);
  return { type, buf };
}

export const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Status for a task with steps. Explicit status in the request wins, except that a
 * task can't be marked done while steps are open. Without one, a change to the
 * steps decides: all done -> done, otherwise pending (a cancelled task stays cancelled).
 */
export function resolveStatus(current, requested, subtasks, subtasksChanged) {
  const p = progress(subtasks);
  if (requested !== undefined) {
    if (requested === 'done' && p.total > 0 && p.done < p.total) {
      const left = p.total - p.done;
      throw new HttpError(409, `Finish the remaining ${left} step${left === 1 ? '' : 's'} first`);
    }
    return requested;
  }
  if (subtasksChanged && p.total > 0 && current !== 'cancelled') return p.done === p.total ? 'done' : 'pending';
  return current;
}
