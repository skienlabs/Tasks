// Client-side store, offline first. Every change is applied locally first (instant UI),
// saved on this device, and queued for the server. The queue (the "outbox") is sent in
// order; without a connection it waits and goes out when the app is back online. If the
// server refuses a change, it is rolled back to the last state the server confirmed.
//
// Everything the app shows is kept in IndexedDB (lib/idb.js), so it opens and works with
// no network at all; a full copy is refreshed from /api/sync whenever it's online.
//
// Rules that keep it correct under races:
// - Changes go to the server strictly in the order they were made (one queue).
// - Waiting changes are sent before any fetch that may move tasks (the server's
//   carry-over), so a task completed offline yesterday isn't carried to today first.
// - A fetch never overwrites (or deletes) a task changed locally after that fetch
//   started, and an older fetch for a day is ignored if a newer one ran.
// - Everything async checks `epoch`, which changes on sign-out/account switch,
//   so one account's late responses can never land in another account.

import { useSyncExternalStore } from 'react';
import { ApiError, api, newId } from './api.js';
import * as idb from './idb.js';
import { addDays, shortLabel, todayKey } from './dates.js';
import { tagsOf, taskComparator } from './order.js';
import { clearImages, saveImageCopy, seedImage } from './images.js';
import { progress, setAll, statusAfterSteps, toggle } from './subtasks.js';

export const MAX_TAGS_PER_TASK = 10;

const byId = new Map(); // id -> task as shown
const confirmed = new Map(); // id -> last task state the server confirmed
const touched = new Map(); // id -> seq of the latest local change
const latest = new Map(); // id -> seq of the newest change the server hasn't confirmed yet
const loadedAt = new Map(); // date -> time of last successful day fetch
const dayRequest = new Map(); // date -> counter of the newest day fetch
const summary = new Map(); // date -> { pending, done, cancelled, missed }
const misses = new Map(); // date -> tasks left unfinished that day that moved on (server's count)
const dateTouched = new Map(); // date -> seq of the latest local change on that date
const inflightDates = new Map(); // date -> number of unsent changes touching it
const tags = new Map(); // id -> tag
let tagsLoaded = false;
let tagsTouched = 0; // seq of the latest local tag change
let seq = 0;
let epoch = 0;
let version = 0;
let toast = null;
const listeners = new Set();

// Offline state
let uid = null; // whose data is in memory (and saved on this device)
let knownAll = false; // a full copy arrived at least once: every day is known
let lastSync = 0;
let online = typeof navigator === 'undefined' || navigator.onLine !== false;
const outbox = []; // changes waiting for the server, oldest first
let outboxN = 0;
const dirtyTasks = new Set();
let metaDirty = false;
let persistTimer = null;
let flushing = null;
let retryTimer = null;
let retryMs = 2000;
let toldOffline = false;
let resyncAfterFlush = false; // was offline: fetch a fresh full copy once everything is sent

function emit() {
  version++;
  for (const l of listeners) l();
}

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Re-renders the caller whenever the store changes; returns a change counter. */
export function useStoreVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

export function useToast() {
  useStoreVersion();
  return toast;
}

/** `undo` is an optional action; `actionLabel` defaults to "Undo". */
export function showToast(message, undo, actionLabel = 'Undo') {
  toast = { key: ++seq, message, undo, actionLabel };
  emit();
}

export function closeToast() {
  toast = null;
  emit();
}

// ---- Selectors ---------------------------------------------------------------

/** Day lists use one order everywhere: see lib/order.js. */
export function selectDay(date) {
  const list = [];
  for (const t of byId.values()) if (t.date === date) list.push(t);
  return list.sort(taskComparator(selectTags()));
}

export function selectOverdue(today) {
  const list = [];
  for (const t of byId.values()) if (t.status === 'pending' && t.date < today) list.push(t);
  return list.sort(taskComparator(selectTags()));
}

/** A task's tags in the user's own order (the first is its company). */
export function selectTaskTags(task) {
  return tagsOf(task, selectTags());
}

export function selectSummary(date) {
  return summary.get(date);
}

/** True when the day's tasks are known: fetched, or part of the full offline copy. */
export function isDayLoaded(date) {
  return knownAll || loadedAt.has(date);
}

export function loadedDates() {
  return [...loadedAt.keys()];
}

export function getTask(id) {
  return byId.get(id) ?? null;
}

/** Every task in memory (the offline copy), for search and the summary without a connection. */
export function allTasks() {
  return [...byId.values()];
}

/** For the offline badge: is the server reachable, how many changes are waiting, sending now? */
export function selectSync() {
  return { online, pending: outbox.length, syncing: Boolean(flushing) };
}

