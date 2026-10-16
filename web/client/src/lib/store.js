// Tiny client-side store. Every change is applied locally first (instant UI),
// then sent to the server; on failure it is rolled back to the last state the
// server confirmed.
//
// Rules that keep it correct under races:
// - Writes for the same task run strictly in order (one queue per task).
// - A fetch never overwrites (or deletes) a task changed locally after that
//   fetch started, and an older fetch for a day is ignored if a newer one ran.
// - Everything async checks `epoch`, which changes on sign-out/account switch,
//   so one account's late responses can never land in another account.

import { useSyncExternalStore } from 'react';
import { api, newId } from './api.js';
import { addDays, shortLabel, todayKey } from './dates.js';

export const MAX_TAGS_PER_TASK = 10;

const byId = new Map(); // id -> task as shown
const confirmed = new Map(); // id -> last task state the server confirmed
const touched = new Map(); // id -> seq of the latest local change
const latest = new Map(); // id -> seq of the newest in-flight change
const queues = new Map(); // id -> promise chain of server writes
const loadedAt = new Map(); // date -> time of last successful day fetch
const dayRequest = new Map(); // date -> counter of the newest day fetch
const summary = new Map(); // date -> { pending, done, cancelled }
const dateTouched = new Map(); // date -> seq of the latest local change on that date
const inflightDates = new Map(); // date -> number of writes in flight touching it
const tags = new Map(); // id -> tag
let tagsLoaded = false;
let seq = 0;
let epoch = 0;
let version = 0;
let toast = null;
const listeners = new Set();

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

const STATUS_ORDER = { pending: 0, done: 1, cancelled: 2 };

function byPriority(a, b) {
  return a.priority - b.priority || a.createdAt - b.createdAt;
}

export function selectDay(date) {
  const list = [];
  for (const t of byId.values()) if (t.date === date) list.push(t);
  return list.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byPriority(a, b));
}

export function selectOverdue(today) {
  const list = [];
  for (const t of byId.values()) if (t.status === 'pending' && t.date < today) list.push(t);
  return list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byPriority(a, b)));
}

export function selectSummary(date) {
  return summary.get(date);
}

export function isDayLoaded(date) {
  return loadedAt.has(date);
}

export function getTask(id) {
  return byId.get(id) ?? null;
}

// ---- Local bookkeeping -------------------------------------------------------

function bump(task, sign) {
  const s = { pending: 0, done: 0, cancelled: 0, ...summary.get(task.date) };
  s[task.status] = Math.max(0, s[task.status] + sign);
  summary.set(task.date, s);
}

function put(task) {
  const old = byId.get(task.id);
  if (old) bump(old, -1);
  byId.set(task.id, task);
  bump(task, +1);
}

function drop(id) {
  const old = byId.get(id);
  if (!old) return;
  bump(old, -1);
  byId.delete(id);
}

function recount(date) {
  const s = { pending: 0, done: 0, cancelled: 0 };
  for (const t of byId.values()) if (t.date === date) s[t.status]++;
  summary.set(date, s);
}

/** Keeps only tag ids that exist; if tags haven't loaded yet, keeps them as they are. */
function cleanTagIds(ids) {
  const unique = [...new Set(ids)];
  return (tagsLoaded ? unique.filter((id) => tags.has(id)) : unique).slice(0, MAX_TAGS_PER_TASK).sort();
}

// ---- Loading -----------------------------------------------------------------

export function clearStore() {
  epoch++;
  for (const m of [byId, confirmed, touched, latest, queues, loadedAt, dayRequest, summary, dateTouched, inflightDates, tags]) m.clear();
  tagsLoaded = false;
  toast = null;
  emit();
}

export async function loadDay(date, today) {
  const ep = epoch;
  const startSeq = seq;
  const req = (dayRequest.get(date) ?? 0) + 1;
  dayRequest.set(date, req);
  const res = await api('GET', `/api/tasks?date=${date}&today=${today}`);
  if (ep !== epoch || dayRequest.get(date) !== req) return; // signed out, or a newer fetch exists

  // Local changes made after this fetch started are newer than the response.
  const changedSince = (id) => (touched.get(id) ?? 0) > startSeq || latest.has(id);
  const fresh = [...res.tasks, ...res.overdue];
  const freshIds = new Set(fresh.map((t) => t.id));
  for (const t of fresh) confirmed.set(t.id, t);

  for (const t of [...byId.values()]) {
    if (freshIds.has(t.id) || changedSince(t.id)) continue;
    const onDay = t.date === date;
    const wasOverdue = date === today && t.status === 'pending' && t.date < today;
    if (onDay || wasOverdue) {
      byId.delete(t.id); // deleted or moved elsewhere on another device
      confirmed.delete(t.id);
    }
  }
  for (const t of fresh) if (!changedSince(t.id)) byId.set(t.id, t);
  recount(date);
  loadedAt.set(date, Date.now());
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
    summary.set(d, s ? { pending: s.pending, done: s.done, cancelled: s.cancelled } : { pending: 0, done: 0, cancelled: 0 });
  }
  emit();
}

// ---- Mutations ---------------------------------------------------------------

function markDates(dates, mine, delta) {
  for (const d of dates) {
    if (delta > 0) dateTouched.set(d, mine);
    const n = (inflightDates.get(d) ?? 0) + delta;
    if (n > 0) inflightDates.set(d, n);
    else inflightDates.delete(d);
  }
}

