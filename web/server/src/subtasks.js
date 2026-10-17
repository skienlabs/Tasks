// Sub-tasks ("steps"): a small tree stored with the task. Each item is
// { id, parentId, title, done }. Array order is display order among siblings.
// Only leaves (items without children) are checked off by hand; a parent is done
// when all of its children are, and the task itself is done when every leaf is.

export const MAX_SUBTASKS = 100;
export const MAX_DEPTH = 4; // a step, its sub-step, ... four levels deep
export const SUBTASK_TITLE_MAX = 300;

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍⁠﻿]/g;

export class SubtaskError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

/** Validates and cleans a sub-task list. Parent "done" flags are recomputed from their children. */
export function normalizeSubtasks(list) {
  if (!Array.isArray(list)) throw new SubtaskError('Steps must be a list');
  if (list.length > MAX_SUBTASKS) throw new SubtaskError(`A task can have at most ${MAX_SUBTASKS} steps`);
  const byId = new Map();
  const items = list.map((s) => {
    if (!s || typeof s !== 'object' || !ID_RE.test(s.id ?? '')) throw new SubtaskError('Step id is not valid');
    if (byId.has(s.id)) throw new SubtaskError('Step ids must be unique');
    const title = String(s.title ?? '').toWellFormed().normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
    if (!title) throw new SubtaskError('Step title cannot be empty');
    if (title.length > SUBTASK_TITLE_MAX) throw new SubtaskError(`Step titles can be at most ${SUBTASK_TITLE_MAX} characters`);
    const item = { id: s.id, parentId: s.parentId ?? null, title, done: s.done === true };
    byId.set(item.id, item);
    return item;
  });
  for (const item of items) {
    if (item.parentId === null) continue;
    if (!byId.has(item.parentId) || item.parentId === item.id) throw new SubtaskError('Step parent not found');
  }
  // Depth and cycles: walk up from each item.
  for (const item of items) {
    let depth = 1;
    let p = item.parentId;
    while (p !== null) {
      depth++;
      if (depth > MAX_DEPTH) throw new SubtaskError(`Steps can be nested at most ${MAX_DEPTH} levels deep`);
      p = byId.get(p).parentId;
    }
  }
  // Parent done = all children done (deepest first, so it propagates upwards).
  const children = childMap(items);
  const depthOf = (it) => { let d = 0; for (let p = it.parentId; p !== null; p = byId.get(p).parentId) d++; return d; };
  [...items].sort((a, b) => depthOf(b) - depthOf(a)).forEach((it) => {
    const kids = children.get(it.id);
    if (kids && kids.length) it.done = kids.every((k) => k.done);
  });
  return items;
}

function childMap(items) {
  const m = new Map();
  for (const it of items) {
    if (it.parentId === null) continue;
    if (!m.has(it.parentId)) m.set(it.parentId, []);
    m.get(it.parentId).push(it);
  }
  return m;
}

/** Leaf counts: { done, total }. */
export function progress(items) {
  const parents = new Set(items.map((i) => i.parentId).filter((p) => p !== null));
  const leaves = items.filter((i) => !parents.has(i.id));
  return { done: leaves.filter((l) => l.done).length, total: leaves.length };
}

export function allDone(items) {
  const p = progress(items);
  return p.total > 0 && p.done === p.total;
}
