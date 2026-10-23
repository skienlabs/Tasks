import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { buildApp } from '../src/app.js';
import { createVerifier } from '../src/auth.js';
import { loadConfig, parseFirebaseWebConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { addDays, isValidDate } from '../src/dates.js';

const PROJECT = 'tasks-test';

async function setup({ allowList = [] } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const verify = createVerifier({ projectId: PROJECT, allowList, keys: createLocalJWKSet({ keys: [jwk] }) });
  const db = openDb(':memory:');
  const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-files-'));
  const app = buildApp({
    db, verify, config: { firebase: { projectId: PROJECT }, devAuth: false, staticDir: '/nonexistent', filesDir },
    clock: () => Date.parse('2026-10-17T09:00:00Z'), // the tests' "today"
  });

  async function token(sub, extra = {}, opts = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      auth_time: now, email: `${sub}@example.com`, email_verified: true,
      firebase: { sign_in_provider: 'google.com' }, ...extra,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
      .setAudience(opts.aud ?? PROJECT)
      .setSubject(sub)
      .setIssuedAt(opts.iat ?? now)
      .setExpirationTime(opts.exp ?? now + 3600)
      .sign(opts.key ?? privateKey);
  }

  async function as(sub) {
    const auth = { authorization: `Bearer ${await token(sub)}` };
    return (method, url, payload) => app.inject({ method, url, payload, headers: auth });
  }
  return { app, token, as, db, filesDir };
}

test('dates', () => {
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('firebase config parsing accepts JSON and console snippets', () => {
  const json = parseFirebaseWebConfig('{"apiKey":"a","authDomain":"x.firebaseapp.com","projectId":"x","appId":"1:2:web:3"}');
  assert.deepEqual(json, { apiKey: 'a', authDomain: 'x.firebaseapp.com', projectId: 'x', appId: '1:2:web:3' });
  const snippet = parseFirebaseWebConfig(`const firebaseConfig = {
    apiKey: "a", authDomain: 'x.firebaseapp.com', projectId: "x",
  };`);
  assert.equal(snippet.projectId, 'x');
  assert.throws(() => parseFirebaseWebConfig('{"type":"service_account","project_id":"x"}'), /service-account/);
  assert.throws(() => parseFirebaseWebConfig('{"apiKey":"a"}'), /missing/);
});

test('public endpoints and auth rejection', async () => {
  const { app, token } = await setup();
  assert.equal((await app.inject('/api/health')).statusCode, 200);
  const cfg = (await app.inject('/api/config')).json();
  assert.equal(cfg.configured, true);

  assert.equal((await app.inject('/api/tasks?date=2026-10-17')).statusCode, 401);
  const bad = async (t) =>
    (await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${t}` } })).statusCode;
  assert.equal(await bad('garbage'), 401);
  assert.equal(await bad(await token('u1', {}, { aud: 'other' })), 401);
  assert.equal(await bad(await token('u1', {}, { iss: 'https://evil' })), 401);
  assert.equal(await bad(await token('u1', {}, { exp: Math.floor(Date.now() / 1000) - 3600 })), 401);
  const other = await generateKeyPair('RS256');
  assert.equal(await bad(await token('u1', {}, { key: other.privateKey })), 401);
  assert.equal(await bad(await token('u1')), 200);
});

test('allow list', async () => {
  const { app, token } = await setup({ allowList: ['me@example.com', '@corp.com'] });
  const code = async (t) =>
    (await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${t}` } })).statusCode;
  assert.equal(await code(await token('me')), 200);
  assert.equal(await code(await token('x', { email: 'Boss@Corp.com' })), 200);
  assert.equal(await code(await token('you')), 403);
  assert.equal(await code(await token('me', { email_verified: false })), 403);
  const r = await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${await token('me', { email_verified: false })}` } });
  assert.match(r.json().error, /verify your email/);
});

test('task lifecycle, carry-over, postpone, isolation', async () => {
  const { as } = await setup();
  const u1 = await as('alice');
  const u2 = await as('bob');
  const today = '2026-10-17';
  const yesterday = '2026-10-16';

  // Create
  let r = await u1('POST', '/api/tasks', { title: '  Old   task ', date: yesterday, priority: 1 });
  assert.equal(r.statusCode, 201);
  const old = r.json();
  assert.equal(old.title, 'Old task');
  assert.equal(old.status, 'pending');
  assert.equal(old.originalDate, yesterday);

  r = await u1('POST', '/api/tasks', { id: 'client-id-0001', title: 'Today low', date: today, priority: 3 });
  assert.equal(r.statusCode, 201);
  r = await u1('POST', '/api/tasks', { id: 'client-id-0001', title: 'Retry', date: today });
  assert.equal(r.statusCode, 200, 'same id retried is idempotent');
  assert.equal(r.json().title, 'Today low');
  r = await u1('POST', '/api/tasks', { title: 'Today high', date: today, priority: 1 });
  const high = r.json();

  // Validation
  assert.equal((await u1('POST', '/api/tasks', { title: '   ', date: today })).statusCode, 400);
  assert.equal((await u1('POST', '/api/tasks', { title: 'x', date: '2026-02-30' })).statusCode, 400);
  assert.equal((await u1('POST', '/api/tasks', { title: 'x', date: today, priority: 9 })).statusCode, 400);
  assert.equal((await u1('POST', '/api/tasks', { title: 'x', date: today, uid: 'bob' })).statusCode, 400);

  // Opening today moves yesterday's unfinished task onto today, marked with the day it came from
  r = await u1('GET', `/api/tasks?date=${today}&today=${today}`);
  let body = r.json();
  assert.deepEqual(body.overdue, []);
  assert.deepEqual(body.tasks.map((t) => t.title), ['Old task', 'Today high', 'Today low']);
  assert.equal(body.tasks[0].carriedFrom, yesterday);
  assert.equal(body.tasks[0].date, today);
  assert.equal(body.tasks[1].carriedFrom, null);

  // Yesterday is now empty
  r = await u1('GET', `/api/tasks?date=${yesterday}&today=${today}`);
  assert.deepEqual(r.json().overdue, []);
  assert.equal(r.json().tasks.length, 0);

  // Another user sees nothing and cannot touch alice's tasks
  r = await u2('GET', `/api/tasks?date=${today}&today=${today}`);
  assert.deepEqual(r.json(), { tasks: [], overdue: [] });
  assert.equal((await u2('PATCH', `/api/tasks/${high.id}`, { status: 'done' })).statusCode, 404);
  assert.equal((await u2('DELETE', `/api/tasks/${high.id}`)).statusCode, 404);
  assert.equal((await u2('POST', '/api/tasks', { id: 'client-id-0001', title: 'steal', date: today })).statusCode, 409);

  // Postpone the carried task: tomorrow, and no longer "from earlier" (it was moved on purpose)
  r = await u1('POST', `/api/tasks/${old.id}/postpone`, { today });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().date, '2026-10-18');
  assert.equal(r.json().postponed, 1);
  assert.equal(r.json().originalDate, yesterday);
  assert.equal(r.json().carriedFrom, null);
  // Postpone again from a future date: day after its own date
  r = await u1('POST', `/api/tasks/${old.id}/postpone`, { today });
  assert.equal(r.json().date, '2026-10-19');
  assert.equal(r.json().postponed, 2);
  r = await u1('GET', `/api/tasks?date=${today}&today=${today}`);
  assert.deepEqual(r.json().overdue, []);

  // Complete, then reopen
  r = await u1('PATCH', `/api/tasks/${high.id}`, { status: 'done' });
  assert.equal(r.json().status, 'done');
  assert.ok(r.json().completedAt);
  assert.equal((await u1('POST', `/api/tasks/${high.id}/postpone`, { today })).statusCode, 409);
  r = await u1('PATCH', `/api/tasks/${high.id}`, { status: 'pending' });
  assert.equal(r.json().completedAt, null);

  // Cancel
  r = await u1('PATCH', `/api/tasks/${high.id}`, { status: 'cancelled' });
  assert.equal(r.json().status, 'cancelled');

  // Edit
  r = await u1('PATCH', `/api/tasks/${high.id}`, { title: 'Renamed', notes: ' n ', priority: 2, date: '2026-10-20' });
  assert.equal(r.json().title, 'Renamed');
  assert.equal(r.json().notes, 'n');
  assert.equal(r.json().date, '2026-10-20');
  assert.equal((await u1('PATCH', `/api/tasks/${high.id}`, {})).statusCode, 400);

  // Summary
  r = await u1('GET', '/api/summary?from=2026-10-01&to=2026-10-31');
  assert.deepEqual(r.json().days, [
    // Yesterday keeps the task it left unfinished (carried to today) as "missed".
    { date: yesterday, pending: 0, done: 0, cancelled: 0, missed: 1 },
    { date: today, pending: 1, done: 0, cancelled: 0, missed: 0 },
    { date: '2026-10-19', pending: 1, done: 0, cancelled: 0, missed: 0 },
    { date: '2026-10-20', pending: 0, done: 0, cancelled: 1, missed: 0 },
  ]);
  assert.equal((await u1('GET', '/api/summary?from=2026-01-01&to=2026-12-31')).statusCode, 400);

  // Delete, and undo by re-creating with the same id and fields
  assert.equal((await u1('DELETE', `/api/tasks/${high.id}`)).statusCode, 204);
  assert.equal((await u1('DELETE', `/api/tasks/${high.id}`)).statusCode, 404);
  r = await u1('POST', '/api/tasks', {
    id: high.id, title: 'Renamed', date: '2026-10-20', status: 'cancelled', originalDate: today, postponed: 0,
  });
  assert.equal(r.statusCode, 201);
  assert.equal(r.json().originalDate, today);
});

test('carry-over: only unfinished tasks, keeps the first missed day, ignores a wrong clock', async () => {
  const { as } = await setup();
  const u = await as('alice');
  const mk = async (title, date, extra = {}) => (await u('POST', '/api/tasks', { title, date, ...extra })).json();
  // Past days only take tasks restored by Undo (they carry createdAt), so seed them that way.
  const a = await mk('Two days old', '2026-10-15', { createdAt: 1 });
  const done = await mk('Done earlier', '2026-10-15', { status: 'done', createdAt: 2 });
  const cancelled = await mk('Cancelled earlier', '2026-10-16', { status: 'cancelled' });
  const future = await mk('Next week', '2026-10-24');

  // A device whose clock says next month must not move anything
  let r = await u('GET', '/api/tasks?date=2026-11-20&today=2026-11-20');
  assert.equal(r.json().tasks.length, 0);
  assert.equal((await u('GET', '/api/tasks?date=2026-10-15&today=2026-10-15')).json().tasks.length, 2);

  // Yesterday (in the user's zone) is still within a day of the server: carried there first
  r = await u('GET', '/api/tasks?date=2026-10-16&today=2026-10-16');
  assert.deepEqual(r.json().tasks.map((t) => t.title).sort(), ['Cancelled earlier', 'Two days old']);
  // ... then on to today, still remembering the 15th
  r = await u('GET', '/api/tasks?date=2026-10-17&today=2026-10-17');
  const carried = r.json().tasks.find((t) => t.id === a.id);
  assert.equal(carried.carriedFrom, '2026-10-15');

  // Done, cancelled and future tasks stay where they are
  const day = async (d) => (await u('GET', `/api/tasks?date=${d}`)).json().tasks.map((t) => t.id);
  assert.deepEqual(await day('2026-10-15'), [done.id]);
  assert.deepEqual(await day('2026-10-16'), [cancelled.id]);
  assert.deepEqual(await day('2026-10-24'), [future.id]);

  // Completing keeps the mark; moving it to a day on purpose clears it
  r = await u('PATCH', `/api/tasks/${a.id}`, { status: 'done' });
  assert.equal(r.json().carriedFrom, '2026-10-15');
  r = await u('PATCH', `/api/tasks/${a.id}`, { status: 'pending', date: '2026-10-20' });
  assert.equal(r.json().carriedFrom, null);

  // No new tasks on past days (the device's today wins; Undo may restore to an old day)
  r = await u('POST', '/api/tasks', { title: 'Late', date: '2026-10-16', today: '2026-10-17' });
  assert.equal(r.statusCode, 400);
  assert.match(r.json().error, /today or a later day/);
  assert.equal((await u('POST', '/api/tasks', { title: 'Fine', date: '2026-10-17', today: '2026-10-17' })).statusCode, 201);
  assert.equal((await u('POST', '/api/tasks', { title: 'Old app', date: '2026-10-15' })).statusCode, 400);
  assert.equal((await u('POST', '/api/tasks', { title: 'Old app, west', date: '2026-10-16' })).statusCode, 201, 'still today in UTC-12');
  assert.equal((await u('POST', '/api/tasks', { id: 'undo-old-day-1', title: 'Undo', date: '2026-10-10', createdAt: 5 })).statusCode, 201);

  // Undo of a move restores the mark (only if it is still earlier than the task's day)
  r = await u('PATCH', `/api/tasks/${a.id}`, { date: '2026-10-17', carriedFrom: '2026-10-15' });
  assert.equal(r.json().carriedFrom, '2026-10-15');
  r = await u('PATCH', `/api/tasks/${a.id}`, { carriedFrom: '2026-10-18' });
  assert.equal(r.json().carriedFrom, null);
  assert.equal((await u('PATCH', `/api/tasks/${a.id}`, { carriedFrom: '2026-02-30' })).statusCode, 400);

  // Undo of a delete restores the mark
  r = await u('POST', '/api/tasks', { id: 'undo-carried-1', title: 'Back', date: '2026-10-17', carriedFrom: '2026-10-14' });
  assert.equal(r.json().carriedFrom, '2026-10-14');
  r = await u('POST', '/api/tasks', { id: 'undo-carried-2', title: 'Odd', date: '2026-10-17', carriedFrom: '2026-10-19' });
  assert.equal(r.json().carriedFrom, null, 'a "from" day after its own day is ignored');
});

test('offline copy (/api/sync) and safe replays of offline changes', async () => {
  const { as } = await setup();
  const u = await as('alice');
  const bob = await as('bob');
  const today = '2026-10-17';
  const tag = (await u('POST', '/api/tags', { name: 'Skien', color: 'blue' })).json();
  const old = (await u('POST', '/api/tasks', { id: 'offline-old-1', title: 'Left yesterday', date: '2026-10-16', createdAt: 1, tagIds: [tag.id] })).json();
  const mine = (await u('POST', '/api/tasks', { title: 'Today', date: today, today })).json();
  await bob('POST', '/api/tasks', { title: 'Not yours', date: today, today });

  // Sync carries unfinished work over first, then returns everything (own data only).
  let r = await u('GET', `/api/sync?today=${today}`);
  assert.equal(r.statusCode, 200);
  const s = r.json();
  assert.deepEqual(s.tasks.map((t) => t.id).sort(), [old.id, mine.id].sort());
  assert.equal(s.tasks.find((t) => t.id === old.id).date, today);
  assert.deepEqual(s.tags.map((t) => t.id), [tag.id]);
  assert.deepEqual(s.misses, [{ date: '2026-10-16', missed: 1 }]);
  assert.equal(typeof s.serverTime, 'number');
  assert.equal((await u('GET', '/api/sync?today=nope')).statusCode, 400);

  // A postpone sent twice (the reply was lost) moves the task once.
  r = await u('POST', `/api/tasks/${mine.id}/postpone`, { today, from: today });
  assert.equal(r.json().date, '2026-10-18');
  r = await u('POST', `/api/tasks/${mine.id}/postpone`, { today, from: today });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().date, '2026-10-18');
  assert.equal(r.json().postponed, 1);

  // Postponed offline, but carry-over moved it to today before the postpone arrived: it still applies.
  const late = (await u('POST', '/api/tasks', { id: 'offline-late-1', title: 'Late', date: '2026-10-16', createdAt: 1 })).json();
  await u('GET', `/api/sync?today=${today}`); // carried to the 17th
  r = await u('POST', `/api/tasks/${late.id}/postpone`, { today: '2026-10-16', from: '2026-10-16' });
  assert.equal(r.json().date, '2026-10-18');
  assert.equal(r.json().postponed, 1);
  assert.equal(r.json().carriedFrom, null);

  // A create made offline yesterday (it carries createdAt) is still accepted today.
  r = await u('POST', '/api/tasks', { id: 'made-offline-1', title: 'Offline', date: '2026-10-16', today: '2026-10-16', createdAt: Date.parse('2026-10-16T20:00:00Z') });
  assert.equal(r.statusCode, 201);
  // ...and sending it again returns the same task.
  r = await u('POST', '/api/tasks', { id: 'made-offline-1', title: 'Offline', date: '2026-10-16', today: '2026-10-16', createdAt: Date.parse('2026-10-16T20:00:00Z') });
  assert.equal(r.statusCode, 200);
});

test('migration v6 backfills missed days from carried_from', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-mig6-')), 'tasks.db');
  let db = openDb(file);
  db.exec(`DROP TABLE task_misses; PRAGMA user_version = 5;`);
  db.prepare(`INSERT INTO tasks (id, uid, title, date, original_date, created_at, updated_at, carried_from)
    VALUES ('carried-task-1', 'u', 'Late', '2026-10-17', '2026-10-14', 1, 1, '2026-10-14')`).run();
  db.close();
  db = openDb(file);
  const days = db.prepare("SELECT date FROM task_misses WHERE task_id = 'carried-task-1' ORDER BY date").all().map((r) => r.date);
  assert.deepEqual(days, ['2026-10-14', '2026-10-15', '2026-10-16']);
  // A task carried for a long time keeps its most recent 92 days (the ones the summary shows).
  db.exec(`DROP TABLE task_misses; PRAGMA user_version = 5;`);
  db.prepare(`INSERT INTO tasks (id, uid, title, date, original_date, created_at, updated_at, carried_from)
    VALUES ('carried-task-2', 'u', 'Very late', '2026-10-17', '2026-01-01', 1, 1, '2026-01-01')`).run();
  db.close();
  db = openDb(file);
  const long = db.prepare("SELECT date FROM task_misses WHERE task_id = 'carried-task-2' ORDER BY date").all().map((r) => r.date);
  assert.equal(long.length, 92);
  assert.equal(long[0], '2026-07-17');
  assert.equal(long.at(-1), '2026-10-16');
  db.close();
});

test('search: ranking, filters, phrases, typos, suggestions, isolation', async () => {
  const { as } = await setup();
  const u = await as('alice');
  const other = await as('bob');
  const today = '2026-10-17';
  const skien = (await u('POST', '/api/tags', { name: 'Skien Labs', color: 'blue' })).json();
  const softop = (await u('POST', '/api/tags', { name: 'Softop', color: 'orange' })).json();
  const mk = async (title, extra = {}) => (await u('POST', '/api/tasks', { title, date: today, today, ...extra })).json();
  const a = await mk('Mail server setup', { tagIds: [skien.id], priority: 1, subtasks: [{ id: 'st-aaaaaaaa1', parentId: null, title: 'Open ports 25 and 587', done: false }] });
  const b = await mk('Review the mail templates', { tagIds: [softop.id], notes: 'Check the invoice footer' });
  const c = await mk('Invoice for September', { tagIds: [softop.id], status: 'done' });
  await mk('Gym');
  await other('POST', '/api/tasks', { title: 'Mail from bob', date: today, today });

  const q = async (query) => (await u('GET', `/api/search?q=${encodeURIComponent(query)}&today=${today}`)).json();
  let r = await q('mail');
  assert.deepEqual(r.results.map((x) => x.id), [a.id, b.id], 'title start ranks first; other users never show');
  r = await q('ports');
  assert.deepEqual(r.results.map((x) => x.id), [a.id]);
  assert.deepEqual(r.results[0].match, { field: 'step', text: 'Open ports 25 and 587' });
  r = await q('invoice');
  assert.deepEqual(r.results.map((x) => x.id), [c.id, b.id], 'title beats notes');
  assert.equal(r.results[1].match.field, 'notes');
  assert.equal((await q('invoice is:open')).results.map((x) => x.id).join(), b.id);
  assert.equal((await q('#softop is:done')).results.map((x) => x.id).join(), c.id);
  // Impossible dates are ignored (no error), real ones filter.
  for (const bad of ['before:2026-13-40', 'after:2026-02-30', 'date:2026-02-31']) {
    assert.equal((await u('GET', `/api/search?q=${encodeURIComponent(`mail ${bad}`)}&today=${today}`)).statusCode, 200, bad);
  }
  assert.equal((await q('mail after:2026-10-17')).results.length, 0);
  assert.equal((await q('mail before:2026-10-18')).results.length, 2);
  assert.equal((await q('tag:skienlabs')).results.map((x) => x.id).join(), a.id, 'multi-word tag names, no spaces');
  assert.equal((await q('p:high')).results.map((x) => x.id).join(), a.id);
  assert.equal((await q('has:notes')).results.map((x) => x.id).join(), b.id);
  assert.equal((await q('"templates mail"')).results.length, 0, 'phrase must match as written');
  assert.equal((await q('templates mail')).results.map((x) => x.id).join(), b.id, 'words match in any order');
  assert.equal((await q('"the mail"')).results.map((x) => x.id).join(), b.id);
  r = await q('sevrer');
  assert.equal(r.fuzzy, true, 'typo-tolerant when nothing matches exactly');
  assert.equal(r.results[0].id, a.id);
  assert.equal((await q('date:yesterday')).results.length, 0);
  assert.equal((await q('date:today Gym')).results.length, 1);

  // Suggestions for the word being typed
  r = await q('#so');
  assert.deepEqual(r.suggestions.map((s) => s.insert), ['#softop']);
  assert.equal(r.suggestions[0].label, 'Softop');
  r = await q('is:');
  assert.deepEqual(r.suggestions.map((s) => s.insert), ['is:open', 'is:done', 'is:cancelled', 'is:late']);
  r = await q('ma');
  assert.ok(r.suggestions.some((s) => s.insert === 'mail'));
  r = await q('');
  assert.deepEqual(r, { results: [], total: 0, fuzzy: false, terms: [], suggestions: [] });
  assert.equal((await u('GET', `/api/search?q=${'x'.repeat(201)}`)).statusCode, 400);
  // The apps ask for a page size; it arrives as text.
  const limited = await (await u('GET', `/api/search?q=is:open&today=${today}&limit=1`)).json();
  assert.equal(limited.results.length, 1);
  assert.ok(limited.total > 1);
  assert.equal((await u('GET', `/api/search?q=a&limit=40`)).statusCode, 200);
  assert.equal((await u('GET', `/api/search?q=a&limit=0`)).statusCode, 400);
  assert.equal((await u('GET', `/api/search?q=a&limit=101`)).statusCode, 400);
});

test('unknown api path is 404 json, bad json is 400', async () => {
  const { app, as } = await setup();
  const u = await as('alice');
  assert.equal((await u('GET', '/api/nope')).statusCode, 404);
  const r = await app.inject({
    method: 'POST', url: '/api/tasks', payload: '{bad', headers: { 'content-type': 'application/json' },
  });
  assert.ok([400, 401].includes(r.statusCode));
});

test('serves the web app: compression, caching, SPA fallback', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const zlib = await import('node:zlib');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-static-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  const html = '<!doctype html><title>Tasks</title>' + 'x'.repeat(2000);
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'index.html.br'), zlib.brotliCompressSync(html));
  fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  const app = buildApp({
    db: openDb(':memory:'),
    verify: async () => ({ uid: 'u' }),
    config: { firebase: null, devAuth: false, staticDir: dir },
  });

  let r = await app.inject({ url: '/', headers: { 'accept-encoding': 'br' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-encoding'], 'br');
  assert.equal(r.headers['cache-control'], 'no-cache');

  r = await app.inject('/assets/app-abc123.js');
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['cache-control'], /immutable/);

  r = await app.inject('/some/deep/route?d=2026-10-17');
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /<title>Tasks<\/title>/);
  assert.equal(r.headers['x-frame-options'], 'DENY');

  assert.equal((await app.inject('/missing.png')).statusCode, 404);
  assert.equal((await app.inject('/api/unknown')).statusCode, 404);
  assert.equal((await app.inject({ method: 'HEAD', url: '/some/deep/route' })).statusCode, 200);
  const cfg = (await app.inject('/api/config')).json();
  assert.equal(cfg.configured, false);
});

test('tags: CRUD, ownership, task assignment, stats', async () => {
  const { as } = await setup();
  const u1 = await as('alice');
  const u2 = await as('bob');
  const today = '2026-10-17';
  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  let r = await u1('POST', '/api/tags', { name: ' Skien  Labs ', color: 'blue', logo });
  assert.equal(r.statusCode, 201);
  const skien = r.json();
  assert.equal(skien.name, 'Skien Labs');
  assert.equal(skien.logo, logo);
  r = await u1('POST', '/api/tags', { id: 'tag-zupnex-01', name: 'ZupNex', color: 'green' });
  const zup = r.json();
  assert.equal(zup.position, 1);

  // Validation
  assert.equal((await u1('POST', '/api/tags', { name: 'skien labs' })).statusCode, 409, 'case-insensitive unique');
  assert.equal((await u1('POST', '/api/tags', { name: 'x', color: 'neon' })).statusCode, 400);
  assert.equal((await u1('POST', '/api/tags', { name: 'x', logo: 'data:image/svg+xml;base64,PHN2Zz4=' })).statusCode, 400);
  assert.equal((await u1('POST', '/api/tags', { name: 'x', logo: 'javascript:alert(1)' })).statusCode, 400);
  assert.equal((await u1('POST', '/api/tags', { name: '   ' })).statusCode, 400);

  // Bob can't see or use Alice's tags
  assert.deepEqual((await u2('GET', '/api/tags')).json().tags, []);
  assert.equal((await u2('POST', '/api/tasks', { title: 't', date: today, tagIds: [zup.id] })).statusCode, 400);
  assert.equal((await u2('PATCH', `/api/tags/${zup.id}`, { name: 'mine' })).statusCode, 404);
  assert.equal((await u2('DELETE', `/api/tags/${zup.id}`)).statusCode, 404);

  // Assign on create and patch
  r = await u1('POST', '/api/tasks', { title: 'Deploy', date: today, tagIds: [zup.id, skien.id] });
  assert.equal(r.statusCode, 201);
  const task = r.json();
  assert.deepEqual(task.tagIds, [skien.id, zup.id].sort());
  r = await u1('POST', '/api/tasks', { title: 'No tag', date: today });
  assert.deepEqual(r.json().tagIds, []);
  r = await u1('PATCH', `/api/tasks/${task.id}`, { tagIds: [zup.id] });
  assert.deepEqual(r.json().tagIds, [zup.id]);
  r = await u1('PATCH', `/api/tasks/${task.id}`, { title: 'Deploy app' });
  assert.deepEqual(r.json().tagIds, [zup.id], 'tags kept when not sent');
  r = await u1('POST', `/api/tasks/${task.id}/postpone`, { today });
  assert.deepEqual(r.json().tagIds, [zup.id], 'tags kept on postpone');
  assert.equal((await u1('PATCH', `/api/tasks/${task.id}`, { tagIds: ['nope-nope-1'] })).statusCode, 400);
  assert.equal((await u1('PATCH', `/api/tasks/${task.id}`, { tagIds: [zup.id, zup.id] })).statusCode, 400);

  // Rename / recolor / remove logo
  r = await u1('PATCH', `/api/tags/${skien.id}`, { name: 'Skien', color: 'purple', logo: null });
  assert.equal(r.json().name, 'Skien');
  assert.equal(r.json().logo, null);
  assert.equal((await u1('PATCH', `/api/tags/${skien.id}`, { name: 'zupnex' })).statusCode, 409);

  // Stats
  await u1('POST', '/api/tasks', { title: 'Old', date: '2026-10-10', tagIds: [skien.id], createdAt: 1 });
  await u1('POST', '/api/tasks', { title: 'Done', date: today, tagIds: [skien.id], status: 'done' });
  r = await u1('GET', `/api/stats?from=2026-10-01&to=2026-10-31&today=${today}`);
  assert.equal(r.statusCode, 200);
  const s = r.json();
  assert.equal(s.overdue, 1, 'the 10th task was carried to today');
  assert.equal(s.postponed, 1);
  const tag = (id) => s.byTag.find((x) => x.tagId === id);
  assert.deepEqual(tag(skien.id), { tagId: skien.id, pending: 1, done: 1, cancelled: 0 });
  assert.deepEqual(tag(zup.id), { tagId: zup.id, pending: 1, done: 0, cancelled: 0 });
  assert.deepEqual(tag(null), { tagId: null, pending: 1, done: 0, cancelled: 0 });
  assert.equal(s.byPriority[0].priority, 4);
  assert.deepEqual(s.days.filter((d) => d.pending + d.done + d.cancelled).map((d) => d.date), [today, '2026-10-18'], 'the task left the 10th');
  // ... but each day it stayed unfinished still shows it as missed.
  assert.deepEqual(s.days.filter((d) => d.missed).map((d) => d.date),
    ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
  assert.equal((await u1('GET', '/api/stats?from=2026-10-01&to=2026-10-31')).statusCode, 400);

  // Delete tag removes it from tasks
  assert.equal((await u1('DELETE', `/api/tags/${zup.id}`)).statusCode, 204);
  r = await u1('GET', '/api/tasks?date=2026-10-18&today=2026-10-18');
  assert.deepEqual(r.json().tasks.find((t) => t.title === 'Deploy app').tagIds, []);
});

test('sign-in providers and profile / onboarding', async () => {
  const { app, token } = await setup();
  const call = async (t, method, url, payload) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${t}` } });

  // Anonymous or unknown providers are refused; Google and email/password work.
  assert.equal((await call(await token('a', { firebase: { sign_in_provider: 'anonymous' } }), 'GET', '/api/me')).statusCode, 403);
  assert.equal((await call(await token('a', { firebase: undefined }), 'GET', '/api/me')).statusCode, 403);

  // Email/password user who just signed up: no name claim yet, email not verified.
  const pw = await token('newbie', { name: undefined, email_verified: false, firebase: { sign_in_provider: 'password' } });
  let r = await call(pw, 'GET', '/api/me');
  assert.equal(r.statusCode, 200);
  let me = r.json();
  assert.equal(me.provider, 'password');
  assert.equal(me.emailVerified, false);
  assert.equal(me.onboarded, false);
  assert.equal(me.name, 'newbie', 'falls back to the email prefix');

  r = await call(pw, 'PATCH', '/api/me', { name: '  Ann   Lee ', onboarded: true });
  me = r.json();
  assert.equal(me.name, 'Ann Lee');
  assert.equal(me.onboarded, true);
  assert.equal((await call(pw, 'PATCH', '/api/me', { name: '' })).statusCode, 400);
  assert.equal((await call(pw, 'PATCH', '/api/me', { onboarded: false })).statusCode, 400);
  assert.equal((await call(pw, 'PATCH', '/api/me', { email: 'x@y.z' })).statusCode, 400);

  // A later token with a different Google name does not override the chosen name.
  const g = await token('newbie', { name: 'Google Name', firebase: { sign_in_provider: 'google.com' } });
  r = await call(g, 'GET', '/api/me');
  assert.equal(r.json().name, 'Ann Lee');
  assert.equal(r.json().onboarded, true);

  // Google user without a chosen name uses the Google name.
  r = await call(await token('gina', { name: 'Gina G' }), 'GET', '/api/me');
  assert.equal(r.json().name, 'Gina G');
});