/** Changes made here that the server hasn't received yet. */
export function pendingChanges() {
  return outbox.length;
}

// ---- Local bookkeeping -------------------------------------------------------

const blank = (date) => ({ pending: 0, done: 0, cancelled: 0, missed: misses.get(date) ?? 0 });

function bump(task, sign) {
  const s = { ...blank(task.date), ...summary.get(task.date) };
  s[task.status] = Math.max(0, s[task.status] + sign);
  summary.set(task.date, s);
  metaDirty = true;
}

function put(task) {
  const old = byId.get(task.id);
  if (old) bump(old, -1);
  byId.set(task.id, task);
  bump(task, +1);
  dirtyTasks.add(task.id);
}

function drop(id) {
  const old = byId.get(id);
  if (!old) return;
  bump(old, -1);
  byId.delete(id);
  dirtyTasks.add(id);
}

function recount(date) {
  // `missed` (tasks left unfinished that day and carried on) only comes from the server.
  const s = { ...blank(date), missed: summary.get(date)?.missed ?? misses.get(date) ?? 0 };
  for (const t of byId.values()) if (t.date === date) s[t.status]++;
  summary.set(date, s);
  metaDirty = true;
}

/** Counts every day again from the tasks in memory (after a full copy arrived). */
function recountAll() {
  summary.clear();
  for (const [date, n] of misses) summary.set(date, { pending: 0, done: 0, cancelled: 0, missed: n });
  for (const t of byId.values()) {
    const s = summary.get(t.date) ?? { pending: 0, done: 0, cancelled: 0, missed: 0 };
    s[t.status]++;
    summary.set(t.date, s);
  }
  metaDirty = true;
}

/** Keeps only tag ids that exist; if tags haven't loaded yet, keeps them as they are. */
function cleanTagIds(ids) {
  const unique = [...new Set(ids)];
  return (tagsLoaded ? unique.filter((id) => tags.has(id)) : unique).slice(0, MAX_TAGS_PER_TASK).sort();
}

function markDates(dates, mine, delta) {
  for (const d of dates) {
    if (delta > 0) dateTouched.set(d, mine);
    const n = (inflightDates.get(d) ?? 0) + delta;
    if (n > 0) inflightDates.set(d, n);
    else inflightDates.delete(d);
  }
}

// ---- Session and the saved copy (IndexedDB) ----------------------------------------

/** Forgets everything in memory (sign-out or a different account). See wipeOffline. */
export function clearStore() {
  epoch++;
  for (const m of [byId, confirmed, touched, latest, loadedAt, dayRequest, summary, misses, dateTouched, inflightDates, tags]) m.clear();
  for (const e of outbox) e.resolve?.(false);
  outbox.length = 0;
  dirtyTasks.clear();
  metaDirty = false;
  clearTimeout(persistTimer);
  persistTimer = null;
  clearTimeout(retryTimer);
  retryTimer = null;
  flushing = null; // a send still running for the old account stops at its next epoch check
  resyncAfterFlush = false;
  uid = null;
  knownAll = false;
  lastSync = 0;
  tagsLoaded = false;
  tagsTouched = 0;
  toldOffline = false;
  toast = null;
  clearImages();
  emit();
}

/** Deletes everything this device saved (on sign-out). */
export function wipeOffline() {
  return idb.wipe();
}

function schedulePersist() {
  if (persistTimer || !uid) return;
  persistTimer = setTimeout(persist, 250);
}

async function persist() {
  persistTimer = null;
  const owner = uid;
  if (!owner) return;
  const puts = [];
  const deletes = [];
  for (const id of dirtyTasks) {
    const t = byId.get(id);
    if (t) puts.push([id, t]);
    else deletes.push(id);
  }
  dirtyTasks.clear();
  await idb.write('tasks', owner, puts, deletes);
  if (metaDirty && owner === uid) {
    metaDirty = false;
    await idb.write('meta', owner, [
      ['tags', [...tags.values()]],
      ['tagsLoaded', tagsLoaded],
      ['summary', [...summary.entries()]],
      ['misses', [...misses.entries()]],
      ['days', [...loadedAt.keys()]],
      ['knownAll', knownAll],
      ['lastSync', lastSync],
    ]);
  }
}

const META_KEYS = ['tags', 'tagsLoaded', 'summary', 'misses', 'days', 'knownAll', 'lastSync'];

/**
 * Opens the account's saved copy (instantly, with no network) and then brings it up to
 * date: sends any changes made offline, then fetches a full fresh copy.
 */
