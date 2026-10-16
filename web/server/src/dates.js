// Dates are calendar days ("YYYY-MM-DD") in the user's own time zone.
// The browser decides what "today" is and sends it; the server never guesses.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2999;

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(value, days) {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function maxDate(a, b) {
  return a >= b ? a : b;
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
