// The one order tasks are listed in (same as the Android app's TaskOrder):
//  1. open, then done, then cancelled;
//  2. priority: High, Medium, Low, None;
//  3. company: tasks of the same tag together, tags A–Z, untagged last;
//  4. title A–Z, numbers read as numbers ("Server 9" before "Server 10").
// A task's company is its first tag in the user's own tag order.

const STATUS_ORDER = { pending: 0, done: 1, cancelled: 2 };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const naturalCompare = (a, b) => collator.compare((a ?? '').trim(), (b ?? '').trim());

/** The task's tags in the user's order (`tags` is already in that order). */
export function tagsOf(task, tags) {
  const ids = task.tagIds ?? [];
  return ids.length ? tags.filter((t) => ids.includes(t.id)) : [];
}

/** Comparator for a list of tasks, given the user's tags in their order. */
export function taskComparator(tags) {
  const index = new Map(tags.map((t, i) => [t.id, i]));
  const company = (task) => {
    let best = null;
    let bestI = Infinity;
    for (const id of task.tagIds ?? []) {
      const i = index.get(id);
      if (i !== undefined && i < bestI) {
        bestI = i;
        best = tags[i];
      }
    }
    return best;
  };
  const prio = (t) => Math.min(4, Math.max(1, t.priority ?? 4));
  return (a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2);
    if (s) return s;
    const p = prio(a) - prio(b);
    if (p) return p;
    const ca = company(a);
    const cb = company(b);
    if (ca !== cb) {
      if (!ca) return 1;
      if (!cb) return -1;
      const c = naturalCompare(ca.name, cb.name) || (ca.id < cb.id ? -1 : 1);
      if (c) return c;
    }
    return naturalCompare(a.title, b.title) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
}
