// Task search: free text plus filters, ranked, with suggestions for what's being typed.
//
//   invoice              words must all match (title, tag name, steps or notes)
//   "mail server"        a phrase
//   #skien  tag:skien    tag (name prefix, any case)
//   is:open is:done is:cancelled is:late(carried over / from an earlier day)
//   p:high p:medium p:low p:none (or p:1..4, priority:...)
//   date:today date:tomorrow date:yesterday date:week date:month date:2026-10-22
//   before:2026-10-01  after:2026-10-01
//   has:steps has:images has:notes
// Same search as the server (web/server/src/search.js), for when there's no connection.
import { addDays, isValidKey as isValidDate } from './dates.js';

const PRIORITY = { high: 1, h: 1, 1: 1, medium: 2, med: 2, m: 2, 2: 2, low: 3, l: 3, 3: 3, none: 4, no: 4, 4: 4 };
const STATUS = { open: 'pending', pending: 'pending', todo: 'pending', done: 'done', completed: 'done', cancelled: 'cancelled', canceled: 'cancelled' };

/** A tag name as typed in a filter: folded, without spaces ("Skien Labs" → "skienlabs"). */
const tagKey = (name) => fold(name).replace(/\s+/g, '');

/** Lower-case, accents removed: "Éclair" and "eclair" match. */
export function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function startOfWeek(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -d.getUTCDay()); // weeks start on Sunday, like the apps
}

/** Splits the query into text terms, phrases and filters. Unknown "x:y" stays as text. */
export function parseQuery(q, today) {
  const out = { terms: [], phrases: [], tags: [], status: null, late: false, priority: null, from: null, to: null, has: [] };
  const src = String(q ?? '').slice(0, 200);
  const re = /"([^"]*)"?|(\S+)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) {
      const p = fold(m[1]).trim();
      if (p) out.phrases.push(p);
      continue;
    }
    const tok = m[2];
    const t = fold(tok);
    const kv = /^([a-z]+):(.*)$/.exec(t);
    if (t.startsWith('#') && t.length > 1) { out.tags.push(t.slice(1)); continue; }
    if (kv) {
      const [, k, v] = kv;
      if ((k === 'tag' || k === 't') && v) { out.tags.push(v); continue; }
      if (k === 'is' && STATUS[v]) { out.status = STATUS[v]; continue; }
      if (k === 'is' && (v === 'late' || v === 'carried' || v === 'overdue')) { out.late = true; continue; }
      if ((k === 'p' || k === 'priority') && PRIORITY[v]) { out.priority = PRIORITY[v]; continue; }
      if (k === 'has' && ['steps', 'images', 'notes'].includes(v)) { out.has.push(v); continue; }
      if (k === 'date' || k === 'on') {
        const range = {
          today: [today, today], tomorrow: [addDays(today, 1), addDays(today, 1)],
          yesterday: [addDays(today, -1), addDays(today, -1)],
          week: [startOfWeek(today), addDays(startOfWeek(today), 6)],
          month: [`${today.slice(0, 7)}-01`, `${today.slice(0, 7)}-31`],
        }[v] ?? (isValidDate(v) ? [v, v] : null);
        if (range) { [out.from, out.to] = range; continue; }
      }
      if (k === 'before' && isValidDate(v)) { out.to = addDays(v, -1); continue; }
      if (k === 'after' && isValidDate(v)) { out.from = addDays(v, 1); continue; }
    }
    out.terms.push(t);
  }
  return out;
}

export const hasFilters = (p) => Boolean(p.tags.length || p.status || p.late || p.priority || p.from || p.to || p.has.length);

/** True when `a` and `b` are at most `max` typos apart (a swap of two letters counts as one). */
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(rows[i - 1][j] + 1, cur[j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      cur[j] = v;
      best = Math.min(best, v);
    }
    if (best > max) return false;
    rows.push(cur);
  }
  return rows[a.length][b.length] <= max;
}

const words = (s) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The part of `text` around the first match, for showing why a task matched. */
function snippet(text, needle) {
  const i = fold(text).indexOf(needle);
  if (i < 0) return text.slice(0, 90);
  const start = Math.max(0, i - 30);
  return (start > 0 ? '…' : '') + text.slice(start, start + 90).trim() + (start + 90 < text.length ? '…' : '');
}

/**
 * Scores one task. Returns null when it doesn't match. Every term and phrase must match
 * somewhere; the title counts most (start of title > start of a word > anywhere), then the
 * tag name, steps, and notes.
 */
function scoreTask(task, tagNames, needles, fuzzy) {
  const title = fold(task.title);
  const titleWords = words(task.title);
  const notes = fold(task.notes);
  const steps = (task.subtasks ?? []).map((s) => ({ raw: s.title, f: fold(s.title) }));
  const tags = tagNames.map(fold);
  let score = 0;
  let match = null;
  for (const n of needles) {
    let s = 0;
    if (title.startsWith(n)) s = 40;
    else if (titleWords.some((w) => w.startsWith(n))) s = 30;
    else if (title.includes(n)) s = 18;
    else if (fuzzy && n.length >= 4 && titleWords.some((w) => within(n, w.slice(0, n.length + 1), 1) || within(n, w, 1))) s = 12;
    if (!s && tags.some((t) => t.startsWith(n))) s = 14;
    else if (!s && tags.some((t) => t.includes(n))) s = 10;
    if (!s) {
      const step = steps.find((x) => x.f.includes(n));
      if (step) { s = 8; match = match ?? { field: 'step', text: step.raw }; }
    }
    if (!s && notes.includes(n)) { s = 5; match = match ?? { field: 'notes', text: snippet(task.notes, n) }; }
    if (!s) return null;
    score += s;
  }
  return { score, match };
}