export async function startStore(newUid, today) {
  if (uid === newUid) return;
  clearStore();
  uid = newUid;
  const ep = epoch;
  const [savedTasks, meta, ops] = await Promise.all([
    idb.getAll('tasks', newUid),
    Promise.all(META_KEYS.map((k) => idb.get('meta', newUid, k))),
    idb.getAll('outbox', newUid),
  ]);
  if (ep !== epoch) return;
  const [savedTags, savedTagsLoaded, savedSummary, savedMisses, savedDays, savedKnownAll, savedLastSync] = meta;
  // Anything fetched while the saved copy was being read is newer: keep it.
  for (const t of savedTasks) {
    if (byId.has(t.id) || touched.has(t.id)) continue;
    byId.set(t.id, t);
    confirmed.set(t.id, t);
  }
  if (!tagsLoaded) {
    for (const t of savedTags ?? []) tags.set(t.id, t);
    tagsLoaded = Boolean(savedTagsLoaded);
  }
  for (const [d, c] of savedSummary ?? []) if (!summary.has(d)) summary.set(d, c);
  for (const [d, n] of savedMisses ?? []) if (!misses.has(d)) misses.set(d, n);
  for (const d of savedDays ?? []) if (!loadedAt.has(d)) loadedAt.set(d, 0);
  knownAll = Boolean(savedKnownAll);
  lastSync = savedLastSync ?? 0;
  // Changes made offline (maybe in an earlier visit) are waiting again, in their order.
  ops.sort((a, b) => a.n - b.n);
  for (const op of ops) {
    const mine = ++seq;
    const e = { ...op, mine, restored: true, saved: Promise.resolve(true) };
    if (e.taskId) {
      touched.set(e.taskId, mine);
      latest.set(e.taskId, mine);
    }
    if (e.tagId) tagsTouched = mine;
    markDates(e.dates ?? [], mine, +1);
    outbox.push(e);
    outboxN = Math.max(outboxN, op.n);
  }
  emit();
  syncAll(today).catch(() => {});
}

// ---- Sending changes (the outbox) -------------------------------------------------

/** No connection, a server hiccup, or a sign-in that can't be checked right now: try later. */
const isTransient = (err) => !(err instanceof ApiError)
  || err.status === 0 || err.status === 401 || err.status === 408 || err.status === 429 || err.status >= 500;

function setOnline(v) {
  if (online === v) return;
  online = v;
  if (v) toldOffline = false;
  else resyncAfterFlush = true;
  emit();
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    flush();
  }, retryMs);
  retryMs = Math.min(retryMs * 2, 60000);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    retryMs = 2000;
    flush();
  });
  window.addEventListener('offline', () => setOnline(false));
}

const recordOf = (e) => ({
  key: e.key, n: e.n, kind: e.kind, taskId: e.taskId, tagId: e.tagId, method: e.method, url: e.url,
  body: e.body, label: e.label, dates: e.dates, attempts: e.attempts, createdAt: e.createdAt,
});

/**
 * Queues a change (saved on the device first) and starts sending. Resolves to true once
 * the server has it (offline: when it's back online), false if the server refused it.
 */
function enqueue({ kind, taskId = null, tagId = null, method, url, body, label, dates = [], mine }) {
  const n = Math.max(Date.now() * 1000, outboxN + 1);
  outboxN = n;
  const e = {
    key: String(n), n, kind, taskId, tagId, method, url, body, label, dates, attempts: 0, createdAt: Date.now(), mine,
  };
  const settled = new Promise((resolve) => {
    e.resolve = resolve;
  });
  e.saved = uid ? idb.write('outbox', uid, [[e.key, recordOf(e)]]) : Promise.resolve(false);
  outbox.push(e);
  emit();
  flush();
  return settled;
}

