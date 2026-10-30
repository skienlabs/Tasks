// Teams 2.0: sign-off, one task for several people, sub-groups, team tags, templates, repeating
// tasks, comments, files, notifications, nudges, invite links, job titles, activity, settings,
// archived teams and the background jobs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { buildApp } from '../src/app.js';
import { createVerifier } from '../src/auth.js';
import { openDb } from '../src/db.js';
import { nextOccurrence, ruleMatches } from '../src/teamRoutes.js';

const PROJECT = 'tasks-test';
const TODAY = '2026-10-17'; // a Saturday
const T = 'team-acme-1';

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const verify = createVerifier({ projectId: PROJECT, keys: createLocalJWKSet({ keys: [jwk] }) });
  const db = openDb(':memory:');
  const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-files-'));
  const published = [];
  const events = { open() {}, publish(uid, change, source) { published.push({ uid, ...change, source }); }, closeAll() {} };
  let now = Date.parse(`${TODAY}T09:00:00Z`);
  const app = buildApp({
    db, verify, events,
    config: { firebase: { projectId: PROJECT }, devAuth: false, staticDir: '/nonexistent', filesDir, publicUrl: 'https://tasks.example.com' },
    clock: () => now,
  });
  async function as(sub, extra = {}) {
    const iat = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({
      auth_time: iat, email: `${sub}@example.com`, email_verified: true, name: sub[0].toUpperCase() + sub.slice(1),
      firebase: { sign_in_provider: 'google.com' }, ...extra,
    }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT).setSubject(sub).setIssuedAt(iat).setExpirationTime(iat + 3600).sign(privateKey);
    const headers = { authorization: `Bearer ${jwt}`, 'x-client-id': `client-${sub}` };
    const call = (method, url, payload) => app.inject({ method, url, payload, headers });
    await call('GET', '/api/me');
    return call;
  }
  return { app, as, db, published, filesDir, setNow: (iso) => { now = Date.parse(iso); } };
}

/** boss (owner) makes Acme; bob is an admin; ann and cat are members. */
async function acme(ctx) {
  const boss = await ctx.as('boss');
  const people = { boss };
  assert.equal((await boss('POST', '/api/teams', { id: T, name: 'Acme', color: 'teal' })).statusCode, 201);
  await boss('POST', `/api/teams/${T}/invites`, { emails: ['ann@example.com', 'cat@example.com'] });
  await boss('POST', `/api/teams/${T}/invites`, { emails: ['bob@example.com'], role: 'admin' });
  for (const name of ['ann', 'bob', 'cat']) {
    const who = await ctx.as(name);
    const invite = (await who('GET', '/api/invites')).json().invites[0];
    assert.equal((await who('POST', `/api/invites/${invite.id}/accept`)).statusCode, 200);
    people[name] = who;
  }
  return people;
}

const give = (who, body) => who('POST', `/api/teams/${T}/tasks`, { date: TODAY, today: TODAY, title: 'Task', ...body });
const myTask = async (who, id) => (await who('GET', `/api/tasks?date=${TODAY}`)).json().tasks.find((t) => t.id === id);
const notes = async (who) => (await who('GET', '/api/notifications')).json();

test('repeating rules', () => {
  assert.equal(ruleMatches({ freq: 'daily' }, '2026-10-17'), true);
  assert.equal(ruleMatches({ freq: 'weekdays' }, '2026-10-17'), false); // Saturday
  assert.equal(ruleMatches({ freq: 'weekdays' }, '2026-10-19'), true);
  assert.equal(ruleMatches({ freq: 'weekly', days: [1, 3] }, '2026-10-21'), true);
  assert.equal(nextOccurrence({ freq: 'weekly', days: [1] }, '2026-10-17'), '2026-10-19');
  // "The 31st" falls on the last day of shorter months.
  assert.equal(nextOccurrence({ freq: 'monthly', day: 31 }, '2026-11-01'), '2026-11-30');
  assert.equal(nextOccurrence({ freq: 'monthly', day: 31 }, '2027-02-01'), '2027-02-28');
  assert.equal(nextOccurrence({ freq: 'monthly', day: 15 }, '2026-10-16'), '2026-11-15');
});

