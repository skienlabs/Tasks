import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { LogController } from 'fastify';
import fastifyStatic from '@fastify/static';
import { createRepo } from './db.js';
import { MAX_SUBTASKS, SUBTASK_TITLE_MAX, normalizeSubtasks, progress } from './subtasks.js';
import { createEvents } from './events.js';
import { hasFilters, parseQuery, searchTasks, suggest } from './search.js';
import { AuthError } from './auth.js';
import { addDays, daysBetween, isValidDate, maxDate } from './dates.js';

const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const ID = { type: 'string', pattern: '^[A-Za-z0-9_-]{8,64}$' };
const TITLE = { type: 'string', minLength: 1, maxLength: 500 };
const NOTES = { type: 'string', maxLength: 5000 };
const PRIORITY = { type: 'integer', minimum: 1, maximum: 4 };
const STATUS = { type: 'string', enum: ['pending', 'done', 'cancelled'] };
const COUNT = { type: 'integer', minimum: 0, maximum: 100000 };
const TAG_IDS = { type: 'array', maxItems: 10, uniqueItems: true, items: ID };
export const TAG_COLORS = ['blue', 'red', 'green', 'yellow', 'orange', 'purple', 'pink', 'teal', 'indigo', 'brown', 'grey'];
const TAG_NAME = { type: 'string', minLength: 1, maxLength: 40 };
const TAG_COLOR = { type: 'string', enum: TAG_COLORS };
// Small raster logo, resized in the browser before upload (~96px). SVG is not accepted.
const TAG_LOGO = {
  anyOf: [
    { type: 'null' },
    { type: 'string', maxLength: 60000, pattern: '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' },
  ],
};
const MAX_TAGS = 50;
const SUBTASKS = {
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
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_THUMB_BYTES = 300 * 1024;
const MAX_ATTACHMENTS = 20;
const IMAGE_DATA_URL = '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$';
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;
const TIMESTAMP = { type: 'integer', minimum: 0 };

const PUBLIC_PATHS = new Set(['/api/health', '/api/config']);

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function assertDate(value, name) {
  if (!isValidDate(value)) throw new HttpError(400, `${name} must be a real date (YYYY-MM-DD)`);
}

// Control characters (except tab/newline) and zero-width characters are dropped.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g;

function cleanLine(value, what) {
  const s = value.toWellFormed().normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  if (!s) throw new HttpError(400, `${what} cannot be empty`);
  return s;
}

const cleanName = (name) => cleanLine(name, 'Name');
const cleanTitle = (title) => cleanLine(title, 'Title');
const cleanNotes = (notes) => notes.toWellFormed().normalize('NFC').replace(INVISIBLE, '').replace(/\r\n?/g, '\n').trim();

/** Logo must really be a PNG, JPEG or WebP image of the type it claims. */
function assertLogo(logo) {
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
function decodeImage(dataUrl, what, maxBytes) {
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

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Status for a task with steps. Explicit status in the request wins, except that a
 * task can't be marked done while steps are open. Without one, a change to the
 * steps decides: all done -> done, otherwise pending (a cancelled task stays cancelled).
 */
function resolveStatus(current, requested, subtasks, subtasksChanged) {
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

export function buildApp({ db, verify, config, logger = false, events = createEvents(), clock = () => Date.now() }) {
  const repo = createRepo(db);
  const app = Fastify({
    logger,
    bodyLimit: 128 * 1024,
    trustProxy: config.trustProxy ?? true,
    logController: new LogController({ disableRequestLogging: true }),
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } },
  });

  // ---- Security headers on every response --------------------------------
  const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  app.addHook('onSend', async (req, reply, payload) => {
    reply.headers(SECURITY_HEADERS);
    if (req.url.startsWith('/api/') && !reply.getHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err.validation) return reply.code(400).send({ error: err.message });
    const code = Number.isInteger(err.statusCode) && err.statusCode >= 400 ? err.statusCode : 500;
    const expose = code < 500 || err instanceof AuthError;
    if (!expose) req.log.error(err);
    return reply.code(code).send({ error: expose ? err.message : 'Server error' });
  });

  // ---- Auth ----------------------------------------------------------------
  const seen = new Map(); // uid -> last time the users row was refreshed
  // Each open app sends a random id, so it can ignore change events it caused itself.
  const clientId = (req) => {
    const id = req.headers['x-client-id'];
    return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : null;
  };
  const changed = (req, change) => events.publish(req.user.uid, change, clientId(req));
  const taskChange = (req, ...dates) => changed(req, { type: 'tasks', dates: [...new Set(dates.filter(Boolean))] });

  app.addHook('preClose', async () => events.closeAll()); // let shutdown finish promptly

  // Unfinished tasks from earlier days move to the user's "today" on their own. The day comes
  // from the device (time zones), so it must be within a day of the server's date: a phone with
  // a wrong clock must not drag every open task into the future.
  const plausibleToday = (today) => {
    const serverDay = new Date(clock()).toISOString().slice(0, 10);
    return Math.abs(daysBetween(serverDay, today)) <= 1;
  };
  const carryOver = (req, today) => {
    if (!today || !plausibleToday(today)) return;
    const from = repo.carryOver(req.user.uid, today);
    // Other devices refresh those days; this device gets the moved tasks in its own reply.
    if (from.length) taskChange(req, today, ...from);
  };

  app.get('/api/events', async (req, reply) => {
    events.open(req, reply, req.user.uid, SECURITY_HEADERS);
  });
  app.decorateRequest('user', null);
  // Runs before body parsing, and is keyed on the matched route (not the raw URL),
  // so encoded paths like /%61pi/... can't skip it.
  app.addHook('onRequest', async (req) => {
    const route = req.routeOptions?.url;
    if (!route || !route.startsWith('/api/') || PUBLIC_PATHS.has(route)) return;
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token && !config.devAuth) throw new AuthError('Not signed in');
    const user = await verify(token);
    req.user = user;
    const last = seen.get(user.uid) || 0;
    if (Date.now() - last > 10 * 60 * 1000) {
      repo.upsertUser(user);
      seen.set(user.uid, Date.now());
    }
  });

  // ---- Public --------------------------------------------------------------
  app.get('/api/health', async () => {
    db.prepare('SELECT 1').get();
    return { ok: true };
  });

  app.get('/api/config', async () => ({
    configured: Boolean(config.firebase) || config.devAuth,
    devAuth: config.devAuth,
    firebase: config.firebase,
    ...(config.authEmulator ? { authEmulator: config.authEmulator } : {}),
  }));

  // ---- Tasks ---------------------------------------------------------------
  const PROFILE_NAME = { type: 'string', minLength: 1, maxLength: 60 };

  app.get('/api/me', async (req) => {
    repo.upsertUser(req.user); // always fresh here: email, Google name/photo may change
    seen.set(req.user.uid, Date.now());
    return {
      ...repo.getProfile(req.user.uid),
      provider: req.user.provider ?? null,
      emailVerified: req.user.emailVerified ?? false,
    };
  });

  app.patch('/api/me', {
    schema: {
      body: {
        type: 'object',
        minProperties: 1,
        properties: { name: PROFILE_NAME, onboarded: { type: 'boolean', const: true } },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const uid = req.user.uid;
    repo.upsertUser(req.user);
    if (req.body.name !== undefined) repo.setDisplayName(uid, cleanName(req.body.name));
    if (req.body.onboarded) repo.setOnboarded(uid);
    changed(req, { type: 'profile' });
    return {
      ...repo.getProfile(uid),
      provider: req.user.provider ?? null,
      emailVerified: req.user.emailVerified ?? false,
    };
  });

  app.get('/api/tasks', {
    schema: {
      querystring: {
        type: 'object',
        required: ['date'],
        properties: { date: DATE, today: DATE },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { date, today } = req.query;
    assertDate(date, 'date');
    if (today) assertDate(today, 'today');
    carryOver(req, today);
    return {
      tasks: repo.listByDate(req.user.uid, date),
      overdue: today && date === today ? repo.listOverdue(req.user.uid, today) : [],
    };
  });

  // ---- Search ----------------------------------------------------------------
  app.get('/api/search', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', maxLength: 200 },
          today: DATE,
          // Query values arrive as text (no type coercion here), so the count is digits.
          limit: { type: 'string', pattern: '^[1-9][0-9]?$|^100$' },
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const uid = req.user.uid;
    const q = req.query.q ?? '';
    const today = req.query.today && isValidDate(req.query.today) ? req.query.today : new Date(clock()).toISOString().slice(0, 10);
    const tags = repo.listTags(uid);
    const parsed = parseQuery(q, today);
    const tasks = repo.allTasks(uid);
    const suggestions = suggest(q, tasks, tags);
    if (!parsed.terms.length && !parsed.phrases.length && !hasFilters(parsed)) {
      return { results: [], total: 0, fuzzy: false, terms: [], suggestions };
    }
    const found = searchTasks(tasks, tags, parsed, today, req.query.limit ? Number(req.query.limit) : 30);
    return {
      results: found.results.map((r) => ({ ...r.task, match: r.match })),
      total: found.total,
      fuzzy: found.fuzzy,
      terms: found.terms,
      suggestions,
    };
  });

  app.get('/api/summary', {
    schema: {
      querystring: {
        type: 'object',
        required: ['from', 'to'],
        properties: { from: DATE, to: DATE },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { from, to } = req.query;
    assertDate(from, 'from');
    assertDate(to, 'to');
    const span = daysBetween(from, to);
    if (span < 0 || span > 92) throw new HttpError(400, 'Range must be 0-92 days');
    return { days: repo.summary(req.user.uid, from, to) };
  });

  app.post('/api/tasks', {
    schema: {
      body: {
        type: 'object',
        required: ['title', 'date'],
        properties: {
          id: ID, title: TITLE, notes: NOTES, priority: PRIORITY, date: DATE,
          status: STATUS, originalDate: DATE, postponed: COUNT, tagIds: TAG_IDS, subtasks: SUBTASKS,
          // Only used when undoing a delete, so the task keeps its place and history.
          createdAt: TIMESTAMP, completedAt: TIMESTAMP, carriedFrom: DATE,
          // The device's today: new tasks can't go on an earlier day.
          today: DATE,
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const b = req.body;
    assertDate(b.date, 'date');
    if (b.originalDate) assertDate(b.originalDate, 'originalDate');
    if (b.carriedFrom) assertDate(b.carriedFrom, 'carriedFrom');
    if (b.today) assertDate(b.today, 'today');
    // New tasks go on today or later. A re-create by "Undo" (it carries createdAt) may restore
    // a task to its old day. Without a plausible device date, allow from yesterday in UTC,
    // which is still "today" somewhere.
    if (b.createdAt === undefined) {
      const earliest = b.today && plausibleToday(b.today)
        ? b.today
        : addDays(new Date(clock()).toISOString().slice(0, 10), -1);
      if (b.date < earliest) throw new HttpError(400, 'Tasks can only be added for today or a later day');
    }
    const uid = req.user.uid;

    if (b.id) {
      // Client-generated ids make creation idempotent (safe to retry).
      const existing = repo.get(uid, b.id);
      if (existing) return reply.code(200).send(existing);
      if (repo.idTaken(b.id)) throw new HttpError(409, 'Id already in use');
    }
    const tagIds = b.tagIds ?? [];
    if (!repo.ownsTags(uid, tagIds)) throw new HttpError(400, 'Unknown tag');
    const now = Date.now();
    const subtasks = normalizeSubtasks(b.subtasks ?? []);
    const status = resolveStatus('pending', b.status, subtasks, subtasks.length > 0);
    if ((b.createdAt ?? 0) > now + 60000 || (b.completedAt ?? 0) > now + 60000) {
      throw new HttpError(400, 'Timestamps cannot be in the future');
    }
    const task = repo.insert(uid, {
      id: b.id || crypto.randomUUID(),
      title: cleanTitle(b.title),
      notes: cleanNotes(b.notes || ''),
      priority: b.priority ?? 4,
      date: b.date,
      status,
      originalDate: b.originalDate || b.date,
      postponed: b.postponed ?? 0,
      carriedFrom: b.carriedFrom && b.carriedFrom < b.date ? b.carriedFrom : null,
      createdAt: b.createdAt ?? now,
      updatedAt: now,
      completedAt: status === 'done' ? (b.completedAt ?? now) : null,
      tagIds,
      subtasks,
    });
    taskChange(req, task.date);
    return reply.code(201).send(task);
  });

  const idParams = {
    type: 'object', required: ['id'], properties: { id: ID }, additionalProperties: false,
  };

  app.patch('/api/tasks/:id', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        minProperties: 1,
        properties: {
          title: TITLE, notes: NOTES, priority: PRIORITY, date: DATE, status: STATUS, postponed: COUNT,
          tagIds: TAG_IDS, subtasks: SUBTASKS,
          // Only sent by "Undo" of a move/postpone, to bring back the "from earlier" mark.
          carriedFrom: { anyOf: [DATE, { type: 'null' }] },
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const uid = req.user.uid;
    const current = repo.get(uid, req.params.id);
    if (!current) throw new HttpError(404, 'Task not found');
    const b = req.body;
    if (b.date !== undefined) assertDate(b.date, 'date');

    if (b.tagIds !== undefined && !repo.ownsTags(uid, b.tagIds)) throw new HttpError(400, 'Unknown tag');
    const next = { ...current, tagIds: b.tagIds, updatedAt: Date.now() };
    if (b.title !== undefined) next.title = cleanTitle(b.title);
    if (b.notes !== undefined) next.notes = cleanNotes(b.notes);
    if (b.priority !== undefined) next.priority = b.priority;
    if (b.date !== undefined && b.date !== current.date) {
      next.date = b.date;
      next.carriedFrom = null; // moved on purpose: it's planned for that day now
    }
    if (b.postponed !== undefined) next.postponed = b.postponed;
    if (b.carriedFrom !== undefined) {
      if (b.carriedFrom) assertDate(b.carriedFrom, 'carriedFrom');
      next.carriedFrom = b.carriedFrom && b.carriedFrom < next.date ? b.carriedFrom : null;
    }
    if (b.subtasks !== undefined) next.subtasks = normalizeSubtasks(b.subtasks);
    const status = resolveStatus(current.status, b.status, next.subtasks, b.subtasks !== undefined);
    if (status !== current.status) {
      next.status = status;
      next.completedAt = status === 'done' ? next.updatedAt : null;
    }
    const saved = repo.update(uid, next);
    taskChange(req, current.date, saved.date);
    return saved;
  });

  app.post('/api/tasks/:id/postpone', {
    schema: {
      params: idParams,
      body: {
        type: 'object', required: ['today'], properties: { today: DATE }, additionalProperties: false,
      },
    },
  }, async (req) => {
    const uid = req.user.uid;
    assertDate(req.body.today, 'today');
    const current = repo.get(uid, req.params.id);
    if (!current) throw new HttpError(404, 'Task not found');
    if (current.status !== 'pending') throw new HttpError(409, 'Only pending tasks can be postponed');
    // "Tomorrow" means the day after today, or the day after the task's own
    // date if it is already in the future.
    const nextDate = addDays(maxDate(current.date, req.body.today), 1);
    if (!isValidDate(nextDate)) throw new HttpError(400, 'Cannot postpone past the year 2999');
    const saved = repo.update(uid, {
      ...current,
      tagIds: undefined,
      date: nextDate,
      carriedFrom: null,
      postponed: current.postponed + 1,
      updatedAt: Date.now(),
    });
    taskChange(req, current.date, saved.date);
    return saved;
  });

  app.delete('/api/tasks/:id', { schema: { params: idParams } }, async (req, reply) => {
    const current = repo.get(req.user.uid, req.params.id);
    if (!current || !repo.remove(req.user.uid, req.params.id)) throw new HttpError(404, 'Task not found');
    taskChange(req, current.date);
    return reply.code(204).send();
  });

  // ---- Attachments (images) ------------------------------------------------
  // Files live next to the database: <filesDir>/<id>.<type> and <id>.thumb.<type>.
  const filesDir = config.filesDir;
  const filePath = (id, type, thumb) => path.join(filesDir, `${id}${thumb ? '.thumb' : ''}.${type}`);
  function writeFileAtomic(file, buf) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
  }
  function removeFiles(id, type) {
    for (const thumb of [false, true]) fs.rmSync(filePath(id, type, thumb), { force: true });
  }

  app.post('/api/tasks/:id/attachments', {
    bodyLimit: Math.ceil((MAX_IMAGE_BYTES + MAX_THUMB_BYTES) * 1.37) + 4096,
    schema: {
      params: idParams,
      body: {
        type: 'object',
        required: ['id', 'image', 'thumb', 'width', 'height'],
        properties: {
          id: ID,
          image: { type: 'string', pattern: IMAGE_DATA_URL },
          thumb: { type: 'string', pattern: IMAGE_DATA_URL },
          width: { type: 'integer', minimum: 1, maximum: 20000 },
          height: { type: 'integer', minimum: 1, maximum: 20000 },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const uid = req.user.uid;
    const b = req.body;
    const task = repo.get(uid, req.params.id);
    if (!task) throw new HttpError(404, 'Task not found');
    const existing = repo.getAttachment(uid, b.id);
    if (existing) {
      if (existing.task_id !== task.id) throw new HttpError(409, 'Id already in use');
      return reply.code(200).send(task); // retry of an upload that already worked
    }
    if (repo.attachmentIdTaken(b.id)) throw new HttpError(409, 'Id already in use');
    if (repo.attachmentCount(uid, task.id) >= MAX_ATTACHMENTS) {
      throw new HttpError(400, `A task can have at most ${MAX_ATTACHMENTS} images`);
    }
    const image = decodeImage(b.image, 'Image', MAX_IMAGE_BYTES);
    const thumb = decodeImage(b.thumb, 'Thumbnail', MAX_THUMB_BYTES);
    if (thumb.type !== image.type) throw new HttpError(400, 'Thumbnail must be the same image type');
    fs.mkdirSync(filesDir, { recursive: true });
    writeFileAtomic(filePath(b.id, image.type, false), image.buf);
    writeFileAtomic(filePath(b.id, image.type, true), thumb.buf);
    try {
      repo.insertAttachment(uid, {
        id: b.id, taskId: task.id, type: image.type, width: b.width, height: b.height,
        size: image.buf.length, createdAt: Date.now(),
      });
    } catch (err) {
      removeFiles(b.id, image.type);
      throw err;
    }
    taskChange(req, task.date);
    return reply.code(201).send(repo.get(uid, task.id));
  });

  app.get('/api/attachments/:id', {
    schema: {
      params: idParams,
      querystring: {
        type: 'object', properties: { size: { type: 'string', enum: ['full', 'thumb'] } }, additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const a = repo.getAttachment(req.user.uid, req.params.id);
    if (!a) throw new HttpError(404, 'Image not found');
    const file = filePath(a.id, a.type, req.query.size === 'thumb');
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch {
      throw new HttpError(404, 'Image file is missing');
    }
    // Ids never get new content, so devices may keep their copy for good.
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.type(MIME[a.type]);
    return reply.send(buf);
  });

  app.delete('/api/attachments/:id', { schema: { params: idParams } }, async (req) => {
    const uid = req.user.uid;
    const a = repo.getAttachment(uid, req.params.id);
    if (!a || !repo.removeAttachment(uid, a.id)) throw new HttpError(404, 'Image not found');
    removeFiles(a.id, a.type);
    const task = repo.get(uid, a.task_id);
    if (task) taskChange(req, task.date);
    return task ?? { deleted: true };
  });

  // Images of tasks deleted more than a day ago (past any "Undo") are removed for good.
  function sweepAttachments() {
    try {
      for (const a of repo.expiredAttachments(Date.now() - ORPHAN_TTL_MS)) {
        removeFiles(a.id, a.type);
        repo.dropAttachment(a.id);
      }
    } catch (err) {
      app.log.error(err, 'attachment cleanup failed');
    }
  }
  let sweepTimer = null;
  app.addHook('onReady', async () => {
    sweepAttachments();
    sweepTimer = setInterval(sweepAttachments, 60 * 60 * 1000);
    sweepTimer.unref();
  });
  app.addHook('onClose', async () => clearInterval(sweepTimer));
  app.decorate('sweepAttachments', sweepAttachments);

  // ---- Tags ----------------------------------------------------------------
  app.get('/api/tags', async (req) => ({ tags: repo.listTags(req.user.uid) }));

  app.post('/api/tags', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: { id: ID, name: TAG_NAME, color: TAG_COLOR, logo: TAG_LOGO },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const uid = req.user.uid;
    const b = req.body;
    if (b.id) {
      const existing = repo.getTag(uid, b.id);
      if (existing) return reply.code(200).send(existing);
      if (repo.tagIdTaken(b.id)) throw new HttpError(409, 'Id already in use');
    }
    const name = cleanName(b.name);
    assertLogo(b.logo);
    const { count, maxPosition } = repo.tagStats(uid);
    if (count >= MAX_TAGS) throw new HttpError(400, `You can have at most ${MAX_TAGS} tags`);
    if (repo.tagNameTaken(uid, name)) throw new HttpError(409, `A tag named "${name}" already exists`);
    const now = Date.now();
    const tag = repo.insertTag(uid, {
      id: b.id || crypto.randomUUID(), name, color: b.color || 'blue', logo: b.logo ?? null,
      position: maxPosition + 1, createdAt: now, updatedAt: now,
    });
    changed(req, { type: 'tags' });
    return reply.code(201).send(tag);
  });

  app.patch('/api/tags/:id', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        minProperties: 1,
        properties: { name: TAG_NAME, color: TAG_COLOR, logo: TAG_LOGO, position: COUNT },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const uid = req.user.uid;
    const current = repo.getTag(uid, req.params.id);
    if (!current) throw new HttpError(404, 'Tag not found');
    const b = req.body;
    const next = { ...current, updatedAt: Date.now() };
    if (b.name !== undefined) {
      next.name = cleanName(b.name);
      if (repo.tagNameTaken(uid, next.name, current.id)) throw new HttpError(409, `A tag named "${next.name}" already exists`);
    }
    if (b.color !== undefined) next.color = b.color;
    if (b.logo !== undefined) {
      assertLogo(b.logo);
      next.logo = b.logo;
    }
    if (b.position !== undefined) next.position = b.position;
    const saved = repo.updateTag(uid, next);
    changed(req, { type: 'tags' });
    return saved;
  });

  app.delete('/api/tags/:id', { schema: { params: idParams } }, async (req, reply) => {
    if (!repo.removeTag(req.user.uid, req.params.id)) throw new HttpError(404, 'Tag not found');
    changed(req, { type: 'tags', tasks: true }); // the tag was also removed from tasks
    return reply.code(204).send();
  });

  // ---- Stats (summary page) -----------------------------------------------
  app.get('/api/stats', {
    schema: {
      querystring: {
        type: 'object',
        required: ['from', 'to', 'today'],
        properties: { from: DATE, to: DATE, today: DATE },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { from, to, today } = req.query;
    assertDate(from, 'from');
    assertDate(to, 'to');
    assertDate(today, 'today');
    const span = daysBetween(from, to);
    if (span < 0 || span > 92) throw new HttpError(400, 'Range must be 0-92 days');
    carryOver(req, today);
    return repo.stats(req.user.uid, from, to, today);
  });

  // ---- Web app (static files + SPA fallback) ------------------------------
  const indexFile = path.join(config.staticDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.register(fastifyStatic, {
      root: config.staticDir,
      preCompressed: true,
      cacheControl: false,
      etag: true,
      lastModified: true,
      // @fastify/static >= 10 passes the Fastify reply here.
      setHeaders(reply, filePath) {
        const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
        reply.header('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const url = req.url.split('?')[0];
      if ((req.method !== 'GET' && req.method !== 'HEAD') || url.startsWith('/api/') || path.extname(url)) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'Not found' }));
  }

  return app;
}