/** Sends waiting changes in order until none are left or the server can't be reached. */
export function flush() {
  if (flushing) return flushing;
  if (!outbox.length) return Promise.resolve();
  const ep = epoch;
  const owner = uid;
  const run = (async () => {
    while (outbox.length && ep === epoch) {
      const e = outbox[0];
      let outcome;
      try {
        outcome = await withLock(owner, () => sendOne(owner, e));
      } catch (err) {
        outcome = { error: err };
      }
      if (ep !== epoch) break;
      const err = outcome.error;
      if (err && isTransient(err)) {
        e.attempts++;
        const offline = err instanceof ApiError && (err.status === 0 || err.status === 401);
        // A server that keeps failing on one change mustn't block everything after it forever.
        if (!offline && e.attempts >= 6) {
          outbox.shift();
          if (owner) await idb.write('outbox', owner, [], [e.key]);
          reject(e, err);
          continue;
        }
        if (!(err instanceof ApiError) || err.status === 0) {
          setOnline(false);
          if (!toldOffline) {
            toldOffline = true;
            showToast("You're offline. Changes are saved here and will sync when you're back online.");
          }
        }
        if (owner) idb.write('outbox', owner, [[e.key, recordOf(e)]]);
        scheduleRetry();
        break;
      }
      outbox.shift();
      if (owner) await idb.write('outbox', owner, [], [e.key]);
      if (err) reject(e, err);
      else {
        setOnline(true);
        retryMs = 2000;
        accept(e, outcome);
      }
    }
  })().finally(() => {
    if (flushing === run) flushing = null; // (another account's send may have started since)
    if (ep === epoch && !outbox.length && resyncAfterFlush) {
      resyncAfterFlush = false;
      syncAll().catch(() => {});
    }
    emit();
  });
  flushing = run;
  emit();
  return run;
}

/** One tab sends at a time, so a change is never sent twice or out of order across tabs. */
function withLock(owner, fn) {
  if (owner && globalThis.navigator?.locks?.request) return navigator.locks.request(`tasks-outbox-${owner}`, fn);
  return fn();
}

async function sendOne(owner, e) {
  const wrote = await e.saved;
  // Another tab (sharing the saved queue) has already sent this one.
  if (wrote && owner && !(await idb.has('outbox', owner, e.key))) return { skipped: true };
  let body = e.body;
  // A task may reach the server after its day has passed (made offline). createdAt (when it was
  // really made) marks it as an existing task: the server only refuses brand-new tasks on past days.
  if (e.kind === 'createTask' && body && body.createdAt === undefined) {
    body = { ...body, createdAt: Math.min(e.createdAt, Date.now()) };
  }
  try {
    return { value: await api(e.method, e.url, body) };
  } catch (err) {
    // Deleting what's already gone is fine (another device, or this change sent twice).
    if (err instanceof ApiError && err.status === 404 && (e.kind === 'deleteTask' || e.kind === 'deleteTag')) return { value: null };
    if (err instanceof ApiError && err.status === 404 && e.kind === 'removeImage') return { value: null, gone: true };
    throw err;
  }
}

function accept(e, outcome) {
  if (e.taskId) {
    const id = e.taskId;
    if (outcome.skipped) {
      if (latest.get(id) === e.mine) latest.delete(id);
    } else {
      let server = outcome.value;
      // Removing an image returns the task, or { deleted: true } when the task itself is gone;
      // a 404 (the image was already gone) leaves the task as it is.
      if (e.kind === 'removeImage') server = outcome.gone ? (byId.get(id) ?? null) : server?.id ? server : null;
      if (server) confirmed.set(id, server);
      else confirmed.delete(id);
      if (latest.get(id) === e.mine) {
        if (server) put(server);
        latest.delete(id);
      }
    }
  } else if (e.tagId && !outcome.skipped && outcome.value && e.kind !== 'deleteTag') {
    // The server's copy (position, logo) wins unless the tag changed here again meanwhile.
    if (tagsTouched <= e.mine && tags.has(e.tagId)) tags.set(e.tagId, outcome.value);
    metaDirty = true;
  }
  markDates(e.dates, e.mine, -1);
  e.resolve?.(true);
  schedulePersist();
  emit();
}

function reject(e, err) {
  if (e.taskId) {
    const id = e.taskId;
    if (latest.get(id) === e.mine) {
      // Back to what the server last confirmed (not to an unconfirmed optimistic state).
      const base = confirmed.get(id);
      if (base) put(base);
      else drop(id);
      latest.delete(id);
    }
  }
  if (e.kind === 'createTag') {
    // The server refused a tag made offline: drop it, and take it off waiting tasks.
    tags.delete(e.tagId);
    for (const o of outbox) {
      if (Array.isArray(o.body?.tagIds) && o.body.tagIds.includes(e.tagId)) {
        o.body = { ...o.body, tagIds: o.body.tagIds.filter((x) => x !== e.tagId) };
        if (uid) idb.write('outbox', uid, [[o.key, recordOf(o)]]);
      }
    }
    for (const t of [...byId.values()]) {
      if (t.tagIds?.includes(e.tagId)) put({ ...t, tagIds: t.tagIds.filter((x) => x !== e.tagId) });
    }
    metaDirty = true;
  } else if (e.tagId) {
    loadTags().catch(() => {});
  }
  markDates(e.dates, e.mine, -1);
  showToast(`${e.label}: ${err.message}`);
  e.resolve?.(false);
  // Fetch again so the screen matches the server (after a reload, "confirmed" is only the saved copy).
  for (const d of e.dates) loadedAt.delete(d);
  resyncAfterFlush = true;
  schedulePersist();
  emit();
}