test('sign-off: done waits for review; approve or send back with a note', async () => {
  const ctx = await setup();
  const { boss, ann, bob } = await acme(ctx);
  let res = await give(boss, { id: 'review-task-1', assignee: 'ann', title: 'Design poster', needsReview: true });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().needsReview, true);
  assert.equal(res.json().review, null);
  // Ann is told about the new task.
  assert.equal((await notes(ann)).notifications[0].kind, 'given');

  // Can't review what isn't finished.
  assert.equal((await bob('POST', `/api/teams/${T}/tasks/review-task-1/review`, { decision: 'approve' })).statusCode, 409);

  res = await ann('PATCH', '/api/tasks/review-task-1', { status: 'done' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().review, 'waiting');
  const bossNotes = await notes(boss);
  assert.equal(bossNotes.notifications[0].kind, 'review');
  assert.ok(bossNotes.unread >= 1);
  assert.ok((await notes(bob)).notifications.some((n) => n.kind === 'review'));

  // Members can't review.
  assert.equal((await ann('POST', `/api/teams/${T}/tasks/review-task-1/review`, { decision: 'approve' })).statusCode, 403);

  // Sent back with a note: open again, the note is in the comments.
  res = await bob('POST', `/api/teams/${T}/tasks/review-task-1/review`, { decision: 'return', note: 'Logo is too small' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, 'pending');
  assert.equal(res.json().review, 'returned');
  const t = await myTask(ann, 'review-task-1');
  assert.equal(t.status, 'pending');
  const comments = (await ann('GET', '/api/tasks/review-task-1/comments')).json().comments;
  assert.deepEqual(comments.map((c) => [c.name, c.text]), [['Bob', 'Logo is too small']]);
  assert.equal((await notes(ann)).notifications[0].kind, 'returned');

  // Done again, approved: now she can't open it again herself.
  assert.equal((await ann('PATCH', '/api/tasks/review-task-1', { status: 'done' })).json().review, 'waiting');
  res = await boss('POST', `/api/teams/${T}/tasks/review-task-1/review`, { decision: 'approve' });
  assert.equal(res.json().review, 'approved');
  assert.equal(res.json().status, 'done');
  assert.equal((await ann('PATCH', '/api/tasks/review-task-1', { status: 'pending' })).statusCode, 403);
  // An admin can.
  res = await boss('PATCH', `/api/teams/${T}/tasks/review-task-1`, { status: 'pending' });
  assert.equal(res.json().status, 'pending');
  assert.equal(res.json().review, null);

  // An admin finishing their own task that needs sign-off: approved right away.
  await give(boss, { id: 'review-task-2', assignee: 'bob', needsReview: true });
  assert.equal((await bob('PATCH', '/api/tasks/review-task-2', { status: 'done' })).json().review, 'approved');
});

test('one task for several people: each their own, or the first one closes it', async () => {
  const ctx = await setup();
  const { boss, ann, bob, cat } = await acme(ctx);
  assert.equal((await give(boss, { id: 'multi-each-1', assignees: ['ann', 'eve'] })).statusCode, 400);

  let res = await give(boss, { id: 'multi-each-1', assignees: ['ann', 'cat'], title: 'Fill in timesheet' });
  assert.equal(res.statusCode, 201);
  let tasks = res.json().tasks;
  assert.deepEqual(tasks.map((t) => [t.id, t.assignee, t.groupId, t.groupMode]), [
    ['multi-each-1-0', 'ann', 'multi-each-1', 'each'], ['multi-each-1-1', 'cat', 'multi-each-1', 'each'],
  ]);
  // A retry gives the same tasks back.
  res = await give(boss, { id: 'multi-each-1', assignees: ['ann', 'cat'], title: 'Fill in timesheet' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().tasks.length, 2);
  // Each ticks their own.
  await ann('PATCH', '/api/tasks/multi-each-1-0', { status: 'done' });
  assert.equal((await myTask(cat, 'multi-each-1-1')).status, 'pending');

  // "First one to finish closes it".
  tasks = (await give(boss, { id: 'multi-first-1', assignees: ['ann', 'cat'], mode: 'first', title: 'Answer the client' })).json().tasks;
  assert.equal(tasks[0].groupMode, 'first');
  // Both of them see each other's copy on the board, and share one comment thread.
  const board = (await cat('GET', `/api/teams/${T}/tasks?from=${TODAY}&to=${TODAY}`)).json().tasks.map((t) => t.id);
  assert.ok(board.includes('multi-first-1-1'));
  await ann('POST', '/api/tasks/multi-first-1-0/comments', { text: 'I will take it' });
  assert.equal((await cat('GET', '/api/tasks/multi-first-1-1/comments')).json().comments.length, 1);

  ctx.published.length = 0;
  await ann('PATCH', '/api/tasks/multi-first-1-0', { status: 'done' });
  let c = await myTask(cat, 'multi-first-1-1');
  assert.equal(c.status, 'cancelled');
  assert.equal(c.closedBy, 'ann');
  assert.ok(ctx.published.some((e) => e.uid === 'cat' && e.type === 'tasks'));
  assert.equal((await notes(cat)).notifications[0].kind, 'closed');
  // Cat can't open the closed copy herself.
  assert.equal((await cat('PATCH', '/api/tasks/multi-first-1-1', { status: 'done' })).statusCode, 403);
  // Ann opens hers again: Cat's opens again too.
  await ann('PATCH', '/api/tasks/multi-first-1-0', { status: 'pending' });
  c = await myTask(cat, 'multi-first-1-1');
  assert.equal(c.status, 'pending');
  assert.equal(c.closedBy, null);

  // To a sub-group.
  res = await boss('POST', `/api/teams/${T}/groups`, { id: 'group-design', name: 'Design', color: 'pink', members: ['ann', 'bob'] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().groups, [{ id: 'group-design', name: 'Design', color: 'pink', members: ['ann', 'bob'] }]);
  tasks = (await give(boss, { id: 'group-task-1', groupId: 'group-design' })).json().tasks;
  assert.deepEqual(tasks.map((t) => t.assignee), ['ann', 'bob']);
  assert.equal((await bob('GET', `/api/tasks?date=${TODAY}`)).json().tasks.length, 1);
});

test('sub-groups, team tags, job titles', async () => {
  const ctx = await setup();
  const { boss, ann, bob, cat } = await acme(ctx);
  // Only admins manage groups; members must be in the team.
  assert.equal((await ann('POST', `/api/teams/${T}/groups`, { name: 'Mine' })).statusCode, 403);
  assert.equal((await boss('POST', `/api/teams/${T}/groups`, { name: 'Ops', members: ['eve'] })).statusCode, 400);
  let res = await bob('POST', `/api/teams/${T}/groups`, { id: 'group-ops-1', name: 'Ops', members: ['cat'] });
  assert.equal(res.statusCode, 200);
  res = await bob('PATCH', `/api/teams/${T}/groups/group-ops-1`, { name: 'Operations', members: ['cat', 'ann'] });
  assert.deepEqual(res.json().groups[0].members.sort(), ['ann', 'cat']);
  // Someone who leaves leaves their groups too.
  await cat('DELETE', `/api/teams/${T}/members/cat`);
  assert.deepEqual((await boss('GET', '/api/teams')).json().teams[0].groups[0].members, ['ann']);
  res = await bob('DELETE', `/api/teams/${T}/groups/group-ops-1`);
  assert.deepEqual(res.json().groups, []);

  // Team tags: the same for everyone, set by admins.
  assert.equal((await ann('POST', `/api/teams/${T}/tags`, { name: 'Urgent' })).statusCode, 403);
  res = await boss('POST', `/api/teams/${T}/tags`, { id: 'ttag-urgent', name: 'Urgent', color: 'red' });
  assert.deepEqual(res.json().tags, [{ id: 'ttag-urgent', name: 'Urgent', color: 'red' }]);
  assert.equal((await boss('POST', `/api/teams/${T}/tags`, { name: 'urgent' })).statusCode, 409);
  assert.equal((await give(boss, { id: 'tagged-1', assignee: 'ann', teamTagIds: ['ttag-nope'] })).statusCode, 400);
  await give(boss, { id: 'tagged-1', assignee: 'ann', teamTagIds: ['ttag-urgent'] });
  assert.deepEqual((await myTask(ann, 'tagged-1')).teamTagIds, ['ttag-urgent']);
  res = await boss('PATCH', `/api/teams/${T}/tags/ttag-urgent`, { name: 'Today' });
  assert.equal(res.json().tags[0].name, 'Today');
  await boss('DELETE', `/api/teams/${T}/tags/ttag-urgent`);
  assert.deepEqual((await myTask(ann, 'tagged-1')).teamTagIds, []);

  // Job titles: your own, or anyone's if you're an admin.
  assert.equal((await ann('PATCH', `/api/teams/${T}/members/ann`, { title: '  Designer ' })).statusCode, 200);
  assert.equal((await ann('PATCH', `/api/teams/${T}/members/bob`, { title: 'Intern' })).statusCode, 403);
  res = await boss('PATCH', `/api/teams/${T}/members/bob`, { title: 'Project lead' });
  const titles = Object.fromEntries(res.json().members.map((m) => [m.uid, m.title]));
  assert.deepEqual(titles, { boss: null, bob: 'Project lead', ann: 'Designer' });
  res = await boss('PATCH', `/api/teams/${T}/members/bob`, { title: null });
  assert.equal(res.json().members.find((m) => m.uid === 'bob').title, null);
});

test('templates and repeating tasks', async () => {
  const ctx = await setup();
  const { boss, ann, bob } = await acme(ctx);
  const data = { title: 'Weekly report', notes: 'Numbers + highlights', priority: 2, dueTime: '17:00', subtasks: [{ id: 'step-0001', title: 'Numbers', done: false }] };
  assert.equal((await ann('POST', `/api/teams/${T}/templates`, { name: 'Report', data })).statusCode, 403);
  let res = await boss('POST', `/api/teams/${T}/templates`, { id: 'tmpl-report', name: 'Report', data });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().templates[0].title, 'Weekly report');
  assert.equal(res.json().templates[0].dueTime, '17:00');
  res = await bob('PATCH', `/api/teams/${T}/templates/tmpl-report`, { name: 'Friday report' });
  assert.equal(res.json().templates[0].name, 'Friday report');
  assert.equal((await ann('GET', `/api/teams/${T}/templates`)).statusCode, 403);
  res = await boss('DELETE', `/api/teams/${T}/templates/tmpl-report`);
  assert.deepEqual(res.json().templates, []);

  // Daily, starting today: today's task appears right away, once.
  res = await boss('POST', `/api/teams/${T}/recurring`, {
    id: 'rec-daily-1', data: { ...data, title: 'Open the shop', assignees: ['ann'] }, rule: { freq: 'daily' }, today: TODAY,
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().recurring[0].nextDate, '2026-10-18');
  let mine = (await ann('GET', `/api/tasks?date=${TODAY}`)).json().tasks;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].recurringId, 'rec-daily-1');
  assert.equal(mine[0].dueAt, `${TODAY}T17:00`);
  assert.equal(mine[0].assignedBy, 'boss');
  ctx.app.runTeamJobs();
  assert.equal((await ann('GET', `/api/tasks?date=${TODAY}`)).json().tasks.length, 1);

  // A server that was down for a few days catches up every day (no day is skipped)...
  ctx.setNow('2026-10-21T08:00:00Z');
  ctx.app.runTeamJobs();
  const day = (d) => ctx.db.prepare("SELECT date FROM tasks WHERE recurring_id = 'rec-daily-1' ORDER BY date").all().map((r) => r.date).includes(d);
  for (const d of ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']) assert.equal(day(d), true, d);
  // ...but only the last week of them after a long break.
  ctx.setNow('2026-11-30T08:00:00Z');
  ctx.app.runTeamJobs();
  assert.equal(day('2026-11-01'), false);
  assert.equal(day('2026-11-23'), true);
  assert.equal(day('2026-11-30'), true);
  ctx.setNow('2026-10-21T08:00:00Z');
  await boss('PATCH', `/api/teams/${T}/recurring/rec-daily-1`, { active: false });

  // Weekly on Mondays for two people, paused and resumed.
  res = await boss('POST', `/api/teams/${T}/recurring`, {
    id: 'rec-weekly-1', data: { title: 'Plan the week', assignees: ['ann', 'bob'] }, rule: { freq: 'weekly', days: [1] }, today: '2026-10-21',
  });
  assert.equal(res.json().recurring.find((r) => r.id === 'rec-weekly-1').nextDate, '2026-10-26');
  assert.equal((await boss('POST', `/api/teams/${T}/recurring`, { data: { title: 'x', assignees: ['ann'] }, rule: { freq: 'weekly' } })).statusCode, 400);
  res = await boss('PATCH', `/api/teams/${T}/recurring/rec-weekly-1`, { active: false });
  assert.equal(res.json().recurring.find((r) => r.id === 'rec-weekly-1').active, false);
  ctx.setNow('2026-10-26T08:00:00Z');
  ctx.app.runTeamJobs();
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE recurring_id = 'rec-weekly-1'").get().n, 0);
  await boss('PATCH', `/api/teams/${T}/recurring/rec-weekly-1`, { active: true });
  ctx.setNow('2026-11-02T08:00:00Z');
  ctx.app.runTeamJobs();
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE recurring_id = 'rec-weekly-1'").get().n, 2);
  assert.equal(ctx.db.prepare("SELECT COUNT(DISTINCT group_id) AS n FROM tasks WHERE recurring_id = 'rec-weekly-1'").get().n, 1);
  assert.equal((await ann('GET', `/api/teams/${T}/recurring`)).statusCode, 403);
  res = await boss('DELETE', `/api/teams/${T}/recurring/rec-weekly-1`);
  assert.equal(res.json().recurring.length, 1);
});

test('repeating tasks follow the local day of people ahead of UTC', async () => {
  const ctx = await setup();
  const { boss, ann } = await acme(ctx);
  ctx.setNow('2026-10-17T21:00:00Z'); // already the 18th in India
  let res = await boss('POST', `/api/teams/${T}/recurring`, { id: 'rec-local-1', data: { title: 'Morning check', assignees: ['ann'] }, rule: { freq: 'daily' }, today: '2026-10-18' });
  assert.equal(res.statusCode, 201);
  let mine = (await ann('GET', '/api/tasks?date=2026-10-18')).json().tasks;
  assert.deepEqual(mine.map((t) => t.title), ['Morning check']);
  // The next day comes when someone's app (in their day) asks, before the server's UTC day turns.
  ctx.setNow('2026-10-18T20:00:00Z');
  await ann('GET', '/api/sync?today=2026-10-19');
  mine = (await ann('GET', '/api/tasks?date=2026-10-19')).json().tasks;
  // Yesterday's (left open) carried over, and today's own.
  assert.deepEqual(mine.map((t) => [t.title, t.originalDate]).sort(), [['Morning check', '2026-10-18'], ['Morning check', '2026-10-19']]);
  // Someone behind (still the 18th) changes nothing.
  await boss('GET', `/api/teams/${T}/tasks?from=2026-10-18&to=2026-10-19&today=2026-10-18`);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE recurring_id = 'rec-local-1'").get().n, 2);
});

test('comments, files, nudges and notifications', async () => {
  const ctx = await setup();
  const { boss, ann, bob, cat } = await acme(ctx);
  const eve = await ctx.as('eve');
  await give(boss, { id: 'talk-task-1', assignee: 'ann', title: 'Call the supplier' });

  // Comments: the person, whoever gave it and admins; not other members or outsiders.
  let res = await ann('POST', '/api/tasks/talk-task-1/comments', { id: 'comment-0001', text: 'Line was busy, trying again at 3' });
  assert.equal(res.statusCode, 201);
  assert.equal((await ann('POST', '/api/tasks/talk-task-1/comments', { id: 'comment-0001', text: 'Line was busy, trying again at 3' })).statusCode, 200);
  assert.equal((await ann('POST', '/api/tasks/talk-task-1/comments', { text: '   ' })).statusCode, 400);
  await bob('POST', '/api/tasks/talk-task-1/comments', { id: 'comment-0002', text: 'Thanks!' });
  res = await boss('GET', '/api/tasks/talk-task-1/comments');
  assert.deepEqual(res.json().comments.map((c) => c.text), ['Line was busy, trying again at 3', 'Thanks!']);
  assert.equal((await cat('GET', '/api/tasks/talk-task-1/comments')).statusCode, 404);
  assert.equal((await eve('GET', '/api/tasks/talk-task-1/comments')).statusCode, 404);
  assert.equal((await eve('GET', '/api/tasks/nope-nope-1/comments')).statusCode, 404);
  let board = (await boss('GET', `/api/teams/${T}/tasks?from=${TODAY}&to=${TODAY}`)).json().tasks;
  assert.equal(board[0].comments, 2);
  assert.equal((await notes(ann)).notifications[0].kind, 'comment'); // Bob's
  // Your own comments, or any as an admin.
  assert.equal((await ann('DELETE', '/api/comments/comment-0002')).statusCode, 403);
  assert.equal((await boss('DELETE', '/api/comments/comment-0002')).statusCode, 200);
  assert.equal((await ann('DELETE', '/api/comments/comment-0001')).json().comments.length, 0);

  // Files: admins add them to someone's team task; downloaded, never shown in place.
  const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 hello').toString('base64')}`;
  assert.equal((await ann('POST', `/api/teams/${T}/tasks/talk-task-1/files`, { id: 'file-00001', name: 'a.pdf', data: pdf })).statusCode, 403);
  res = await boss('POST', `/api/teams/${T}/tasks/talk-task-1/files`, { id: 'file-00001', name: 'Price list.pdf', data: pdf });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json().files.map((f) => [f.name, f.mime, f.addedBy]), [['Price list.pdf', 'application/pdf', 'boss']]);
  assert.equal((await myTask(ann, 'talk-task-1')).files.length, 1);
  res = await ann('GET', '/api/files/file-00001');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '%PDF-1.4 hello');
  assert.match(res.headers['content-disposition'], /^attachment; filename="Price list.pdf"/);
  assert.equal(res.headers['content-type'], 'application/octet-stream');
  assert.equal((await bob('GET', '/api/files/file-00001')).statusCode, 200);
  assert.equal((await cat('GET', '/api/files/file-00001')).statusCode, 404);
  assert.equal((await eve('GET', '/api/files/file-00001')).statusCode, 404);
  // Admins can also add images to someone's team task.
  const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  res = await bob('POST', `/api/teams/${T}/tasks/talk-task-1/attachments`, {
    id: 'img-from-bob', image: `data:image/jpeg;base64,${JPEG}`, thumb: `data:image/jpeg;base64,${JPEG}`, width: 1, height: 1,
  });
  assert.equal(res.statusCode, 201);
  assert.equal((await myTask(ann, 'talk-task-1')).attachments.length, 1);
  assert.equal((await ann('GET', '/api/attachments/img-from-bob')).statusCode, 200);
  // Personal files on your own task.
  await ann('POST', '/api/tasks', { id: 'own-task-01', title: 'Mine', date: TODAY, today: TODAY });
  res = await ann('POST', '/api/tasks/own-task-01/files', { id: 'file-00002', name: 'notes.txt', data: `data:text/plain;base64,${Buffer.from('hi').toString('base64')}` });
  assert.equal(res.statusCode, 201);
  assert.equal((await eve('GET', '/api/files/file-00002')).statusCode, 404);
  // Removing: the person, whoever added it, or an admin.
  assert.equal((await ann('DELETE', '/api/files/file-00001')).statusCode, 200);
  assert.equal((await myTask(ann, 'talk-task-1')).files.length, 0);
  assert.equal(fs.existsSync(path.join(ctx.filesDir, 'file-00001.bin')), false);

  // Nudges: admins, at most every half hour, only open tasks.
  assert.equal((await cat('POST', `/api/teams/${T}/tasks/talk-task-1/nudge`)).statusCode, 403);
  assert.equal((await boss('POST', `/api/teams/${T}/tasks/talk-task-1/nudge`)).statusCode, 200);
  assert.equal((await bob('POST', `/api/teams/${T}/tasks/talk-task-1/nudge`)).statusCode, 429);
  ctx.setNow(`${TODAY}T10:00:00Z`);
  assert.equal((await bob('POST', `/api/teams/${T}/tasks/talk-task-1/nudge`)).statusCode, 200);
  let n = await notes(ann);
  assert.equal(n.notifications[0].kind, 'nudge');
  assert.match(n.notifications[0].title, /Bob reminds you/);

  // Reading them.
  assert.ok(n.unread > 0);
  res = await ann('POST', '/api/notifications/read', { id: n.notifications[0].id });
  assert.equal(res.json().unread, n.unread - 1);
  res = await ann('POST', '/api/notifications/read', { upTo: n.notifications[0].id });
  assert.equal(res.json().unread, 0);
  // Newer than a given one.
  await boss('PATCH', `/api/teams/${T}/tasks/talk-task-1`, { title: 'Call the supplier today' });
  const newer = (await ann('GET', `/api/notifications?after=${n.notifications[0].id}`)).json();
  assert.deepEqual(newer.notifications.map((x) => x.kind), ['changed']);
  assert.equal(newer.unread, 1);
  // Nobody is told about their own actions.
  assert.ok((await notes(boss)).notifications.every((x) => x.actor !== 'boss'));
});