test('migration from v2 to the latest keeps users and tasks', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-mig-')), 'tasks.db');
  let db = openDb(file);
  db.prepare("INSERT INTO users (uid, email, name, photo, created_at, last_seen) VALUES ('u', 'u@x.com', 'U', null, 1, 1)").run();
  // Back to the v2 schema, with a v2-era task.
  db.exec(`DROP TABLE task_misses; DROP INDEX idx_tasks_pending; ALTER TABLE tasks DROP COLUMN carried_from;
    DROP TABLE attachments; ALTER TABLE tasks DROP COLUMN subtasks;
    ALTER TABLE users DROP COLUMN display_name; ALTER TABLE users DROP COLUMN onboarded_at; PRAGMA user_version = 2;`);
  db.prepare(`INSERT INTO tasks (id, uid, title, date, original_date, created_at, updated_at)
    VALUES ('old-task-1', 'u', 'Old', '2026-01-01', '2026-01-01', 1, 1)`).run();
  db.close();
  db = openDb(file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 6);
  const { createRepo } = await import('../src/db.js');
  const repo = createRepo(db);
  assert.deepEqual(repo.getProfile('u'), { uid: 'u', email: 'u@x.com', name: 'U', photo: null, createdAt: 1, onboarded: false });
  const old = repo.get('u', 'old-task-1');
  assert.deepEqual(old.subtasks, []);
  assert.deepEqual(old.attachments, []);
  db.close();
});