/**
 * Applies `nextLocal` (or removes the task when null) right away, then runs
 * `request` after any earlier write for the same task. Resolves to true when
 * the server accepted it.
 */
function mutate(id, nextLocal, request, errorLabel) {
  const ep = epoch;
  const mine = ++seq;
  const prev = byId.get(id);
  const dates = [...new Set([prev?.date, nextLocal?.date].filter(Boolean))];
  touched.set(id, mine);
  latest.set(id, mine);
  markDates(dates, mine, +1);
  if (nextLocal) put(nextLocal);
  else drop(id);
  emit();

  const run = (queues.get(id) || Promise.resolve()).then(async () => {
    if (ep !== epoch) return false; // account changed before this write ran
    try {
      const server = await request();
      if (ep !== epoch) return false;
      if (server) confirmed.set(id, server);
      else confirmed.delete(id); // deleted
      if (latest.get(id) === mine) {
        if (server) put(server);
        latest.delete(id);
        emit();
      }
      return true;
    } catch (err) {
      if (ep !== epoch) return false;
      if (latest.get(id) === mine) {
        // Back to what the server last confirmed (not to an unconfirmed optimistic state).
        const base = confirmed.get(id);
        if (base) put(base);
        else drop(id);
        latest.delete(id);
      }
      showToast(`${errorLabel}: ${err.message}`);
      emit();
      return false;
    } finally {
      if (ep === epoch) markDates(dates, mine, -1);
    }
  });
  queues.set(id, run);
  run.finally(() => {
    if (queues.get(id) === run) queues.delete(id);
  });
  return run;
}

/** Returns the new task and a promise resolving to true once the server saved it. */
export function createTask({ title, notes = '', priority = 4, date, tagIds = [] }) {
  const now = Date.now();
  const ids = cleanTagIds(tagIds);
  const task = {
    id: newId(), title: title.replace(/\s+/g, ' ').trim(), notes: notes.trim(), priority, date,
    status: 'pending', originalDate: date, postponed: 0, createdAt: now, updatedAt: now, completedAt: null,
    tagIds: ids,
  };
  const saved = mutate(task.id, task, () => api('POST', '/api/tasks', {
    id: task.id, title: task.title, notes: task.notes, priority, date, tagIds: ids,
  }), "Couldn't add task");
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
  if (patch.status && patch.status !== old.status) next.completedAt = patch.status === 'done' ? Date.now() : null;
  mutate(id, next, () => api('PATCH', `/api/tasks/${id}`, patch), "Couldn't save");
  return old;
}

function setStatus(id, status, message) {
  const old = updateTask(id, { status });
  if (old) showToast(message, () => updateTask(id, { status: old.status }));
}

export const completeTask = (id) => setStatus(id, 'done', 'Task completed');
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
  const next = { ...old, date: target, postponed: old.postponed + 1, updatedAt: Date.now() };
  mutate(id, next, () => api('POST', `/api/tasks/${id}/postpone`, { today }), "Couldn't postpone");
  const label = shortLabel(target, today);
  showToast(label === 'Tomorrow' ? 'Postponed to tomorrow' : `Postponed to ${label}`,
    () => updateTask(id, { date: old.date, postponed: old.postponed }));
}

export function moveTasks(ids, date) {
  const olds = ids.map((id) => byId.get(id)).filter((t) => t && t.date !== date);
  if (!olds.length) return;
  for (const t of olds) updateTask(t.id, { date });
  showToast(`${olds.length} task${olds.length === 1 ? '' : 's'} moved`, () => {
    for (const t of olds) updateTask(t.id, { date: t.date });
  });
}

export function deleteTask(id) {
  const old = byId.get(id);
  if (!old) return;
  mutate(id, null, () => api('DELETE', `/api/tasks/${id}`), "Couldn't delete");
  showToast('Task deleted', () => {
    const tagIds = cleanTagIds(old.tagIds ?? []);
    mutate(id, { ...old, tagIds }, () => api('POST', '/api/tasks', {
      id: old.id, title: old.title, notes: old.notes, priority: old.priority, date: old.date,
      status: old.status, originalDate: old.originalDate, postponed: old.postponed, tagIds,
      createdAt: old.createdAt, ...(old.completedAt ? { completedAt: old.completedAt } : {}),
    }), "Couldn't restore");
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
  const res = await api('GET', '/api/tags');
  if (ep !== epoch) return;
  tags.clear();
  for (const t of res.tags) tags.set(t.id, t);
  tagsLoaded = true;
  emit();
}

/** Tag writes wait for the server so name clashes are reported in the form. */
export async function saveTag(id, data) {
  const ep = epoch;
  const tag = id
    ? await api('PATCH', `/api/tags/${id}`, data)
    : await api('POST', '/api/tags', { id: newId(), ...data });
  if (ep !== epoch) return tag;
  tags.set(tag.id, tag);
  emit();
  return tag;
}

export async function removeTag(id) {
  const ep = epoch;
  await api('DELETE', `/api/tags/${id}`);
  if (ep !== epoch) return;
  tags.delete(id);
  const strip = (t) => ({ ...t, tagIds: t.tagIds.filter((x) => x !== id) });
  for (const [k, t] of byId) if (t.tagIds?.includes(id)) byId.set(k, strip(t));
  for (const [k, t] of confirmed) if (t.tagIds?.includes(id)) confirmed.set(k, strip(t));
  emit();
}