test('invite link with QR code and admin approval', async () => {
  const ctx = await setup();
  const { boss, ann } = await acme(ctx);
  const eve = await ctx.as('eve');
  assert.equal((await ann('POST', `/api/teams/${T}/link`)).statusCode, 403);
  assert.deepEqual((await boss('GET', `/api/teams/${T}/link`)).json(), { link: null });
  let link = (await boss('POST', `/api/teams/${T}/link`)).json().link;
  assert.match(link.url, /^https:\/\/tasks\.example\.com\/join\/[A-Za-z0-9_-]{24}$/);
  assert.match(link.qr, /^data:image\/png;base64,/);

  let res = await eve('GET', `/api/join/${link.token}`);
  assert.deepEqual(res.json(), { team: { id: T, name: 'Acme', color: 'teal', logo: null, memberCount: 4 }, status: 'none' });
  assert.deepEqual((await eve('POST', `/api/join/${link.token}`)).json(), { status: 'requested' });
  assert.deepEqual((await eve('POST', `/api/join/${link.token}`)).json(), { status: 'requested' });
  assert.equal((await eve('GET', `/api/join/${link.token}`)).json().status, 'requested');
  assert.deepEqual((await ann('POST', `/api/join/${link.token}`)).json(), { status: 'member' });
  // Admins see the request (members don't) and are told about it.
  let team = (await boss('GET', '/api/teams')).json().teams[0];
  assert.deepEqual(team.requests.map((r) => [r.uid, r.name]), [['eve', 'Eve']]);
  assert.deepEqual((await ann('GET', '/api/teams')).json().teams[0].requests, []);
  assert.equal((await notes(boss)).notifications[0].kind, 'request');
  assert.equal((await ann('POST', `/api/teams/${T}/requests/eve`, { approve: true })).statusCode, 403);
  res = await boss('POST', `/api/teams/${T}/requests/eve`, { approve: true });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().members.some((m) => m.uid === 'eve' && m.role === 'member'));
  assert.equal((await eve('GET', '/api/teams')).json().teams.length, 1);
  assert.equal((await boss('POST', `/api/teams/${T}/requests/eve`, { approve: true })).statusCode, 404);

  // A new link stops the old one; turning it off stops it too.
  const old = link.token;
  link = (await boss('POST', `/api/teams/${T}/link`)).json().link;
  assert.notEqual(link.token, old);
  const zed = await ctx.as('zed');
  assert.equal((await zed('GET', `/api/join/${old}`)).statusCode, 404);
  await zed('POST', `/api/join/${link.token}`);
  res = await boss('POST', `/api/teams/${T}/requests/zed`, { approve: false });
  assert.deepEqual(res.json().requests, []);
  assert.equal((await boss('DELETE', `/api/teams/${T}/link`)).statusCode, 204);
  assert.equal((await zed('GET', `/api/join/${link.token}`)).statusCode, 404);
  assert.equal((await zed('GET', '/api/join/short')).statusCode, 400);
});