/**
 * Runs a parsed query over the user's tasks. `tags` are the user's tags (for names and
 * filters). Returns ranked results, plus whether typo-tolerant matching was needed.
 */
export function searchTasks(tasks, tags, parsed, today, limit = 30) {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const wantTags = parsed.tags.map((q) => tags.filter((t) => tagKey(t.name).startsWith(q)).map((t) => t.id));
  const needles = [...parsed.terms, ...parsed.phrases];
  const filtered = tasks.filter((t) => {
    if (parsed.status && t.status !== parsed.status) return false;
    if (parsed.late && !(t.carriedFrom && t.carriedFrom < t.date) && !(t.status === 'pending' && t.date < today)) return false;
    if (parsed.priority && t.priority !== parsed.priority) return false;
    if (parsed.from && t.date < parsed.from) return false;
    if (parsed.to && t.date > parsed.to) return false;
    if (parsed.has.includes('steps') && !(t.subtasks ?? []).length) return false;
    if (parsed.has.includes('images') && !(t.attachments ?? []).length) return false;
    if (parsed.has.includes('notes') && !t.notes) return false;
    for (const ids of wantTags) if (!ids.some((id) => (t.tagIds ?? []).includes(id))) return false;
    return true;
  });

  const run = (fuzzy) => {
    const out = [];
    for (const t of filtered) {
      const names = (t.tagIds ?? []).map((id) => tagById.get(id)?.name).filter(Boolean);
      const r = needles.length ? scoreTask(t, names, needles, fuzzy) : { score: 0, match: null };
      if (!r) continue;
      let score = r.score;
      if (parsed.phrases.length === 0 && needles.length > 1 && fold(t.title).includes(needles.join(' '))) score += 25;
      if (t.status === 'pending') score += 6;
      // Nearer days first among equals: today and the next week, then the recent past.
      const gap = Math.abs((Date.parse(t.date) - Date.parse(today)) / 86400000);
      score += Math.max(0, 6 - Math.min(6, gap / 3));
      out.push({ task: t, score, match: r.match });
    }
    return out;
  };
  let results = run(false);
  let fuzzy = false;
  if (!results.length && needles.some((n) => n.length >= 4)) {
    results = run(true);
    fuzzy = results.length > 0;
  }
  results.sort((a, b) => b.score - a.score || (a.task.status === 'pending' ? -1 : 0) - (b.task.status === 'pending' ? -1 : 0)
    || (a.task.date < b.task.date ? 1 : a.task.date > b.task.date ? -1 : 0));
  return { total: results.length, results: results.slice(0, limit), fuzzy, terms: needles };
}

/**
 * Suggestions for the word being typed (the last token): tag names for "#sk" / "tag:sk",
 * filter values for "is:", "p:", "date:", "has:", and title words / titles otherwise.
 */
export function suggest(q, tasks, tags) {
  const src = String(q ?? '');
  if (/\s$/.test(src)) return [];
  const last = fold(src.split(/\s+/).pop() ?? '');
  if (!last) return [];
  const pick = (prefix, values) => values
    .filter((v) => v.startsWith(last.slice(prefix.length)) && `${prefix}${v}` !== last)
    .slice(0, 6).map((v) => ({ kind: 'filter', insert: `${prefix}${v}` }));
  if (last.startsWith('#') || last.startsWith('tag:')) {
    const prefix = last.startsWith('#') ? '#' : 'tag:';
    const qn = last.slice(prefix.length);
    return tags.filter((t) => tagKey(t.name).startsWith(qn) && `${prefix}${tagKey(t.name)}` !== last)
      .slice(0, 6)
      .map((t) => ({ kind: 'tag', insert: `${prefix}${tagKey(t.name)}`, label: t.name, tagId: t.id }));
  }
  if (last.startsWith('is:')) return pick('is:', ['open', 'done', 'cancelled', 'late']);
  if (last.startsWith('p:')) return pick('p:', ['high', 'medium', 'low', 'none']);
  if (last.startsWith('date:')) return pick('date:', ['today', 'tomorrow', 'yesterday', 'week', 'month']);
  if (last.startsWith('has:')) return pick('has:', ['steps', 'images', 'notes']);
  if (last.length < 2) return [];
  // Words from titles that start with what's typed, most frequent first.
  const counts = new Map();
  for (const t of tasks) for (const w of words(t.title)) if (w.length > last.length && w.startsWith(last)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const out = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
    .map(([w]) => ({ kind: 'word', insert: w }));
  for (const t of tags) if (tagKey(t.name).startsWith(last)) out.unshift({ kind: 'tag', insert: `#${tagKey(t.name)}`, label: t.name, tagId: t.id });
  return out.slice(0, 6);
}
