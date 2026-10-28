import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { LogController } from 'fastify';
import fastifyStatic from '@fastify/static';
import { createRepo } from './db.js';
import { MAX_MEMBERS, MAX_PENDING_INVITES, MAX_TEAMS_PER_USER, createTeamsRepo } from './teams.js';
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
// A deadline: local date and time on the device ("2026-10-30T17:00"), or null for none.
const DUE_AT = { anyOf: [{ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$' }, { type: 'null' }] };
const UID = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' };
const TEAM_NAME = { type: 'string', minLength: 1, maxLength: 60 };
const EMAIL = { type: 'string', minLength: 3, maxLength: 254 };
const MAX_INVITES_AT_ONCE = 50;

const PUBLIC_PATHS = new Set(['/api/health', '/api/config']);
const APK_NAME = 'Tasks.apk';

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function assertDate(value, name) {
  if (!isValidDate(value)) throw new HttpError(400, `${name} must be a real date (YYYY-MM-DD)`);
}

function assertDueAt(value) {
  if (value == null) return;
  const [day, time] = value.split('T');
  const [h, m] = time.split(':').map(Number);
  if (!isValidDate(day) || h > 23 || m > 59) throw new HttpError(400, 'Deadline must be a real date and time');
}

/** True when two step lists differ only in what is ticked off. */
function sameSteps(a, b) {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id && x.parentId === b[i].parentId && x.title === b[i].title);
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
  const teams = createTeamsRepo(db);
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
  // Changes that other people see (teams): each of them gets the event on their own apps.
  const tell = (req, uids, change) => {
    for (const uid of new Set(uids)) events.publish(uid, change, uid === req.user.uid ? clientId(req) : null);
  };
  const tellTasks = (req, uid, ...dates) => tell(req, [uid], { type: 'tasks', dates: [...new Set(dates.filter(Boolean))] });
  const tellTeam = (req, teamId, extra = []) => tell(req, [...teams.memberUids(teamId), ...extra], { type: 'teams', teamId });
  /** A team task changed: its team's admins refresh their view of it. */
  const teamTaskTouched = (req, ...tasks) => {
    for (const teamId of new Set(tasks.map((t) => t?.teamId).filter(Boolean))) {
      tell(req, teams.adminUids(teamId), { type: 'teams', teamId, tasks: true });
    }
  };
  const isAdminRole = (role) => role === 'owner' || role === 'admin';
  const isTeamAdmin = (teamId, uid) => isAdminRole(teams.role(teamId, uid));

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

  const apkInfo = () => {
    try {
      const st = config.apkPath ? fs.statSync(config.apkPath) : null;
      return st?.isFile() ? { size: st.size, updatedAt: Math.round(st.mtimeMs) } : null;
    } catch {
      return null;
    }
  };

  app.get('/api/config', async () => ({
    configured: Boolean(config.firebase) || config.devAuth,
    devAuth: config.devAuth,
    firebase: config.firebase,
    android: apkInfo(), // null when no APK is offered for download
    ...(config.authEmulator ? { authEmulator: config.authEmulator } : {}),
  }));

  // The Android app, for people who got here from an invite (public: they may not have it yet).
  app.get('/download/android', async (req, reply) => {
    const info = apkInfo();
    if (!info) return reply.code(404).send({ error: 'The Android app is not available for download here' });
    reply.header('Content-Type', 'application/vnd.android.package-archive');
    reply.header('Content-Disposition', `attachment; filename="${APK_NAME}"`);
    reply.header('Content-Length', info.size);
    reply.header('Cache-Control', 'no-cache');
    return reply.send(fs.createReadStream(config.apkPath));
  });

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

  // ---- Offline copy ----------------------------------------------------------
  // Everything the apps need to work without a connection: every task, the tags, and the
  // per-day "moved on unfinished" counts. Carry-over runs first, like opening today.
  app.get('/api/sync', {
    schema: {
      querystring: {
        type: 'object', properties: { today: DATE }, additionalProperties: false,
      },
    },
  }, async (req) => {
    const uid = req.user.uid;
    const { today } = req.query;
    if (today) assertDate(today, 'today');
    carryOver(req, today);
    return {
      tasks: repo.allTasks(uid),
      tags: repo.listTags(uid),
      misses: repo.allMisses(uid),
      teams: teams.listFor(uid),
      invites: teams.myInvites(req.user.emailVerified ? req.user.email : null),
      serverTime: clock(),
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
          dueAt: DUE_AT,
          // A team task an admin keeps for themself (or brings back with "Undo").
          teamId: ID, assignedBy: UID,
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
    assertDueAt(b.dueAt);
    if (b.teamId && !isTeamAdmin(b.teamId, req.user.uid)) {
      // "Undo" of a delete by someone who is no longer the team's admin: it comes back as their own task.
      if (b.createdAt === undefined) throw new HttpError(403, 'Only team admins can add team tasks');
      delete b.teamId;
      delete b.assignedBy;
    }
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
    // A device whose clock runs ahead sends times "in the future": use now instead of refusing
    // (refusing would lose a task made offline on that device).
    const clamp = (v) => (v === undefined ? undefined : Math.min(v, now));
    b.createdAt = clamp(b.createdAt);
    b.completedAt = clamp(b.completedAt);
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
      dueAt: b.dueAt ?? null,
      teamId: b.teamId ?? null,
      // Who gave it is only taken from an "Undo" re-create (it restores the task as it was).
      assignedBy: b.teamId ? (b.createdAt !== undefined && b.assignedBy && teams.role(b.teamId, b.assignedBy) ? b.assignedBy : uid) : null,
    });
    taskChange(req, task.date);
    teamTaskTouched(req, task);
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
          dueAt: DUE_AT,
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
    if (b.dueAt !== undefined) assertDueAt(b.dueAt);

    // A task from a team: the person it's given to works on it (done, postpone, steps, notes,
    // their own tags); what the task *is* stays with the team's admins.
    if (current.teamId && !isTeamAdmin(current.teamId, uid)) {
      const changes = (b.title !== undefined && cleanTitle(b.title) !== current.title)
        || (b.priority !== undefined && b.priority !== current.priority)
        || (b.dueAt !== undefined && b.dueAt !== current.dueAt)
        || (b.status !== undefined && b.status !== current.status && (b.status === 'cancelled' || current.status === 'cancelled'))
        || (b.subtasks !== undefined && !sameSteps(normalizeSubtasks(b.subtasks), current.subtasks));
      if (changes) throw new HttpError(403, 'Only team admins can change this task. You can complete it, postpone it, tick its steps and add notes.');
    }

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
    if (b.dueAt !== undefined) next.dueAt = b.dueAt;
    const status = resolveStatus(current.status, b.status, next.subtasks, b.subtasks !== undefined);
    if (status !== current.status) {
      next.status = status;
      next.completedAt = status === 'done' ? next.updatedAt : null;
    }
    const saved = repo.update(uid, next);
    taskChange(req, current.date, saved.date);
    teamTaskTouched(req, saved);
    return saved;
  });

  app.post('/api/tasks/:id/postpone', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        required: ['today'],
        // from: the task's day when the app postponed it. A replay (sent again after the
        // connection dropped) finds the task already moved and leaves it as it is.
        properties: { today: DATE, from: DATE },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const uid = req.user.uid;
    assertDate(req.body.today, 'today');
    if (req.body.from) assertDate(req.body.from, 'from');
    const current = repo.get(uid, req.params.id);
    if (!current) throw new HttpError(404, 'Task not found');
    // A repeat: the task already left that day because of this postpone (it isn't carried).
    // If carry-over moved it meanwhile (carriedFrom is set), the postpone still applies.
    const carried = current.status === 'pending' && current.carriedFrom && current.date > req.body.from;
    if (req.body.from && current.date !== req.body.from && !carried) return current;
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
    teamTaskTouched(req, saved);
    return saved;
  });

  app.delete('/api/tasks/:id', { schema: { params: idParams } }, async (req, reply) => {
    const current = repo.get(req.user.uid, req.params.id);
    if (!current) throw new HttpError(404, 'Task not found');
    if (current.teamId && !isTeamAdmin(current.teamId, req.user.uid)) {
      throw new HttpError(403, 'Only team admins can delete a team task');
    }
    if (!repo.remove(req.user.uid, req.params.id)) throw new HttpError(404, 'Task not found');
    taskChange(req, current.date);
    teamTaskTouched(req, current);
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
    teamTaskTouched(req, task);
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
    let a = repo.getAttachment(req.user.uid, req.params.id);
    if (!a) {
      // A team admin may look at the images on the tasks of their team.
      const t = teams.attachmentWithTeam(req.params.id);
      if (t && t.orphaned_at == null && t.team_id && isTeamAdmin(t.team_id, req.user.uid)) a = t;
    }
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
    teamTaskTouched(req, task);
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

  // ---- Teams ---------------------------------------------------------------
  // Someone makes a team and invites people by email. An invite waits in the app until that
  // person signs in with the same (verified) email and accepts it. Owner and admins hand out
  // tasks, follow them and manage people; members work on the tasks given to them.
  const teamParams = {
    type: 'object', required: ['id'], properties: { id: ID }, additionalProperties: false,
  };
  const emailRe = config.devAuth ? /^[^\s@<>,;"]+@[^\s@<>,;"]+$/ : /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;".]{2,}$/;

  /** The team and the caller's role in it; 404 for people outside it (it isn't theirs to know about). */
  function teamFor(req, teamId, { admin = false, owner = false } = {}) {
    const team = teams.get(teamId);
    const role = team && teams.role(teamId, req.user.uid);
    if (!role) throw new HttpError(404, 'Team not found');
    if (owner && role !== 'owner') throw new HttpError(403, 'Only the team owner can do this');
    if (admin && !isAdminRole(role)) throw new HttpError(403, 'Only team admins can do this');
    return { team, role };
  }
  const myView = (req, teamId) => teams.viewFor(teamId, req.user.uid);

  app.get('/api/teams', async (req) => ({
    teams: teams.listFor(req.user.uid),
    invites: teams.myInvites(req.user.emailVerified ? req.user.email : null),
  }));

  app.post('/api/teams', {
    schema: {
      body: {
        type: 'object', required: ['name'],
        properties: { id: ID, name: TEAM_NAME, color: TAG_COLOR },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const uid = req.user.uid;
    const b = req.body;
    if (b.id) {
      if (teams.role(b.id, uid)) return reply.code(200).send(myView(req, b.id)); // a retry
      if (teams.teamIdTaken(b.id)) throw new HttpError(409, 'Id already in use');
    }
    if (teams.teamCount(uid) >= MAX_TEAMS_PER_USER) throw new HttpError(400, `You can be in at most ${MAX_TEAMS_PER_USER} teams`);
    const id = b.id || crypto.randomUUID();
    teams.create(uid, { id, name: cleanName(b.name), color: b.color || 'blue' });
    tellTeam(req, id);
    return reply.code(201).send(myView(req, id));
  });

  app.patch('/api/teams/:id', {
    schema: {
      params: teamParams,
      body: {
        type: 'object', minProperties: 1,
        properties: { name: TEAM_NAME, color: TAG_COLOR },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    teams.update(team.id, {
      name: req.body.name !== undefined ? cleanName(req.body.name) : team.name,
      color: req.body.color ?? team.color,
    });
    tellTeam(req, team.id);
    return myView(req, team.id);
  });

  app.delete('/api/teams/:id', { schema: { params: teamParams } }, async (req, reply) => {
    const { team } = teamFor(req, req.params.id, { owner: true });
    const members = teams.memberUids(team.id);
    const owners = teams.remove(team.id); // its tasks stay with their people, as their own
    tell(req, members, { type: 'teams', teamId: team.id });
    const days = new Map();
    for (const { uid, date } of owners) days.set(uid, [...(days.get(uid) ?? []), date]);
    for (const [uid, dates] of days) tellTasks(req, uid, ...dates);
    return reply.code(204).send();
  });

  // -- Invites
  app.post('/api/teams/:id/invites', {
    schema: {
      params: teamParams,
      body: {
        type: 'object', required: ['emails'],
        properties: {
          emails: { type: 'array', minItems: 1, maxItems: MAX_INVITES_AT_ONCE, items: EMAIL },
          role: { type: 'string', enum: ['admin', 'member'] },
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    const role = req.body.role ?? 'member';
    const emails = [...new Set(req.body.emails.map((e) => e.trim().toLowerCase()))];
    const bad = emails.filter((e) => !emailRe.test(e));
    if (bad.length) throw new HttpError(400, `Not an email address: ${bad.slice(0, 3).join(', ')}`);
    const alreadyMembers = emails.filter((e) => teams.isMemberEmail(team.id, e));
    const invited = emails.filter((e) => !alreadyMembers.includes(e));
    if (teams.inviteCount(team.id) + invited.length > MAX_PENDING_INVITES) {
      throw new HttpError(400, `A team can have at most ${MAX_PENDING_INVITES} invites waiting`);
    }
    if (teams.memberCount(team.id) + invited.length > MAX_MEMBERS) {
      throw new HttpError(400, `A team can have at most ${MAX_MEMBERS} people`);
    }
    if (invited.length) {
      teams.addInvites(team.id, invited.map((email) => ({ id: crypto.randomUUID(), email, role })), req.user.uid);
    }
    tellTeam(req, team.id);
    // People who already use the app see the invite right away.
    tell(req, invited.flatMap((e) => teams.uidsByEmail(e)), { type: 'invites' });
    return { team: myView(req, team.id), invited, alreadyMembers };
  });

  app.delete('/api/teams/:id/invites/:inviteId', {
    schema: {
      params: {
        type: 'object', required: ['id', 'inviteId'], properties: { id: ID, inviteId: ID }, additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    const invite = teams.invite(req.params.inviteId);
    if (!invite || invite.team_id !== team.id) throw new HttpError(404, 'Invite not found');
    teams.removeInvite(invite.id);
    teams.touch(team.id);
    tellTeam(req, team.id);
    tell(req, teams.uidsByEmail(invite.email), { type: 'invites' });
    return myView(req, team.id);
  });

  // Invites show only to a verified owner of the address (anyone can sign up with any email).
  app.get('/api/invites', async (req) => ({ invites: teams.myInvites(req.user.emailVerified ? req.user.email : null) }));

  /** An invite for the caller's own email address. */
  function myInvite(req) {
    const invite = teams.invite(req.params.id);
    if (!invite || !req.user.email || invite.email !== req.user.email) throw new HttpError(404, 'Invite not found');
    if (!req.user.emailVerified) {
      throw new HttpError(403, 'Verify your email address first (check your inbox), then sign in again to join');
    }
    return invite;
  }

  app.post('/api/invites/:id/accept', { schema: { params: idParams } }, async (req) => {
    const invite = myInvite(req);
    if (!teams.role(invite.team_id, req.user.uid)) {
      if (teams.teamCount(req.user.uid) >= MAX_TEAMS_PER_USER) throw new HttpError(400, `You can be in at most ${MAX_TEAMS_PER_USER} teams`);
      if (teams.memberCount(invite.team_id) >= MAX_MEMBERS) throw new HttpError(400, 'This team is full');
    }
    repo.upsertUser(req.user); // teammates see the name and email right away
    teams.accept(invite, req.user.uid);
    tellTeam(req, invite.team_id);
    tell(req, [req.user.uid], { type: 'invites' });
    return { team: myView(req, invite.team_id) };
  });

  app.post('/api/invites/:id/decline', { schema: { params: idParams } }, async (req, reply) => {
    const invite = myInvite(req);
    teams.removeInvite(invite.id);
    teams.touch(invite.team_id);
    tell(req, teams.adminUids(invite.team_id), { type: 'teams', teamId: invite.team_id });
    tell(req, [req.user.uid], { type: 'invites' });
    return reply.code(204).send();
  });

  // -- People
  const memberParams = {
    type: 'object', required: ['id', 'uid'], properties: { id: ID, uid: UID }, additionalProperties: false,
  };

  app.patch('/api/teams/:id/members/:uid', {
    schema: {
      params: memberParams,
      body: {
        type: 'object', required: ['role'],
        properties: { role: { type: 'string', enum: ['owner', 'admin', 'member'] } },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team, role: mine } = teamFor(req, req.params.id, { admin: true });
    const target = req.params.uid;
    const theirs = teams.role(team.id, target);
    if (!theirs) throw new HttpError(404, 'This person is not in the team');
    const next = req.body.role;
    if (next === theirs) return myView(req, team.id);
    if (next === 'owner') {
      if (mine !== 'owner') throw new HttpError(403, 'Only the owner can hand the team over');
      teams.transfer(team.id, req.user.uid, target);
    } else {
      if (theirs === 'owner') throw new HttpError(403, "The owner's role changes only when they hand the team over");
      // Admins can make more admins; only the owner can take that back.
      if (mine !== 'owner' && !(theirs === 'member' && next === 'admin')) {
        throw new HttpError(403, 'Only the owner can change an admin back to a member');
      }
      teams.setRole(team.id, target, next);
      teams.touch(team.id);
    }
    tellTeam(req, team.id);
    return myView(req, team.id);
  });

  app.delete('/api/teams/:id/members/:uid', { schema: { params: memberParams } }, async (req, reply) => {
    const { team, role: mine } = teamFor(req, req.params.id);
    const target = req.params.uid;
    const self = target === req.user.uid;
    const theirs = self ? mine : teams.role(team.id, target);
    if (!theirs) throw new HttpError(404, 'This person is not in the team');
    if (self) {
      if (mine === 'owner') throw new HttpError(409, 'Hand the team over to someone else first, or delete the team');
    } else if (!isAdminRole(mine)) {
      throw new HttpError(403, 'Only team admins can remove people');
    } else if (theirs === 'owner' || (theirs === 'admin' && mine !== 'owner')) {
      throw new HttpError(403, theirs === 'owner' ? 'The owner cannot be removed' : 'Only the owner can remove an admin');
    }
    const members = teams.memberUids(team.id);
    const days = teams.removeMember(team.id, target); // their team tasks stay with them, as their own
    tell(req, members, { type: 'teams', teamId: team.id });
    if (days.length) tellTasks(req, target, ...days);
    return reply.code(204).send();
  });

  // -- Tasks given out by the team
  const teamTaskParams = {
    type: 'object', required: ['id', 'taskId'], properties: { id: ID, taskId: ID }, additionalProperties: false,
  };

  app.get('/api/teams/:id/tasks', {
    schema: {
      params: teamParams,
      querystring: {
        type: 'object', required: ['from', 'to'], properties: { from: DATE, to: DATE }, additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    const { from, to } = req.query;
    assertDate(from, 'from');
    assertDate(to, 'to');
    const span = daysBetween(from, to);
    if (span < 0 || span > 92) throw new HttpError(400, 'Range must be 0-92 days');
    return { tasks: teams.tasks(team.id, from, to) };
  });

  /** The person a task goes to must be in the team. */
  function assigneeIn(teamId, uid) {
    if (!teams.role(teamId, uid)) throw new HttpError(400, 'That person is not in the team');
    return uid;
  }

  app.post('/api/teams/:id/tasks', {
    schema: {
      params: teamParams,
      body: {
        type: 'object', required: ['title', 'date', 'assignee'],
        properties: {
          id: ID, assignee: UID, title: TITLE, notes: NOTES, priority: PRIORITY, date: DATE,
          subtasks: SUBTASKS, dueAt: DUE_AT, today: DATE,
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    const b = req.body;
    assertDate(b.date, 'date');
    if (b.today) assertDate(b.today, 'today');
    assertDueAt(b.dueAt);
    if (b.id) {
      const existing = teams.task(team.id, b.id);
      if (existing) return reply.code(200).send(existing); // a retry
      if (repo.idTaken(b.id)) throw new HttpError(409, 'Id already in use');
    }
    const earliest = b.today && plausibleToday(b.today) ? b.today : addDays(new Date(clock()).toISOString().slice(0, 10), -1);
    if (b.date < earliest) throw new HttpError(400, 'Tasks can only be given for today or a later day');
    const assignee = assigneeIn(team.id, b.assignee);
    const now = Date.now();
    const subtasks = normalizeSubtasks(b.subtasks ?? []);
    const saved = repo.insert(assignee, {
      id: b.id || crypto.randomUUID(),
      title: cleanTitle(b.title),
      notes: cleanNotes(b.notes || ''),
      priority: b.priority ?? 4,
      date: b.date,
      status: 'pending',
      originalDate: b.date,
      postponed: 0,
      carriedFrom: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      tagIds: [],
      subtasks,
      dueAt: b.dueAt ?? null,
      teamId: team.id,
      assignedBy: req.user.uid,
    });
    tellTasks(req, assignee, saved.date);
    teamTaskTouched(req, saved);
    return reply.code(201).send(teams.task(team.id, saved.id));
  });

  app.patch('/api/teams/:id/tasks/:taskId', {
    schema: {
      params: teamTaskParams,
      body: {
        type: 'object', minProperties: 1,
        properties: {
          assignee: UID, title: TITLE, notes: NOTES, priority: PRIORITY, date: DATE, status: STATUS,
          subtasks: SUBTASKS, dueAt: DUE_AT,
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    const current = teams.task(team.id, req.params.taskId);
    if (!current) throw new HttpError(404, 'Task not found');
    const b = req.body;
    if (b.date !== undefined) assertDate(b.date, 'date');
    if (b.dueAt !== undefined) assertDueAt(b.dueAt);
    const owner = b.assignee !== undefined ? assigneeIn(team.id, b.assignee) : current.assignee;
    const next = { ...current, tagIds: undefined, updatedAt: Date.now() };
    if (b.title !== undefined) next.title = cleanTitle(b.title);
    if (b.notes !== undefined) next.notes = cleanNotes(b.notes);
    if (b.priority !== undefined) next.priority = b.priority;
    if (b.date !== undefined && b.date !== current.date) {
      next.date = b.date;
      next.carriedFrom = null;
    }
    if (b.dueAt !== undefined) next.dueAt = b.dueAt;
    if (b.subtasks !== undefined) next.subtasks = normalizeSubtasks(b.subtasks);
    const status = resolveStatus(current.status, b.status, next.subtasks, b.subtasks !== undefined);
    if (status !== current.status) {
      next.status = status;
      next.completedAt = status === 'done' ? next.updatedAt : null;
    }
    // Everything is checked by now: move it to its new person and save the changes, as one.
    teams.tx(() => {
      if (owner !== current.assignee) teams.reassign(current.id, owner);
      repo.update(owner, next);
    });
    const saved = teams.task(team.id, current.id);
    tellTasks(req, owner, current.date, saved.date);
    if (owner !== current.assignee) tellTasks(req, current.assignee, current.date);
    teamTaskTouched(req, saved);
    return saved;
  });

  app.delete('/api/teams/:id/tasks/:taskId', { schema: { params: teamTaskParams } }, async (req, reply) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    const current = teams.task(team.id, req.params.taskId);
    if (!current || !repo.remove(current.assignee, current.id)) throw new HttpError(404, 'Task not found');
    tellTasks(req, current.assignee, current.date);
    teamTaskTouched(req, current);
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