/** Sends waiting changes first. True when nothing is left waiting (safe to fetch). */
async function drained() {
  if (!outbox.length) return true;
  await flush();
  return outbox.length === 0;
}

const offlineError = () => new ApiError(0, 'You appear to be offline');

// ---- Loading -----------------------------------------------------------------

export async function loadDay(date, today) {
  const ep = epoch;
  if (!(await drained())) throw offlineError();
  if (ep !== epoch) return;
  const startSeq = seq;
  const req = (dayRequest.get(date) ?? 0) + 1;
  dayRequest.set(date, req);
  let res;
  try {
    res = await api('GET', `/api/tasks?date=${date}&today=${today}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) setOnline(false);
    throw err;
  }
  if (ep !== epoch || dayRequest.get(date) !== req) return; // signed out, or a newer fetch exists
  setOnline(true);

  // Local changes made after this fetch started are newer than the response.
  const changedSince = (id) => (touched.get(id) ?? 0) > startSeq || latest.has(id);
  const fresh = [...res.tasks, ...res.overdue];
  const freshIds = new Set(fresh.map((t) => t.id));
  for (const t of fresh) confirmed.set(t.id, t);

  const days = new Set([date]);
  for (const t of [...byId.values()]) {
    if (freshIds.has(t.id) || changedSince(t.id)) continue;
    const onDay = t.date === date;
    const wasOverdue = date === today && t.status === 'pending' && t.date < today;
    if (onDay || wasOverdue) {
      days.add(t.date);
      drop(t.id); // deleted or moved elsewhere on another device
      confirmed.delete(t.id);
    }
  }
  for (const t of fresh) {
    if (changedSince(t.id)) continue;
    const old = byId.get(t.id);
    if (old) days.add(old.date);
    days.add(t.date);
    put(t);
  }
  for (const d of days) recount(d);
  loadedAt.set(date, Date.now());
  metaDirty = true;
  schedulePersist();
  emit();
}

export async function loadSummary(from, to) {
  const ep = epoch;
  const startSeq = seq;
  const res = await api('GET', `/api/summary?from=${from}&to=${to}`);
  if (ep !== epoch) return;
  const got = new Map(res.days.map((d) => [d.date, d]));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    // Skip days with local changes the server may not have seen yet.
    if ((dateTouched.get(d) ?? 0) > startSeq || inflightDates.get(d)) continue;
    const s = got.get(d);
    if (s?.missed) misses.set(d, s.missed);
    else misses.delete(d);
    summary.set(d, s
      ? { pending: s.pending, done: s.done, cancelled: s.cancelled, missed: s.missed ?? 0 }
      : { pending: 0, done: 0, cancelled: 0, missed: 0 });
  }
  metaDirty = true;
  schedulePersist();
  emit();
}

/**
 * Fetches a full copy of the account (every task, tags, missed days) for offline use,
 * after sending any waiting changes. Quietly does nothing without a connection.
 */
export async function syncAll(today = todayKey()) {
  const ep = epoch;
  if (!uid) return false;
  if (!(await drained())) return false;
  if (ep !== epoch) return false;
  const startSeq = seq;
  const startTags = tagsTouched;
  let res;
  try {
    res = await api('GET', `/api/sync?today=${today}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) setOnline(false);
    throw err;
  }
  if (ep !== epoch) return false;
  setOnline(true);
  const changedSince = (id) => (touched.get(id) ?? 0) > startSeq || latest.has(id);
  const freshIds = new Set(res.tasks.map((t) => t.id));
  for (const t of [...byId.values()]) {
    if (freshIds.has(t.id) || changedSince(t.id)) continue;
    byId.delete(t.id); // gone on the server
    confirmed.delete(t.id);
    dirtyTasks.add(t.id);
  }
  for (const t of res.tasks) {
    confirmed.set(t.id, t);
    if (changedSince(t.id)) continue;
    byId.set(t.id, t);
    dirtyTasks.add(t.id);
  }
  if (tagsTouched === startTags && !outbox.some((o) => o.tagId)) {
    tags.clear();
    for (const t of res.tags) tags.set(t.id, t);
    tagsLoaded = true;
  }
  misses.clear();
  for (const m of res.misses) misses.set(m.date, m.missed);
  recountAll();
  knownAll = true;
  lastSync = Date.now();
  metaDirty = true;
  schedulePersist();
  emit();
  return true;
}

