// Time limits ("due at"): a local date and time on the device, "2026-10-30T17:00".
import { useSyncExternalStore } from 'react';
import { addDays, todayKey } from './dates.js';

const RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function parseDue(value) {
  const m = RE.exec(value || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');
export const toDueValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** A real date and time (no 31 Feb or 25:00). Checked by its parts: a time inside a clock change still counts. */
export function isValidDue(value) {
  const m = RE.exec(value || '');
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days && h <= 23 && mi <= 59;
}

/**
 * A sensible first value when the time limit is switched on: 6 pm on the task's day, or
 * an hour from now (on the quarter hour) when that's already past.
 */
export function defaultDue(date, now = new Date()) {
  const [y, m, d] = (date || todayKey()).split('-').map(Number);
  const evening = new Date(y, m - 1, d, 18, 0);
  if (evening.getTime() > now.getTime() + 30 * 60_000) return toDueValue(evening);
  const soon = new Date(now.getTime() + 60 * 60_000);
  soon.setMinutes(Math.ceil(soon.getMinutes() / 15) * 15, 0, 0);
  return toDueValue(soon);
}

function dayWord(d, now) {
  const key = toDueValue(d).slice(0, 10);
  const today = toDueValue(now).slice(0, 10);
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  const days = Math.round((d - now) / 86_400_000);
  if (days > -7 && days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}

function span(ms) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 && h < 10 ? `${h}h ${min % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 && d < 3 ? `${d}d ${h % 24}h` : `${d}d`;
}

/**
 * How a time limit reads right now: "Due Fri 5:00 PM", with "2d left" / "Overdue 3h"; `tone`
 * is 'over' (passed), 'soon' (within 24 hours) or 'later'. `done` tasks just show the time.
 */
export function describeDue(value, now = new Date(), { done = false, completedAt = null } = {}) {
  const d = parseDue(value);
  if (!d) return null;
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const label = `${dayWord(d, now)} ${time}`;
  const full = d.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  if (done) {
    const late = completedAt && completedAt > d.getTime();
    return { label, full, left: late ? `finished ${span(completedAt - d.getTime())} late` : 'on time', tone: late ? 'late' : 'met' };
  }
  const ms = d.getTime() - now.getTime();
  if (ms <= 0) return { label, full, left: `overdue ${span(-ms)}`, tone: 'over' };
  return { label, full, left: `${span(ms)} left`, tone: ms < 86_400_000 ? 'soon' : 'later' };
}

// One shared clock for every countdown on screen, ticking each half minute.
let now = Date.now();
const subs = new Set();
let timer = null;
function subscribe(f) {
  subs.add(f);
  if (Date.now() - now > 1000) {
    // Nothing was ticking for a while: catch up at once.
    now = Date.now();
    queueMicrotask(() => subs.forEach((s) => s()));
  }
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      subs.forEach((s) => s());
    }, 30_000);
  }
  return () => {
    subs.delete(f);
    if (!subs.size) {
      clearInterval(timer);
      timer = null;
    }
  };
}
export function useNow() {
  return new Date(useSyncExternalStore(subscribe, () => now));
}
