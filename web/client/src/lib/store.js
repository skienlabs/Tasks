// Tiny client-side store. Every change is applied locally first (instant UI),
// then sent to the server; on failure the change is rolled back.

import { useSyncExternalStore } from 'react';
import { api, newId } from './api.js';
import { addDays, todayKey } from './dates.js';

const byId = new Map(); // id -> task
const loadedAt = new Map(); // date -> timestamp of last successful fetch
const summary = new Map(); // date -> { pending, done, cancelled }
const latest = new Map(); // id -> sequence number of the newest local change
const queues = new Map(); // id -> promise chain, keeps server writes in order
const tags = new Map(); // id -> tag
let tagsLoaded = false;
let seq = 0;
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

export function showToast(message, undo) {
  toast = { key: ++seq, message, undo };
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

// ---- Loading -----------------------------------------------------------------

export function clearStore() {
  tags.clear();
  tagsLoaded = false;
  byId.clear();
  loadedAt.clear();
  summary.clear();
  latest.clear();
  toast = null;
  emit();
}

export async function loadDay(date, today) {
  const res = await api('GET', `/api/tasks?date=${date}&today=${today}`);
  const busy = (id) => latest.has(id);
  const fresh = new Set(res.tasks.map((t) => t.id));
  for (const t of byId.values()) {
    if (t.date === date && !fresh.has(t.id) && !busy(t.id)) byId.delete(t.id);
  }
  if (date === today) {
    const overdue = new Set(res.overdue.map((t) => t.id));
    for (const t of byId.values()) {
      if (t.status === 'pending' && t.date < today && !overdue.has(t.id) && !busy(t.id)) byId.delete(t.id);
    }
  }
  for (const t of [...res.tasks, ...res.overdue]) if (!busy(t.id)) byId.set(t.id, t);
  recount(date);
  loadedAt.set(date, Date.now());
  emit();
}

export async function loadSummary(from, to) {
  const res = await api('GET', `/api/summary?from=${from}&to=${to}`);
  const got = new Map(res.days.map((d) => [d.date, d]));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (loadedAt.has(d)) continue; // a loaded day is already exact locally
    const s = got.get(d);
    summary.set(d, s ? { pending: s.pending, done: s.done, cancelled: s.cancelled } : { pending: 0, done: 0, cancelled: 0 });
  }
  emit();
}

// ---- Mutations ---------------------------------------------------------------

function mutate(id, nextLocal, request, errorLabel) {
  const before = byId.get(id);
  const mine = ++seq;
  latest.set(id, mine);
  if (nextLocal) put(nextLocal);
  else drop(id);
  emit();

  const run = (queues.get(id) || Promise.resolve()).then(async () => {
    try {
      const server = await request();
      if (latest.get(id) === mine) {
        if (server) put(server);
        latest.delete(id);
        emit();
      }
    } catch (err) {
      if (latest.get(id) === mine) {
        if (before) put(before);
        else drop(id);
        latest.delete(id);
        showToast(`${errorLabel}: ${err.message}`);
      }
    }
  });
  queues.set(id, run);
  run.finally(() => {
    if (queues.get(id) === run) queues.delete(id);
  });
  return run;
}

export function createTask({ title, notes = '', priority = 4, date, tagIds = [] }) {
  const now = Date.now();
  const ids = [...new Set(tagIds)].filter((id) => tags.has(id)).sort();
  const task = {
    id: newId(), title: title.replace(/\s+/g, ' ').trim(), notes: notes.trim(), priority, date,
    status: 'pending', originalDate: date, postponed: 0, createdAt: now, updatedAt: now, completedAt: null,
    tagIds: ids,
  };
  mutate(task.id, task, () => api('POST', '/api/tasks', {
    id: task.id, title: task.title, notes: task.notes, priority, date, tagIds: ids,
  }), "Couldn't add task");
  return task;
}

/** Applies a partial change; returns the task as it was before. */
export function updateTask(id, patch) {
  const old = byId.get(id);
  if (!old) return null;
  if (patch.tagIds) patch = { ...patch, tagIds: [...new Set(patch.tagIds)].filter((x) => tags.has(x)).sort() };
  const next = { ...old, ...patch, updatedAt: Date.now() };
  if (patch.title !== undefined) next.title = patch.title.replace(/\s+/g, ' ').trim();
  if (patch.notes !== undefined) next.notes = patch.notes.trim();
  if (patch.status && patch.status !== old.status) next.completedAt = patch.status === 'done' ? Date.now() : null;
  mutate(id, next, () => api('PATCH', `/api/tasks/${id}`, patch), "Couldn't save");
  return old;
}

export function getTask(id) {
  return byId.get(id) ?? null;
}

function setStatus(id, status, message) {
  const old = updateTask(id, { status });
  if (old) showToast(message, () => updateTask(id, { status: old.status }));
}

export const completeTask = (id) => setStatus(id, 'done', 'Task completed');
export const cancelTask = (id) => setStatus(id, 'cancelled', 'Task cancelled');
export const restoreTask = (id) => setStatus(id, 'pending', 'Task restored');

export function postponeTask(id, today = todayKey()) {
  const old = byId.get(id);
  if (!old || old.status !== 'pending') return;
  const base = old.date > today ? old.date : today;
  const next = { ...old, date: addDays(base, 1), postponed: old.postponed + 1, updatedAt: Date.now() };
  mutate(id, next, () => api('POST', `/api/tasks/${id}/postpone`, { today }), "Couldn't postpone");
  showToast('Postponed to tomorrow', () => updateTask(id, { date: old.date, postponed: old.postponed }));
}

export function moveTasks(ids, date) {
  const olds = ids.map((id) => byId.get(id)).filter(Boolean);
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
    mutate(id, old, () => api('POST', '/api/tasks', {
      id: old.id, title: old.title, notes: old.notes, priority: old.priority, date: old.date,
      status: old.status, originalDate: old.originalDate, postponed: old.postponed,
      tagIds: (old.tagIds ?? []).filter((t) => tags.has(t)),
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
  const res = await api('GET', '/api/tags');
  tags.clear();
  for (const t of res.tags) tags.set(t.id, t);
  tagsLoaded = true;
  emit();
}

/** Tag writes wait for the server so name clashes are reported in the form. */
export async function saveTag(id, data) {
  const tag = id
    ? await api('PATCH', `/api/tags/${id}`, data)
    : await api('POST', '/api/tags', { id: newId(), ...data });
  tags.set(tag.id, tag);
  emit();
  return tag;
}

export async function removeTag(id) {
  await api('DELETE', `/api/tags/${id}`);
  tags.delete(id);
  for (const t of byId.values()) {
    if (t.tagIds?.includes(id)) byId.set(t.id, { ...t, tagIds: t.tagIds.filter((x) => x !== id) });
  }
  emit();
}