test('settings: members giving tasks; activity log; archived teams', async () => {
  const ctx = await setup();
  const { boss, ann, bob, cat } = await acme(ctx);
  // By default only admins give tasks.
  assert.equal((await give(ann, { id: 'from-ann-1', assignee: 'cat' })).statusCode, 403);
  assert.equal((await ann('PATCH', `/api/teams/${T}`, { settings: { membersCanAssign: true } })).statusCode, 403);
  let res = await bob('PATCH', `/api/teams/${T}`, { settings: { membersCanAssign: true } });
  assert.equal(res.json().settings.membersCanAssign, true);
  res = await give(ann, { id: 'from-ann-1', assignee: 'cat', title: 'Check the stock' });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().assignedBy, 'ann');
  // Ann follows what she gave: sees it, changes it, is told when it's done. She can't delete it.
  assert.deepEqual((await ann('GET', `/api/teams/${T}/tasks?from=${TODAY}&to=${TODAY}`)).json().tasks.map((t) => t.id), ['from-ann-1']);
  assert.equal((await ann('PATCH', `/api/teams/${T}/tasks/from-ann-1`, { priority: 1 })).statusCode, 200);
  assert.equal((await ann('DELETE', `/api/teams/${T}/tasks/from-ann-1`)).statusCode, 403);
  assert.equal((await ann('GET', '/api/tasks/from-ann-1/comments')).statusCode, 200);
  await cat('PATCH', '/api/tasks/from-ann-1', { status: 'done' });
  assert.equal((await notes(ann)).notifications[0].kind, 'done');
  // Cat (a member) can't change Ann's tasks given by someone else.
  await give(boss, { id: 'from-boss-1', assignee: 'ann' });
  assert.equal((await cat('PATCH', `/api/teams/${T}/tasks/from-boss-1`, { priority: 1 })).statusCode, 403);

  // Activity: admins only, newest first, paged.
  assert.equal((await ann('GET', `/api/teams/${T}/activity`)).statusCode, 403);
  const activity = (await boss('GET', `/api/teams/${T}/activity`)).json().activity;
  assert.deepEqual(activity.slice(0, 4).map((a) => [a.action, a.name]), [
    ['given', 'Boss'], ['completed', 'Cat'], ['edited', 'Ann'], ['given', 'Ann'],
  ]);
  assert.ok(activity.some((a) => a.action === 'created'));
  assert.ok(activity.some((a) => a.action === 'joined' && a.uid === 'cat'));
  const page = (await boss('GET', `/api/teams/${T}/activity?before=${activity[1].id}`)).json().activity;
  assert.equal(page[0].id, activity[2].id);

  // Archived: read-only until its owner brings it back.
  assert.equal((await bob('POST', `/api/teams/${T}/archive`, { archived: true })).statusCode, 403);
  res = await boss('POST', `/api/teams/${T}/archive`, { archived: true });
  assert.equal(res.json().archived, true);
  assert.equal((await give(boss, { assignee: 'ann' })).statusCode, 409);
  assert.equal((await boss('PATCH', `/api/teams/${T}`, { name: 'New' })).statusCode, 409);
  assert.equal((await boss('POST', `/api/teams/${T}/invites`, { emails: ['x@example.com'] })).statusCode, 409);
  assert.equal((await ann('POST', '/api/tasks/from-boss-1/comments', { text: 'hi' })).statusCode, 409);
  assert.equal((await boss('GET', `/api/teams/${T}/tasks?from=${TODAY}&to=${TODAY}`)).statusCode, 200);
  // People still finish the tasks they have.
  assert.equal((await ann('PATCH', '/api/tasks/from-boss-1', { status: 'done' })).statusCode, 200);
  res = await boss('POST', `/api/teams/${T}/archive`, { archived: false });
  assert.equal(res.json().archived, false);
  assert.equal((await give(boss, { assignee: 'ann' })).statusCode, 201);
});

