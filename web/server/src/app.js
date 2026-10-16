import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { LogController } from 'fastify';
import fastifyStatic from '@fastify/static';
import { createRepo } from './db.js';
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

export function buildApp({ db, verify, config, logger = false }) {
  const repo = createRepo(db);
  const app = Fastify({
    logger,
    bodyLimit: 128 * 1024,
    trustProxy: config.trustProxy ?? true,
    logController: new LogController({ disableRequestLogging: true }),
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } },
  });

  // ---- Security headers on every response --------------------------------
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
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
    return {
      tasks: repo.listByDate(req.user.uid, date),
      overdue: today && date === today ? repo.listOverdue(req.user.uid, today) : [],
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
          status: STATUS, originalDate: DATE, postponed: COUNT, tagIds: TAG_IDS,
          // Only used when undoing a delete, so the task keeps its place and history.
          createdAt: TIMESTAMP, completedAt: TIMESTAMP,
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const b = req.body;
    assertDate(b.date, 'date');
    if (b.originalDate) assertDate(b.originalDate, 'originalDate');
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
    const status = b.status || 'pending';
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
      createdAt: b.createdAt ?? now,
      updatedAt: now,
      completedAt: status === 'done' ? (b.completedAt ?? now) : null,
      tagIds,
    });
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
          tagIds: TAG_IDS,
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
    if (b.date !== undefined) next.date = b.date;
    if (b.postponed !== undefined) next.postponed = b.postponed;
    if (b.status !== undefined && b.status !== current.status) {
      next.status = b.status;
      next.completedAt = b.status === 'done' ? next.updatedAt : null;
    }
    return repo.update(uid, next);
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
    return repo.update(uid, {
      ...current,
      tagIds: undefined,
      date: nextDate,
      postponed: current.postponed + 1,
      updatedAt: Date.now(),
    });
  });

  app.delete('/api/tasks/:id', { schema: { params: idParams } }, async (req, reply) => {
    if (!repo.remove(req.user.uid, req.params.id)) throw new HttpError(404, 'Task not found');
    return reply.code(204).send();
  });

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
    return repo.updateTag(uid, next);
  });

  app.delete('/api/tags/:id', { schema: { params: idParams } }, async (req, reply) => {
    if (!repo.removeTag(req.user.uid, req.params.id)) throw new HttpError(404, 'Tag not found');
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
