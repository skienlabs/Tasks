// Calendar days are plain "YYYY-MM-DD" strings in the browser's local time.

const pad = (n) => String(n).padStart(2, '0');

export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return toKey(new Date());
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

// Same range the server accepts.
export const MIN_DATE = '1900-01-01';
export const MAX_DATE = '2999-12-31';

export function isValidKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= MIN_DATE && key <= MAX_DATE
    && toKey(fromKey(key)) === key;
}

export function diffDays(from, to) {
  return Math.round((fromKey(to) - fromKey(from)) / 86400000);
}

export function startOfWeek(key, weekStart = 0) {
  const d = fromKey(key);
  return addDays(key, -((d.getDay() - weekStart + 7) % 7));
}

export function monthGrid(year, month, weekStart = 0) {
  const first = toKey(new Date(year, month, 1));
  const start = startOfWeek(first, weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const fmtCache = new Map();
function fmt(opts) {
  const k = JSON.stringify(opts);
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat(undefined, opts));
  return fmtCache.get(k);
}

export const formatDate = (key, opts) => fmt(opts).format(fromKey(key));

export function relativeLabel(key, today) {
  const diff = diffDays(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatDate(key, { weekday: 'long' });
}

export function shortLabel(key, today) {
  const diff = diffDays(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return formatDate(key, sameYear
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function weekdayNames(weekStart = 0) {
  const base = new Date(2023, 0, 1); // a Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + ((i + weekStart) % 7));
    return fmt({ weekday: 'narrow' }).format(d);
  });
}

/** "From yesterday" / "From Fri, 16 Oct": where a carried-over task came from. */
export function carriedLabel(from, today) {
  const label = shortLabel(from, today);
  return label === 'Yesterday' ? 'From yesterday' : `From ${label}`;
}

/** True when a task was moved here on its own from an earlier day. */
export const isCarried = (task) => Boolean(task.carriedFrom && task.carriedFrom < task.date);