test('background jobs: late notices once a day, the Monday report for admins', async () => {
  const ctx = await setup();
  const { boss, ann, bob } = await acme(ctx);
  await give(boss, { id: 'late-task-1', assignee: 'ann', dueAt: `${TODAY}T12:00` });
  await give(boss, { id: 'done-task-1', assignee: 'bob' });
  await bob('PATCH', '/api/tasks/done-task-1', { status: 'done' });
  ctx.setNow('2026-10-19T07:00:00Z'); // Monday
  ctx.app.runTeamJobs();
  ctx.app.runTeamJobs();
  const late = (await notes(ann)).notifications.filter((n) => n.kind === 'late');
  assert.equal(late.length, 1);
  assert.match(late[0].title, /1 team task is late/);
  for (const who of [boss, bob]) {
    const weekly = (await notes(who)).notifications.filter((n) => n.kind === 'weekly');
    assert.equal(weekly.length, 1);
    assert.equal(weekly[0].title, 'Last week in Acme');
    assert.match(weekly[0].body, /^1 done · 1 late · most done: Bob \(1\)$/);
  }
  assert.equal((await notes(ann)).notifications.filter((n) => n.kind === 'weekly').length, 0);
  // The morning digest: once a day, for admins, only when there's something to say.
  const digest = (await notes(boss)).notifications.filter((n) => n.kind === 'digest');
  assert.equal(digest.length, 1);
  assert.equal(digest[0].title, 'Today in Acme');
  assert.equal(digest[0].body, '0 due today · 1 late');
  assert.equal((await notes(ann)).notifications.filter((n) => n.kind === 'digest').length, 0);
});

