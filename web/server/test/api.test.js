import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { buildApp } from '../src/app.js';
import { createVerifier } from '../src/auth.js';
import { parseFirebaseWebConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { addDays, isValidDate } from '../src/dates.js';

const PROJECT = 'tasks-test';

async function setup({ allowList = [] } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const verify = createVerifier({ projectId: PROJECT, allowList, keys: createLocalJWKSet({ keys: [jwk] }) });
  const db = openDb(':memory:');
  const app = buildApp({
    db, verify, config: { firebase: { projectId: PROJECT }, devAuth: false, staticDir: '/nonexistent' },
  });

  async function token(sub, extra = {}, opts = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ auth_time: now, email: `${sub}@example.com`, email_verified: true, ...extra })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
      .setAudience(opts.aud ?? PROJECT)
      .setSubject(sub)
      .setIssuedAt(now)
      .setExpirationTime(opts.exp ?? now + 3600)
      .sign(opts.key ?? privateKey);
  }

  async function as(sub) {
    const auth = { authorization: `Bearer ${await token(sub)}` };
    return (method, url, payload) => app.inject({ method, url, payload, headers: auth });
  }
  return { app, token, as };
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
});

test('task lifecycle, overdue, postpone, isolation', async () => {
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

  // Today view: overdue on top, tasks sorted by priority
  r = await u1('GET', `/api/tasks?date=${today}&today=${today}`);
  let body = r.json();
  assert.deepEqual(body.overdue.map((t) => t.id), [old.id]);
  assert.deepEqual(body.tasks.map((t) => t.title), ['Today high', 'Today low']);

  // Other days carry no overdue list
  r = await u1('GET', `/api/tasks?date=${yesterday}&today=${today}`);
  assert.deepEqual(r.json().overdue, []);
  assert.equal(r.json().tasks.length, 1);

  // Another user sees nothing and cannot touch alice's tasks
  r = await u2('GET', `/api/tasks?date=${today}&today=${today}`);
  assert.deepEqual(r.json(), { tasks: [], overdue: [] });
  assert.equal((await u2('PATCH', `/api/tasks/${high.id}`, { status: 'done' })).statusCode, 404);
  assert.equal((await u2('DELETE', `/api/tasks/${high.id}`)).statusCode, 404);
  assert.equal((await u2('POST', '/api/tasks', { id: 'client-id-0001', title: 'steal', date: today })).statusCode, 409);

  // Postpone overdue task: goes to tomorrow (today + 1), not yesterday + 1
  r = await u1('POST', `/api/tasks/${old.id}/postpone`, { today });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().date, '2026-10-18');
  assert.equal(r.json().postponed, 1);
  assert.equal(r.json().originalDate, yesterday);
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
    { date: today, pending: 1, done: 0, cancelled: 0 },
    { date: '2026-10-19', pending: 1, done: 0, cancelled: 0 },
    { date: '2026-10-20', pending: 0, done: 0, cancelled: 1 },
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
  assert.equal((await app.inject('/api/unknown')).statusCode, 401);
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
  await u1('POST', '/api/tasks', { title: 'Old', date: '2026-10-10', tagIds: [skien.id] });
  await u1('POST', '/api/tasks', { title: 'Done', date: today, tagIds: [skien.id], status: 'done' });
  r = await u1('GET', `/api/stats?from=2026-10-01&to=2026-10-31&today=${today}`);
  assert.equal(r.statusCode, 200);
  const s = r.json();
  assert.equal(s.overdue, 1);
  assert.equal(s.postponed, 1);
  const tag = (id) => s.byTag.find((x) => x.tagId === id);
  assert.deepEqual(tag(skien.id), { tagId: skien.id, pending: 1, done: 1, cancelled: 0 });
  assert.deepEqual(tag(zup.id), { tagId: zup.id, pending: 1, done: 0, cancelled: 0 });
  assert.deepEqual(tag(null), { tagId: null, pending: 1, done: 0, cancelled: 0 });
  assert.equal(s.byPriority[0].priority, 4);
  assert.equal(s.days.length, 3);
  assert.equal((await u1('GET', '/api/stats?from=2026-10-01&to=2026-10-31')).statusCode, 400);

  // Delete tag removes it from tasks
  assert.equal((await u1('DELETE', `/api/tags/${zup.id}`)).statusCode, 204);
  r = await u1('GET', '/api/tasks?date=2026-10-18&today=2026-10-18');
  assert.deepEqual(r.json().tasks[0].tagIds, []);
});
