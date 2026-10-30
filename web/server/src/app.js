import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { LogController } from 'fastify';
import fastifyStatic from '@fastify/static';
import { createRepo } from './db.js';
import { createTeamsRepo } from './teams.js';
import { registerTeamRoutes } from './teamRoutes.js';
import { MAX_SUBTASKS, SUBTASK_TITLE_MAX, normalizeSubtasks, progress } from './subtasks.js';
import { createEvents } from './events.js';
import { hasFilters, parseQuery, searchTasks, suggest } from './search.js';
import { AuthError } from './auth.js';
import { addDays, daysBetween, isValidDate, maxDate } from './dates.js';

import {
  DATE, ID, TITLE, NOTES, PRIORITY, STATUS, COUNT, TAG_IDS, TAG_COLORS, TAG_NAME, TAG_COLOR, TAG_LOGO, MAX_TAGS, SUBTASKS, MAX_IMAGE_BYTES, MAX_THUMB_BYTES, MAX_ATTACHMENTS, IMAGE_DATA_URL, ORPHAN_TTL_MS, TIMESTAMP, DUE_AT, UID, TEAM_NAME, EMAIL, MAX_INVITES_AT_ONCE, HttpError, assertDate, assertDueAt, sameSteps, INVISIBLE, cleanLine, cleanName, cleanTitle, cleanNotes, assertLogo, decodeImage, MIME, resolveStatus,
} from './common.js';
export { TAG_COLORS } from './common.js';

const PUBLIC_PATHS = new Set(['/api/health', '/api/config']);
const APK_NAME = 'Tasks.apk';

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
  // Set once the team routes are registered (below); used by the personal task routes.
  let hooks = null;
  /** A team task changed: everyone following it (its admins, whoever gave it) refreshes. */
  const teamTaskTouched = (req, ...tasks) => hooks.touched(req, ...tasks);
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
    try {
      hooks.runRecurring(today); // repeating team tasks for this person's day (time zones)
    } catch (err) {
      req.log.error(err, 'repeating tasks failed');
    }
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
    if (current.teamId) {
      const refused = hooks.memberMayChange(current, b, uid);
      if (refused) throw new HttpError(403, refused);
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
    hooks.afterWork(req, current, saved);
    const fresh = saved.teamId ? repo.get(uid, saved.id) : saved; // sign-off state may have changed
    taskChange(req, current.date, saved.date);
    teamTaskTouched(req, fresh);
    return fresh;
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
    hooks.afterWork(req, current, saved);
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
      // So may whoever gave the task, and the others who share it.
      const t = teams.attachmentWithTeam(req.params.id);
      if (t && t.orphaned_at == null && t.team_id && hooks.canSee(teams.taskAny(t.task_id), req.user.uid)) a = t;
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
      hooks.sweepFiles(Date.now() - ORPHAN_TTL_MS);
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

  // ---- Teams (see teamRoutes.js) -------------------------------------------
  hooks = registerTeamRoutes(app, {
    repo, teams, config, clock, tell, tellTasks, tellTeam, isAdminRole, isTeamAdmin, plausibleToday, idParams,
    filesDir, filePath, writeFileAtomic, removeFiles, changed,
    publish: (uids, change) => { for (const uid of new Set(uids)) events.publish(uid, change, null); },
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