test('a deleted team task takes its files along after the undo window; leaving clears the team bits', async () => {
  const ctx = await setup();
  const { boss, ann } = await acme(ctx);
  await give(boss, { id: 'file-task-1', assignee: 'ann', needsReview: true, teamTagIds: [] });
  const data = `data:text/plain;base64,${Buffer.from('x').toString('base64')}`;
  await boss('POST', `/api/teams/${T}/tasks/file-task-1/files`, { id: 'file-del-01', name: 'x.txt', data });
  assert.equal((await boss('DELETE', `/api/teams/${T}/tasks/file-task-1`)).statusCode, 204);
  assert.equal(fs.existsSync(path.join(ctx.filesDir, 'file-del-01.bin')), true); // still undoable
  ctx.setNow('2026-10-19T09:00:00Z');
  ctx.app.sweepAttachments();
  // The sweep uses the real clock for the cutoff; the row was orphaned "now", so make it old.
  ctx.db.prepare('UPDATE task_files SET orphaned_at = 1').run();
  ctx.app.sweepAttachments();
  assert.equal(fs.existsSync(path.join(ctx.filesDir, 'file-del-01.bin')), false);

  ctx.setNow(`${TODAY}T09:00:00Z`);
  await give(boss, { id: 'keep-task-1', assignee: 'ann', needsReview: true });
  await ann('DELETE', `/api/teams/${T}/members/ann`);
  const t = await myTask(ann, 'keep-task-1');
  assert.deepEqual([t.teamId, t.needsReview, t.groupId], [null, false, null]);
});

