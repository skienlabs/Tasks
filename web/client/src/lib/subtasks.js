// Steps (sub-tasks) of a task: a small tree [{ id, parentId, title, done }].
// Same rules as the server (server/src/subtasks.js): only leaves are checked by
// hand, a parent is done when all of its children are, and the task is done when
// every leaf is.
import { newId } from './api.js';

export const MAX_STEPS = 100;
export const MAX_DEPTH = 4;

export function childrenOf(list, parentId) {
  return list.filter((s) => (s.parentId ?? null) === parentId);
}

function hasChildren(list, id) {
  return list.some((s) => s.parentId === id);
}

export function depthOf(list, id) {
  const byId = new Map(list.map((s) => [s.id, s]));
  let d = 1;
  for (let p = byId.get(id)?.parentId ?? null; p !== null && byId.has(p); p = byId.get(p).parentId ?? null) d++;
  return d;
}

/** Recomputes parent "done" flags from their children. */
export function normalize(list) {
  const out = list.map((s) => ({ ...s, parentId: s.parentId ?? null, done: Boolean(s.done) }));
  const byId = new Map(out.map((s) => [s.id, s]));
  const depth = (s) => { let d = 0; for (let p = s.parentId; p !== null && byId.has(p); p = byId.get(p).parentId) d++; return d; };
  [...out].sort((a, b) => depth(b) - depth(a)).forEach((s) => {
    const kids = out.filter((k) => k.parentId === s.id);
    if (kids.length) s.done = kids.every((k) => k.done);
  });
  return out;
}

/** Leaf counts: { done, total }. */
export function progress(list = []) {
  const parents = new Set(list.map((s) => s.parentId).filter(Boolean));
  const leaves = list.filter((s) => !parents.has(s.id));
  return { done: leaves.filter((s) => s.done).length, total: leaves.length };
}

/** Ticks a step. A step with sub-steps ticks (or unticks) all of them. */
export function toggle(list, id) {
  const target = list.find((s) => s.id === id);
  if (!target) return list;
  const value = !target.done;
  const ids = new Set([id, ...descendants(list, id)]);
  return normalize(list.map((s) => (ids.has(s.id) ? { ...s, done: value } : s)));
}

export function setAll(list, done) {
  return normalize(list.map((s) => ({ ...s, done })));
}

export function descendants(list, id) {
  const out = [];
  const walk = (pid) => {
    for (const s of list) if (s.parentId === pid) { out.push(s.id); walk(s.id); }
  };
  walk(id);
  return out;
}

/** Adds a step at the end of its siblings. Returns the new list (unchanged if a limit is hit). */
export function add(list, title, parentId = null) {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!t || list.length >= MAX_STEPS) return list;
  if (parentId && depthOf(list, parentId) >= MAX_DEPTH) return list;
  const step = { id: newId(), parentId, title: t.slice(0, 300), done: false };
  // Insert after the parent's last descendant, so the array reads top to bottom.
  let at = list.length;
  if (parentId) {
    const sub = new Set([parentId, ...descendants(list, parentId)]);
    let last = -1;
    list.forEach((s, i) => { if (sub.has(s.id)) last = i; });
    at = last + 1;
  }
  return normalize([...list.slice(0, at), step, ...list.slice(at)]);
}

export function remove(list, id) {
  const gone = new Set([id, ...descendants(list, id)]);
  return normalize(list.filter((s) => !gone.has(s.id)));
}

export function rename(list, id, title) {
  const t = title.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!t) return list;
  return list.map((s) => (s.id === id ? { ...s, title: t } : s));
}

/** Flattened tree in display order with depth, for rendering. */
export function flatten(list) {
  const out = [];
  const walk = (pid, depth) => {
    for (const s of list) {
      if ((s.parentId ?? null) !== pid) continue;
      out.push({ step: s, depth, leaf: !hasChildren(list, s.id) });
      walk(s.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Status the server will give the task after its steps change (see server resolveStatus). */
export function statusAfterSteps(currentStatus, list) {
  const p = progress(list);
  if (p.total === 0 || currentStatus === 'cancelled') return currentStatus;
  return p.done === p.total ? 'done' : 'pending';
}