test('dev-only switches are ignored in production', () => {
  const quiet = () => {};
  for (const NODE_ENV of ['prod', '', undefined, 'test']) {
    const c = loadConfig({ NODE_ENV, AUTH_MODE: 'dev', FIREBASE_AUTH_EMULATOR: 'http://x', FIREBASE_CONFIG_PATH: '/nope' }, quiet);
    assert.equal(c.devAuth, false, `devAuth with NODE_ENV=${NODE_ENV}`);
    assert.equal(c.authEmulator, null);
  }
  const prod = loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'dev', FIREBASE_AUTH_EMULATOR: 'http://127.0.0.1:9099', FIREBASE_CONFIG_PATH: '/nope' }, quiet);
  assert.equal(prod.devAuth, false);
  assert.equal(prod.authEmulator, null);
  const dev = loadConfig({ NODE_ENV: 'development', FIREBASE_AUTH_EMULATOR: 'http://127.0.0.1:9099', FIREBASE_CONFIG_PATH: '/nope' }, quiet);
  assert.equal(dev.authEmulator, 'http://127.0.0.1:9099');
});

test('audit regressions: auth bypass, outages, input hardening', async () => {
  const { app, token, as } = await setup();
  const u = await as('alice');
  const today = '2026-10-17';

  // Percent-encoded path can't skip auth; auth runs before body validation.
  assert.equal((await app.inject('/%61pi/tags')).statusCode, 401);
  assert.equal((await app.inject('/%61pi/me')).statusCode, 401);
  let r = await app.inject({ method: 'POST', url: '/api/tasks', payload: { x: 1 } });
  assert.equal(r.statusCode, 401);

  // iat in the future is rejected.
  const future = Math.floor(Date.now() / 1000) + 3600;
  r = await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${await token('alice', {}, { iat: future, exp: future + 3600 })}` } });
  assert.equal(r.statusCode, 401);

  // Dates outside 1900-2999 rejected; postponing past 2999 is refused instead of storing a bad date.
  assert.equal((await u('POST', '/api/tasks', { title: 'x', date: '1899-12-31' })).statusCode, 400);
  assert.equal((await u('POST', '/api/tasks', { title: 'x', date: '3000-01-01' })).statusCode, 400);
  r = await u('POST', '/api/tasks', { title: 'Far future', date: '2999-12-31' });
  assert.equal(r.statusCode, 201);
  assert.equal((await u('POST', `/api/tasks/${r.json().id}/postpone`, { today })).statusCode, 400);

  // Invisible / control characters.
  r = await u('POST', '/api/tasks', { title: 'a\u0000b\u200B c', date: today, notes: 'line1\r\nline2\u0007' });
  assert.equal(r.json().title, 'ab c');
  assert.equal(r.json().notes, 'line1\nline2');
  assert.equal((await u('POST', '/api/tasks', { title: '\u200B\u200B', date: today })).statusCode, 400);
  assert.equal((await u('POST', '/api/tags', { name: '\u0000' })).statusCode, 400);

  // Unicode case-insensitive tag names.
  assert.equal((await u('POST', '/api/tags', { name: 'Ärzte' })).statusCode, 201);
  assert.equal((await u('POST', '/api/tags', { name: 'äRZTE' })).statusCode, 409);

  // Logo must be a real image of the declared type.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.equal((await u('POST', '/api/tags', { name: 'L1', logo: 'data:image/png;base64,A' })).statusCode, 400);
  assert.equal((await u('POST', '/api/tags', { name: 'L2', logo: png.replace('image/png', 'image/jpeg') })).statusCode, 400);
  assert.equal((await u('POST', '/api/tags', { name: 'L3', logo: 'data:image/png;base64,AAAAAAAAAAAAAAAA' })).statusCode, 400);
  r = await u('POST', '/api/tags', { name: 'L4', logo: png });
  assert.equal(r.statusCode, 201);
  assert.equal((await u('PATCH', `/api/tags/${r.json().id}`, { logo: 'data:image/webp;base64,AAAA' })).statusCode, 400);

  // Undo-delete keeps original timestamps; future timestamps refused.
  r = await u('POST', '/api/tasks', { title: 'Keep', date: today, status: 'done' });
  const orig = r.json();
  await u('DELETE', `/api/tasks/${orig.id}`);
  r = await u('POST', '/api/tasks', {
    id: orig.id, title: 'Keep', date: today, status: 'done', createdAt: orig.createdAt, completedAt: orig.completedAt,
  });
  assert.equal(r.json().createdAt, orig.createdAt);
  assert.equal(r.json().completedAt, orig.completedAt);
  // A clock running ahead doesn't lose the task: its times are taken as "now".
  r = await u('POST', '/api/tasks', { title: 'x', date: today, createdAt: Date.now() + 3600e3 });
  assert.equal(r.statusCode, 201);
  assert.ok(r.json().createdAt <= Date.now());
});

test('Google key outage is 503, not a sign-out', async () => {
  const { errors } = await import('jose');
  const make = (err) => createVerifier({ projectId: PROJECT, keys: async () => { throw err; } });
  const { SignJWT: S, generateKeyPair: g } = await import('jose');
  const { privateKey } = await g('RS256');
  const now = Math.floor(Date.now() / 1000);
  const tok = await new S({ auth_time: now, firebase: { sign_in_provider: 'google.com' } })
    .setProtectedHeader({ alg: 'RS256', kid: 'x' }).setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(PROJECT).setSubject('u').setIssuedAt(now).setExpirationTime(now + 600).sign(privateKey);
  for (const err of [new errors.JWKSTimeout(), new TypeError('fetch failed')]) {
    await assert.rejects(make(err)(tok), (e) => e.statusCode === 503);
  }
  await assert.rejects(make(new errors.JWKSNoMatchingKey())(tok), (e) => e.statusCode === 401);
});

test('refuses a database from a newer version', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-new-')), 'tasks.db');
  const db = openDb(file);
  db.exec('PRAGMA user_version = 99');
  db.close();
  assert.throws(() => openDb(file), /newer than this app/);
});

test('live change events: per user, tagged with source, auth required', async () => {
  const http = await import('node:http');
  const { app, token } = await setup();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = app.server.address().port;
  const tA = await token('alice');
  const tB = await token('bob');

  const open = (tok) => new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/events', headers: tok ? { authorization: `Bearer ${tok}` } : {} }, (res) => {
      const s = { res, status: res.statusCode, headers: res.headers, text: '' };
      res.setEncoding('utf8');
      res.on('data', (c) => { s.text += c; });
      resolve(s);
    });
    req.on('error', reject);
  });
  const call = (tok, method, path, body, cid) => fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json', ...(cid ? { 'x-client-id': cid } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const anon = await open(null);
  assert.equal(anon.status, 401);
  anon.res.destroy();

  const a = await open(tA);
  const b = await open(tB);
  assert.equal(a.status, 200);
  assert.match(a.headers['content-type'], /text\/event-stream/);
  assert.equal(a.headers['x-accel-buffering'], 'no');
  await wait(50);
  assert.match(a.text, /event: ready/);

  let r = await call(tA, 'POST', '/api/tasks', { title: 'Live', date: '2026-10-17' }, 'phone-123456');
  const task = await r.json();
  await call(tA, 'POST', `/api/tasks/${task.id}/postpone`, { today: '2026-10-17' }, 'web-abcdefgh');
  await call(tA, 'POST', '/api/tags', { name: 'Co' });
  await call(tA, 'PATCH', '/api/me', { name: 'Al' });
  await wait(100);

  const events = a.text.split('\n\n').filter((x) => x.startsWith('event: change')).map((x) => JSON.parse(x.split('data: ')[1]));
  assert.deepEqual(events, [
    { type: 'tasks', dates: ['2026-10-17'], source: 'phone-123456' },
    { type: 'tasks', dates: ['2026-10-17', '2026-10-18'], source: 'web-abcdefgh' },
    { type: 'tags', source: null },
    { type: 'profile', source: null },
  ]);
  assert.doesNotMatch(b.text, /event: change/, 'other users get nothing');

  a.res.destroy();
  b.res.destroy();
  await app.close(); // must not hang on open streams
});

test('steps (sub-tasks): tree rules and the task completes only when every step is done', async () => {
  const { as } = await setup();
  const call = await as('steps');
  const id = 'task-steps-1';
  const steps = [
    { id: 'step-aaaa1', parentId: null, title: 'Set up server', done: false },
    { id: 'step-aaaa2', parentId: null, title: 'Ports', done: false },
    { id: 'step-aaaa3', parentId: 'step-aaaa2', title: ' 25  and 587 ', done: false },
    { id: 'step-aaaa4', parentId: 'step-aaaa2', title: '993', done: true },
  ];
  let res = await call('POST', '/api/tasks', { id, title: 'Mail server', date: '2026-10-17', subtasks: steps });
  assert.equal(res.statusCode, 201);
  let t = res.json();
  assert.equal(t.status, 'pending');
  assert.equal(t.subtasks.length, 4);
  assert.equal(t.subtasks[2].title, '25 and 587');
  assert.equal(t.subtasks[1].done, false, 'parent is done only when all children are');

  // Can't complete while steps are open.
  res = await call('PATCH', `/api/tasks/${id}`, { status: 'done' });
  assert.equal(res.statusCode, 409);
  assert.match(res.json().error, /2 steps/);

  // Checking every leaf completes the task; a parent's own flag is ignored.
  const all = steps.map((x) => ({ ...x, done: x.id !== 'step-aaaa2' }));
  t = (await call('PATCH', `/api/tasks/${id}`, { subtasks: all })).json();
  assert.equal(t.status, 'done');
  assert.ok(t.completedAt);
  assert.equal(t.subtasks[1].done, true);

  // Un-checking one reopens it.
  t = (await call('PATCH', `/api/tasks/${id}`, { subtasks: all.map((x) => (x.id === 'step-aaaa1' ? { ...x, done: false } : x)) })).json();
  assert.equal(t.status, 'pending');
  assert.equal(t.completedAt, null);

  // Cancelled stays cancelled when steps change; explicit status always allowed except early "done".
  t = (await call('PATCH', `/api/tasks/${id}`, { status: 'cancelled' })).json();
  assert.equal(t.status, 'cancelled');
  t = (await call('PATCH', `/api/tasks/${id}`, { subtasks: all })).json();
  assert.equal(t.status, 'cancelled');
  t = (await call('PATCH', `/api/tasks/${id}`, { status: 'pending' })).json();
  assert.equal(t.status, 'pending');
  t = (await call('PATCH', `/api/tasks/${id}`, { status: 'done' })).json();
  assert.equal(t.status, 'done');

  // Postpone keeps the steps.
  await call('PATCH', `/api/tasks/${id}`, { subtasks: steps });
  t = (await call('POST', `/api/tasks/${id}/postpone`, { today: '2026-10-17' })).json();
  assert.equal(t.date, '2026-10-18');
  assert.equal(t.subtasks.length, 4);

  // Removing all steps leaves the status alone.
  t = (await call('PATCH', `/api/tasks/${id}`, { subtasks: [] })).json();
  assert.deepEqual(t.subtasks, []);
  assert.equal(t.status, 'pending');

  // Bad trees are refused.
  const bad = [
    [{ id: 'step-bbbb1', parentId: 'step-nope1', title: 'x' }],
    [{ id: 'step-bbbb1', parentId: 'step-bbbb2', title: 'x' }, { id: 'step-bbbb2', parentId: 'step-bbbb1', title: 'y' }],
    [{ id: 'step-bbbb1', title: 'x' }, { id: 'step-bbbb1', title: 'y' }],
    [{ id: 'step-bbbb1', title: '   ' }],
    [1, 2, 3, 4, 5].map((n) => ({ id: `step-deep${n}`, parentId: n > 1 ? `step-deep${n - 1}` : null, title: `L${n}` })),
  ];
  for (const b of bad) {
    res = await call('PATCH', `/api/tasks/${id}`, { subtasks: b });
    assert.equal(res.statusCode, 400, JSON.stringify(b));
  }
  // Four levels is fine.
  res = await call('PATCH', `/api/tasks/${id}`, { subtasks: bad[4].slice(0, 4) });
  assert.equal(res.statusCode, 200);
});

// 1x1 images
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

test('image attachments: upload, read, owner only, delete, survive undo, cleaned up later', async () => {
  const { as, app, db, filesDir } = await setup();
  const me = await as('pics');
  const other = await as('other-pics');
  const id = 'task-pics-1';
  await me('POST', '/api/tasks', { id, title: 'Router', date: '2026-10-17' });
  const body = { id: 'att-00001', image: `data:image/jpeg;base64,${JPEG}`, thumb: `data:image/jpeg;base64,${JPEG}`, width: 1, height: 1 };

  let res = await me('POST', `/api/tasks/${id}/attachments`, body);
  assert.equal(res.statusCode, 201);
  let t = res.json();
  assert.equal(t.attachments.length, 1);
  assert.equal(t.attachments[0].type, 'jpeg');
  // Retrying the same upload is harmless.
  res = await me('POST', `/api/tasks/${id}/attachments`, body);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().attachments.length, 1);

  // Day view carries the attachments.
  const day = (await me('GET', '/api/tasks?date=2026-10-17')).json();
  assert.equal(day.tasks[0].attachments[0].id, 'att-00001');

  res = await me('GET', '/api/attachments/att-00001?size=thumb');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'image/jpeg');
  assert.match(res.headers['cache-control'], /private/);
  assert.deepEqual(res.rawPayload, Buffer.from(JPEG, 'base64'));
  assert.equal((await other('GET', '/api/attachments/att-00001')).statusCode, 404);
  assert.equal((await other('POST', `/api/tasks/${id}/attachments`, { ...body, id: 'att-00002' })).statusCode, 404);

  // Wrong content, mismatched thumb, bad ids.
  assert.equal((await me('POST', `/api/tasks/${id}/attachments`, { ...body, id: 'att-00003', image: `data:image/png;base64,${JPEG}` })).statusCode, 400);
  assert.equal((await me('POST', `/api/tasks/${id}/attachments`, { ...body, id: 'att-00003', thumb: `data:image/png;base64,${PNG}` })).statusCode, 400);
  assert.equal((await me('POST', `/api/tasks/${id}/attachments`, { ...body, id: '../../etc' })).statusCode, 400);

  // Deleting the task keeps the image for "Undo"; re-creating the task brings it back.
  assert.equal((await me('DELETE', `/api/tasks/${id}`)).statusCode, 204);
  assert.equal((await me('GET', '/api/attachments/att-00001')).statusCode, 200);
  t = (await me('POST', '/api/tasks', { id, title: 'Router', date: '2026-10-17' })).json();
  assert.equal(t.attachments.length, 1);

  // Delete one image.
  res = await me('DELETE', '/api/attachments/att-00001');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().attachments.length, 0);
  assert.equal(fs.readdirSync(filesDir).length, 0);

  // Orphans older than a day are removed by the sweep.
  await me('POST', `/api/tasks/${id}/attachments`, { ...body, id: 'att-00009' });
  await me('DELETE', `/api/tasks/${id}`);
  db.prepare('UPDATE attachments SET orphaned_at = 1').run();
  app.sweepAttachments();
  assert.equal(fs.readdirSync(filesDir).length, 0);
  assert.equal((await me('GET', '/api/attachments/att-00009')).statusCode, 404);
});