test('review fixes (2.0): access ends when you leave, ids and threads stay in their team, no self sign-off, no skipped days', async () => {
  const ctx = await setup();
  const { boss, ann, bob, cat } = await acme(ctx);
  const mal = await ctx.as('mal');

  // Bob (an admin) gives a task, then is removed: he no longer sees its comments or files.
  await give(bob, { id: 'from-bob-01', assignee: 'ann' });
  await ann('POST', '/api/tasks/from-bob-01/comments', { text: 'Secret plan' });
  await bob('POST', `/api/teams/${T}/tasks/from-bob-01/files`, { id: 'file-bob-01', name: 'x.txt', data: `data:text/plain;base64,${Buffer.from('x').toString('base64')}` });
  assert.equal((await bob('GET', '/api/tasks/from-bob-01/comments')).statusCode, 200);
  await boss('PATCH', `/api/teams/${T}/members/bob`, { role: 'member' });
  await boss('DELETE', `/api/teams/${T}/members/bob`);
  assert.equal((await bob('GET', '/api/tasks/from-bob-01/comments')).statusCode, 404);
  assert.equal((await bob('POST', '/api/tasks/from-bob-01/comments', { text: 'hi' })).statusCode, 404);
  assert.equal((await bob('GET', '/api/files/file-bob-01')).statusCode, 404);
  const before = (await notes(bob)).notifications.length;
  await ann('POST', '/api/tasks/from-bob-01/comments', { text: 'Another secret' });
  assert.equal((await notes(bob)).notifications.length, before);

  // A group's thread id can't be borrowed by another team.
  await give(boss, { id: 'groupGGG1', assignees: ['ann', 'cat'], title: 'Shared' });
  await ann('POST', '/api/tasks/groupGGG1-0/comments', { text: 'Group secret' });
  await mal('POST', '/api/teams', { id: 'team-mal-1', name: 'Mal' });
  assert.equal((await mal('POST', '/api/teams/team-mal-1/tasks', { id: 'groupGGG1', assignee: 'mal', title: 'x', date: TODAY, today: TODAY })).statusCode, 409);
  await mal('POST', '/api/tasks', { id: 'groupGGG1x', title: 'x', date: TODAY, today: TODAY });
  // A plain task with an id another team used for a thread has no team: no comments.
  assert.equal((await mal('GET', '/api/tasks/groupGGG1x/comments')).statusCode, 404);

  // Someone else's task id isn't handed back as a "retry".
  await boss('PATCH', `/api/teams/${T}`, { settings: { membersCanAssign: true } });
  assert.equal((await give(cat, { id: 'groupGGG1-0', assignee: 'cat' })).statusCode, 409);
  assert.equal((await give(cat, { id: 'groupGGG1', assignees: ['cat', 'ann'] })).statusCode, 409);

  // Approved stays approved, even by unticking a step.
  await give(boss, { id: 'steps-task-1', assignee: 'ann', needsReview: true, subtasks: [{ id: 'step-0001', title: 'A', done: false }] });
  await ann('PATCH', '/api/tasks/steps-task-1', { subtasks: [{ id: 'step-0001', title: 'A', done: true }] });
  await boss('POST', `/api/teams/${T}/tasks/steps-task-1/review`, { decision: 'approve' });
  assert.equal((await ann('PATCH', '/api/tasks/steps-task-1', { subtasks: [{ id: 'step-0001', title: 'A', done: false }] })).statusCode, 403);

  // A member can't sign off their own work.
  await give(cat, { id: 'self-task-1', assignee: 'cat', needsReview: true });
  await cat('PATCH', '/api/tasks/self-task-1', { status: 'done' });
  assert.equal((await cat('POST', `/api/teams/${T}/tasks/self-task-1/review`, { decision: 'approve' })).statusCode, 403);
  assert.equal((await cat('PATCH', `/api/teams/${T}/tasks/self-task-1`, { status: 'pending' })).statusCode, 403);

  // A deleted team tag leaves templates and repeating tasks too.
  await boss('POST', `/api/teams/${T}/tags`, { id: 'ttag-gone1', name: 'Gone' });
  await boss('POST', `/api/teams/${T}/templates`, { id: 'tmpl-gone1', name: 'T', data: { title: 'T', teamTagIds: ['ttag-gone1'] } });
  await boss('POST', `/api/teams/${T}/recurring`, { id: 'rec-gone-1', data: { title: 'R', assignees: ['ann'], teamTagIds: ['ttag-gone1'] }, rule: { freq: 'weekly', days: [3] }, today: TODAY });
  await boss('DELETE', `/api/teams/${T}/tags/ttag-gone1`);
  assert.deepEqual((await boss('GET', `/api/teams/${T}/templates`)).json().templates[0].teamTagIds, []);
  assert.deepEqual((await boss('GET', `/api/teams/${T}/recurring`)).json().recurring.find((r) => r.id === 'rec-gone-1').teamTagIds, []);

  // A declined join request can't be repeated right away (no spam for the admins).
  const link = (await boss('POST', `/api/teams/${T}/link`)).json().link;
  await mal('POST', `/api/join/${link.token}`);
  await boss('POST', `/api/teams/${T}/requests/mal`, { approve: false });
  assert.equal((await mal('POST', `/api/join/${link.token}`)).statusCode, 429);

  // An empty job title clears it.
  await ann('PATCH', `/api/teams/${T}/members/ann`, { title: 'Designer' });
  const res = await ann('PATCH', `/api/teams/${T}/members/ann`, { title: '  ' });
  assert.equal(res.json().members.find((m) => m.uid === 'ann').title, null);

  // Someone a day ahead doesn't make the server skip its own day.
  ctx.setNow('2026-10-17T10:00:00Z');
  await boss('POST', `/api/teams/${T}/recurring`, { id: 'rec-skip-1', data: { title: 'Daily', assignees: ['ann'] }, rule: { freq: 'daily' }, today: TODAY });
  ctx.setNow('2026-10-19T00:01:00Z');
  await mal('GET', '/api/sync?today=2026-10-20');
  const days = ctx.db.prepare("SELECT date FROM tasks WHERE recurring_id = 'rec-skip-1' ORDER BY date").all().map((r) => r.date);
  assert.deepEqual(days, ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
});