/**
 * The month summary from the server, after any waiting changes are sent (the server carries
 * unfinished tasks over when asked, so changes made offline must land first).
 */
export async function fetchStats(from, to, today) {
  if (!(await drained())) throw offlineError();
  return api('GET', `/api/stats?from=${from}&to=${to}&today=${today}`);
}

/** When the last full copy arrived (0 = never). */
export function lastSyncedAt() {
  return lastSync;
}

/**
 * The month summary computed from the offline copy (same shape as /api/stats), for
 * when the server can't be reached.
 */
export function localStats(from, to, today) {
  const days = new Map();
  const day = (date) => {
    if (!days.has(date)) days.set(date, { date, pending: 0, done: 0, cancelled: 0, missed: 0 });
    return days.get(date);
  };
  const byTag = new Map();
  const byPriority = new Map();
  let overdue = 0;
  let postponed = 0;
  const add = (map, key, t) => {
    const c = map.get(key) ?? { pending: 0, done: 0, cancelled: 0 };
    c[t.status]++;
    map.set(key, c);
  };
  for (const t of byId.values()) {
    if (t.date < from || t.date > to) continue;
    day(t.date)[t.status]++;
    if (t.tagIds?.length) for (const id of t.tagIds) add(byTag, id, t);
    else add(byTag, null, t);
    add(byPriority, t.priority, t);
    if (t.carriedFrom || (t.status === 'pending' && t.date < today)) overdue++;
    if (t.postponed > 0) postponed++;
  }
  for (const [date, n] of misses) if (date >= from && date <= to) day(date).missed = n;
  return {
    days: [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    byTag: [...byTag.entries()].map(([tagId, c]) => ({ tagId, ...c })),
    byPriority: [...byPriority.entries()].sort((a, b) => a[0] - b[0]).map(([priority, c]) => ({ priority, ...c })),
    overdue,
    postponed,
    offline: true,
  };
}

// ---- Mutations ---------------------------------------------------------------

/**
 * Applies `nextLocal` (or removes the task when null) right away and queues `request`
 * ({ kind, method, url, body }) for the server. Resolves to true once the server has it
 * (offline: when it's back online), false if the server refused it.
 */
function mutate(id, nextLocal, request, errorLabel) {
  const mine = ++seq;
  const prev = byId.get(id);
  const dates = [...new Set([prev?.date, nextLocal?.date].filter(Boolean))];
  touched.set(id, mine);
  latest.set(id, mine);
  markDates(dates, mine, +1);
  if (nextLocal) put(nextLocal);
  else drop(id);
  schedulePersist();
  emit();
  return enqueue({ ...request, taskId: id, label: errorLabel, dates, mine });
}

/** Returns the new task and a promise: true once the server has it, false if it was refused. */
export function createTask({ title, notes = '', priority = 4, date: wanted, tagIds = [], subtasks = [] }) {
  const now = Date.now();
  // New tasks go on today or later (the server refuses earlier days).
  const date = wanted < todayKey() ? todayKey() : wanted;
  const ids = cleanTagIds(tagIds);
  const status = statusAfterSteps('pending', subtasks);
  const task = {
    id: newId(), title: title.replace(/\s+/g, ' ').trim(), notes: notes.trim(), priority, date,
    status, originalDate: date, postponed: 0, createdAt: now, updatedAt: now,
    completedAt: status === 'done' ? now : null, tagIds: ids, subtasks, attachments: [], carriedFrom: null,
  };
  const saved = mutate(task.id, task, {
    kind: 'createTask', method: 'POST', url: '/api/tasks',
    body: {
      id: task.id, title: task.title, notes: task.notes, priority, date, tagIds: ids, today: todayKey(),
      ...(subtasks.length ? { subtasks } : {}),
    },
  }, "Couldn't add task");
  return { task, saved };
}

/** Applies a partial change; returns the task as it was before (or null if unknown). */
export function updateTask(id, patch) {
  const old = byId.get(id);
  if (!old) return null;
  if (patch.tagIds) patch = { ...patch, tagIds: cleanTagIds(patch.tagIds) };
  const next = { ...old, ...patch, updatedAt: Date.now() };
  if (patch.title !== undefined) next.title = patch.title.replace(/\s+/g, ' ').trim();
  if (patch.notes !== undefined) next.notes = patch.notes.trim();
  // Same rule as the server: moving a task on purpose clears its "from earlier" mark.
  if (patch.date !== undefined && patch.date !== old.date && patch.carriedFrom === undefined) next.carriedFrom = null;
  // Same rule as the server: changing the steps decides done/pending unless a status is given.
  if (patch.subtasks !== undefined && patch.status === undefined) next.status = statusAfterSteps(old.status, patch.subtasks);
  if (next.status !== old.status) next.completedAt = next.status === 'done' ? Date.now() : null;
  mutate(id, next, { kind: 'updateTask', method: 'PATCH', url: `/api/tasks/${id}`, body: patch }, "Couldn't save");
  return old;
}

function setStatus(id, status, message) {
  const old = updateTask(id, { status });
  if (old) showToast(message, () => updateTask(id, { status: old.status }));
}

/** A task with open steps isn't completed directly; the toast offers to tick them all. */
export function completeTask(id) {
  const t = byId.get(id);
  if (!t) return;
  const p = progress(t.subtasks);
  if (p.total > 0 && p.done < p.total) {
    const left = p.total - p.done;
    showToast(`${left} step${left === 1 ? '' : 's'} still open`, () => {
      const cur = byId.get(id);
      if (!cur) return;
      const before = cur.subtasks;
      updateTask(id, { subtasks: setAll(before, true) });
      showToast('All steps done, task completed', () => updateTask(id, { subtasks: before }));
    }, 'Complete all');
    return;
  }
  setStatus(id, 'done', 'Task completed');
}

/** Ticks one step; completing the last one completes the task (with Undo). */
export function toggleStep(id, stepId) {
  const t = byId.get(id);
  if (!t) return;
  const before = t.subtasks ?? [];
  const after = toggle(before, stepId);
  updateTask(id, { subtasks: after });
  if (t.status !== 'done' && statusAfterSteps(t.status, after) === 'done') {
    showToast('All steps done, task completed', () => updateTask(id, { subtasks: before }));
  }
}

// ---- Images ----------------------------------------------------------------------

/** Uploads a prepared image (lib/images.js prepareImage); waits in the queue when offline. */
export function addAttachment(id, img) {
  const old = byId.get(id);
  if (!old) return Promise.resolve(false);
  seedImage(img.id, 'thumb', img.previewUrl);
  saveImageCopy(img); // so it still shows after a reload, before it's uploaded
  const local = { id: img.id, type: 'jpeg', width: img.width, height: img.height, size: 0, createdAt: Date.now(), uploading: true };
  const next = { ...old, attachments: [...(old.attachments ?? []), local] };
  return mutate(id, next, {
    kind: 'addImage', method: 'POST', url: `/api/tasks/${id}/attachments`,
    body: { id: img.id, image: img.image, thumb: img.thumb, width: img.width, height: img.height },
  }, "Couldn't add image");
}

export function removeAttachment(id, attachmentId) {
  const old = byId.get(id);
  if (!old) return Promise.resolve(false);
  const next = { ...old, attachments: (old.attachments ?? []).filter((a) => a.id !== attachmentId) };
  return mutate(id, next, { kind: 'removeImage', method: 'DELETE', url: `/api/attachments/${attachmentId}` }, "Couldn't remove image");
}
export const cancelTask = (id) => setStatus(id, 'cancelled', 'Task cancelled');
export const restoreTask = (id) => setStatus(id, 'pending', 'Task restored');

/** The day a postpone would move a task to: day after today, or after its own date if later. */
export function postponeTarget(task, today) {
  return addDays(task.date > today ? task.date : today, 1);
}

export function postponeTask(id, today = todayKey()) {
  const old = byId.get(id);
  if (!old || old.status !== 'pending') return;
  const target = postponeTarget(old, today);
  const next = { ...old, date: target, postponed: old.postponed + 1, carriedFrom: null, updatedAt: Date.now() };
  // `from` makes a repeat harmless: the server only moves it if it's still on that day.
  mutate(id, next, { kind: 'postpone', method: 'POST', url: `/api/tasks/${id}/postpone`, body: { today, from: old.date } }, "Couldn't postpone");
  const label = shortLabel(target, today);
  showToast(label === 'Tomorrow' ? 'Postponed to tomorrow' : `Postponed to ${label}`,
    () => updateTask(id, { date: old.date, postponed: old.postponed, ...carried(old) }));
}

/** For undo: brings back a task's "from earlier" mark. */
const carried = (t) => (t.carriedFrom ? { carriedFrom: t.carriedFrom } : {});

export function moveTasks(ids, date) {
  const olds = ids.map((id) => byId.get(id)).filter((t) => t && t.date !== date);
  if (!olds.length) return;
  for (const t of olds) updateTask(t.id, { date });
  showToast(`${olds.length} task${olds.length === 1 ? '' : 's'} moved`, () => {
    for (const t of olds) updateTask(t.id, { date: t.date, ...carried(t) });
  });
}

export function deleteTask(id) {
  const old = byId.get(id);
  if (!old) return;
  mutate(id, null, { kind: 'deleteTask', method: 'DELETE', url: `/api/tasks/${id}` }, "Couldn't delete");
  showToast('Task deleted', () => {
    const tagIds = cleanTagIds(old.tagIds ?? []);
    const attachments = (old.attachments ?? []).filter((a) => !a.uploading);
    mutate(id, { ...old, tagIds, attachments }, {
      kind: 'restoreTask', method: 'POST', url: '/api/tasks',
      body: {
        id: old.id, title: old.title, notes: old.notes, priority: old.priority, date: old.date,
        status: old.status, originalDate: old.originalDate, postponed: old.postponed, tagIds,
        ...(old.subtasks?.length ? { subtasks: old.subtasks } : {}),
        createdAt: old.createdAt, ...(old.completedAt ? { completedAt: old.completedAt } : {}),
        ...(old.carriedFrom ? { carriedFrom: old.carriedFrom } : {}),
      },
    }, "Couldn't restore");
  });
}

// ---- Tags ----------------------------------------------------------------------

export function selectTags() {
  return [...tags.values()].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}

export function selectTag(id) {
  return tags.get(id) ?? null;
}

export function areTagsLoaded() {
  return tagsLoaded;
}

export async function loadTags() {
  const ep = epoch;
  const startTags = tagsTouched;
  const res = await api('GET', '/api/tags');
  if (ep !== epoch) return;
  // Tag changes still waiting to be sent win over this (older) copy.
  if (tagsTouched !== startTags || outbox.some((o) => o.tagId)) return;
  tags.clear();
  for (const t of res.tags) tags.set(t.id, t);
  tagsLoaded = true;
  metaDirty = true;
  schedulePersist();
  emit();
}

const sameName = (a, b) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * Saves a tag. Online (and nothing waiting), it waits for the server so a name clash shows
 * in the form. Offline, it's checked here and queued.
 */
export async function saveTag(id, data) {
  const ep = epoch;
  const tagId = id ?? newId();
  const body = id ? data : { id: tagId, ...data };
  if (!outbox.length) {
    try {
      const tag = id ? await api('PATCH', `/api/tags/${id}`, data) : await api('POST', '/api/tags', body);
      if (ep !== epoch) return tag;
      setOnline(true);
      tags.set(tag.id, tag);
      tagsTouched = ++seq;
      metaDirty = true;
      schedulePersist();
      emit();
      return tag;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 0) throw err;
      setOnline(false); // fall through: save it offline
    }
  }
  if (data.name !== undefined && [...tags.values()].some((t) => t.id !== tagId && sameName(t.name, data.name))) {
    throw new ApiError(409, 'A tag with that name already exists');
  }
  const old = tags.get(tagId);
  const now = Date.now();
  const position = old?.position ?? Math.max(-1, ...[...tags.values()].map((t) => t.position ?? 0)) + 1;
  const local = { ...(old ?? { createdAt: now, color: 'blue', logo: null }), ...data, id: tagId, position: data.position ?? position, updatedAt: now };
  if (local.name !== undefined) local.name = local.name.trim();
  tags.set(tagId, local);
  tagsLoaded = true;
  const mine = ++seq;
  tagsTouched = mine;
  metaDirty = true;
  schedulePersist();
  emit();
  enqueue({
    kind: id ? 'updateTag' : 'createTag', tagId, method: id ? 'PATCH' : 'POST', url: id ? `/api/tags/${id}` : '/api/tags',
    body, label: "Couldn't save tag", mine,
  });
  return local;
}

export async function removeTag(id) {
  const mine = ++seq;
  tagsTouched = mine;
  tags.delete(id);
  const strip = (t) => ({ ...t, tagIds: t.tagIds.filter((x) => x !== id) });
  for (const t of [...byId.values()]) if (t.tagIds?.includes(id)) {
    byId.set(t.id, strip(t));
    dirtyTasks.add(t.id);
  }
  for (const [k, t] of confirmed) if (t.tagIds?.includes(id)) confirmed.set(k, strip(t));
  metaDirty = true;
  schedulePersist();
  emit();
  // Not awaited: offline it waits in the queue; a refusal shows a message and reloads the tags.
  enqueue({ kind: 'deleteTag', tagId: id, method: 'DELETE', url: `/api/tags/${id}`, label: "Couldn't delete tag", mine });
}
