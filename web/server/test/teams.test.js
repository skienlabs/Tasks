import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { buildApp } from '../src/app.js';
import { createDevVerifier, createVerifier } from '../src/auth.js';
import { openDb } from '../src/db.js';

const PROJECT = 'tasks-test';
const TODAY = '2026-10-17';
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

async function setup({ apkPath } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const verify = createVerifier({ projectId: PROJECT, keys: createLocalJWKSet({ keys: [jwk] }) });
  const db = openDb(':memory:');
  const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-files-'));
  const published = [];
  const events = {
    open() {},
    publish(uid, change, source) {
      published.push({ uid, ...change, source });
    },
    closeAll() {},
  };
  const app = buildApp({
    db, verify, events,
    config: { firebase: { projectId: PROJECT }, devAuth: false, staticDir: '/nonexistent', filesDir, apkPath },
    clock: () => Date.parse('2026-10-17T09:00:00Z'),
  });

  async function token(sub, extra = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      auth_time: now, email: `${sub}@example.com`, email_verified: true, name: sub[0].toUpperCase() + sub.slice(1),
      firebase: { sign_in_provider: 'google.com' }, ...extra,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setSubject(sub)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
  }
  async function as(sub, extra) {
    const auth = { authorization: `Bearer ${await token(sub, extra)}`, 'x-client-id': `client-${sub}` };
    const call = (method, url, payload) => app.inject({ method, url, payload, headers: auth });
    await call('GET', '/api/me'); // the person has used the app (known by email)
    return call;
  }
  return { app, as, db, published };
}

/** boss makes "Acme" and invites ann (member) and bob (admin); both accept. */
async function acme(ctx) {
  const boss = await ctx.as('boss');
  const ann = await ctx.as('ann');
  const bob = await ctx.as('bob');
  let res = await boss('POST', '/api/teams', { id: 'team-acme-1', name: '  Acme   Corp ', color: 'teal' });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().name, 'Acme Corp');
  assert.equal(res.json().role, 'owner');
  res = await boss('POST', '/api/teams/team-acme-1/invites', { emails: ['ANN@example.com ', 'ann@example.com'] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().invited, ['ann@example.com']);
  await boss('POST', '/api/teams/team-acme-1/invites', { emails: ['bob@example.com'], role: 'admin' });
  for (const who of [ann, bob]) {
    const invite = (await who('GET', '/api/invites')).json().invites[0];
    res = await who('POST', `/api/invites/${invite.id}/accept`);
    assert.equal(res.statusCode, 200);
  }
  return { boss, ann, bob };
}

test('teams: create, invite by email, accept, see members', async () => {
  const ctx = await setup();
  const boss = await ctx.as('boss');
  const ann = await ctx.as('ann');
  const eve = await ctx.as('eve');

  let res = await boss('POST', '/api/teams', { id: 'team-acme-1', name: 'Acme' });
  assert.equal(res.statusCode, 201);
  // Creating again with the same id is a harmless retry.
  assert.equal((await boss('POST', '/api/teams', { id: 'team-acme-1', name: 'Acme' })).statusCode, 200);
  assert.equal((await eve('POST', '/api/teams', { id: 'team-acme-1', name: 'Mine' })).statusCode, 409);

  assert.equal((await boss('POST', '/api/teams/team-acme-1/invites', { emails: ['not an email'] })).statusCode, 400);
  assert.equal((await boss('POST', '/api/teams/team-acme-1/invites', { emails: ['ann@example'] })).statusCode, 400);
  ctx.published.length = 0;
  res = await boss('POST', '/api/teams/team-acme-1/invites', { emails: ['ann@example.com', 'new@example.com'] });
  assert.deepEqual(res.json().invited, ['ann@example.com', 'new@example.com']);
  assert.equal(res.json().team.invites.length, 2);
  assert.equal(res.json().team.invites[0].invitedByName, 'Boss');
  // Ann already uses the app: she hears about the invite right away.
  assert.ok(ctx.published.some((e) => e.uid === 'ann' && e.type === 'invites'));

  // Outsiders can't see or use the team.
  assert.equal((await eve('PATCH', '/api/teams/team-acme-1', { name: 'Mine' })).statusCode, 404);
  assert.equal((await eve('POST', '/api/teams/team-acme-1/invites', { emails: ['x@example.com'] })).statusCode, 404);
  assert.deepEqual((await eve('GET', '/api/invites')).json().invites, []);

  const invites = (await ann('GET', '/api/invites')).json().invites;
  assert.equal(invites.length, 1);
  assert.equal(invites[0].teamName, 'Acme');
  assert.equal(invites[0].invitedByName, 'Boss');
  assert.equal(invites[0].memberCount, 1);
  // Someone else can't accept Ann's invite.
  assert.equal((await eve('POST', `/api/invites/${invites[0].id}/accept`)).statusCode, 404);
  // Unverified email: not yet.
  const annUnverified = await ctx.as('ann', { email_verified: false, firebase: { sign_in_provider: 'password' } });
  assert.equal((await annUnverified('POST', `/api/invites/${invites[0].id}/accept`)).statusCode, 403);

  res = await ann('POST', `/api/invites/${invites[0].id}/accept`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().team.role, 'member');
  assert.deepEqual(res.json().team.invites, []); // members don't see the team's invites
  assert.deepEqual(res.json().team.members.map((m) => [m.name, m.role, m.email]), [
    ['Boss', 'owner', 'boss@example.com'], ['Ann', 'member', 'ann@example.com'],
  ]);
  assert.equal((await ann('POST', `/api/invites/${invites[0].id}/accept`)).statusCode, 404); // used up

  // Inviting someone who is already in: skipped.
  res = await boss('POST', '/api/teams/team-acme-1/invites', { emails: ['ann@example.com'] });
  assert.deepEqual(res.json().invited, []);
  assert.deepEqual(res.json().alreadyMembers, ['ann@example.com']);

  // A member can't invite or rename; the owner can cancel an invite.
  assert.equal((await ann('POST', '/api/teams/team-acme-1/invites', { emails: ['x@example.com'] })).statusCode, 403);
  assert.equal((await ann('PATCH', '/api/teams/team-acme-1', { name: 'Ann Co' })).statusCode, 403);
  const pending = (await boss('GET', '/api/teams')).json().teams[0].invites;
  assert.deepEqual(pending.map((i) => i.email), ['new@example.com']);
  res = await boss('DELETE', `/api/teams/team-acme-1/invites/${pending[0].id}`);
  assert.equal(res.json().invites.length, 0);

  // Declining removes it.
  await boss('POST', '/api/teams/team-acme-1/invites', { emails: ['eve@example.com'] });
  const eveInvite = (await eve('GET', '/api/invites')).json().invites[0];
  assert.equal((await eve('POST', `/api/invites/${eveInvite.id}/decline`)).statusCode, 204);
  assert.deepEqual((await eve('GET', '/api/invites')).json().invites, []);
  assert.deepEqual((await eve('GET', '/api/teams')).json().teams, []);

  // The offline copy carries teams and invites too.
  const sync = (await ann('GET', `/api/sync?today=${TODAY}`)).json();
  assert.equal(sync.teams.length, 1);
  assert.deepEqual(sync.invites, []);
});

test('teams: roles — admins, handing over, leaving, removing', async () => {
  const ctx = await setup();
  const { boss, ann, bob } = await acme(ctx);
  const team = (await boss('GET', '/api/teams')).json().teams[0];
  assert.deepEqual(team.members.map((m) => m.role), ['owner', 'admin', 'member']); // owner, admins, members

  // Members can't change roles; an admin can make a member an admin, not the reverse.
  assert.equal((await ann('PATCH', '/api/teams/team-acme-1/members/bob', { role: 'member' })).statusCode, 403);
  assert.equal((await bob('PATCH', '/api/teams/team-acme-1/members/ann', { role: 'admin' })).statusCode, 200);
  assert.equal((await bob('PATCH', '/api/teams/team-acme-1/members/ann', { role: 'member' })).statusCode, 403);
  assert.equal((await bob('PATCH', '/api/teams/team-acme-1/members/boss', { role: 'member' })).statusCode, 403);
  assert.equal((await bob('PATCH', '/api/teams/team-acme-1/members/ann', { role: 'owner' })).statusCode, 403);
  assert.equal((await boss('PATCH', '/api/teams/team-acme-1/members/ann', { role: 'member' })).statusCode, 200);
  assert.equal((await boss('PATCH', '/api/teams/team-acme-1/members/nobody', { role: 'admin' })).statusCode, 404);

  // The owner can't just leave; they hand the team over first.
  assert.equal((await boss('DELETE', '/api/teams/team-acme-1/members/boss')).statusCode, 409);
  let res = await boss('PATCH', '/api/teams/team-acme-1/members/bob', { role: 'owner' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().role, 'admin');
  assert.equal(res.json().members.find((m) => m.uid === 'bob').role, 'owner');

  // An admin can't remove another admin; the owner can. Anyone can leave.
  assert.equal((await boss('DELETE', '/api/teams/team-acme-1/members/bob')).statusCode, 403);
  assert.equal((await ann('DELETE', '/api/teams/team-acme-1/members/boss')).statusCode, 403);
  assert.equal((await ann('DELETE', '/api/teams/team-acme-1/members/ann')).statusCode, 204);
  assert.deepEqual((await ann('GET', '/api/teams')).json().teams, []);
  assert.equal((await bob('DELETE', '/api/teams/team-acme-1/members/boss')).statusCode, 204);
  assert.equal((await boss('GET', '/api/teams')).json().teams.length, 0);

  // Only the owner deletes the team.
  assert.equal((await bob('DELETE', '/api/teams/team-acme-1')).statusCode, 204);
  assert.equal((await bob('GET', '/api/teams')).json().teams.length, 0);
});

test('team tasks: admins give them out, the person works on them, admins follow along', async () => {
  const ctx = await setup();
  const { boss, ann, bob } = await acme(ctx);
  const eve = await ctx.as('eve');
  const steps = [
    { id: 'step-0001', title: 'Draft', done: false },
    { id: 'step-0002', title: 'Send', done: false },
  ];

  // Only admins give out tasks, only to people in the team.
  const body = {
    id: 'team-task-1', assignee: 'ann', title: 'Quarterly report', date: TODAY, today: TODAY,
    priority: 1, dueAt: '2026-10-20T17:00', subtasks: steps, notes: 'Use the new template',
  };
  assert.equal((await ann('POST', '/api/teams/team-acme-1/tasks', { ...body, assignee: 'bob' })).statusCode, 403);
  assert.equal((await boss('POST', '/api/teams/team-acme-1/tasks', { ...body, assignee: 'eve' })).statusCode, 400);
  assert.equal((await boss('POST', '/api/teams/team-acme-1/tasks', { ...body, dueAt: '2026-10-20T25:00' })).statusCode, 400);
  assert.equal((await boss('POST', '/api/teams/team-acme-1/tasks', { ...body, date: '2026-10-10' })).statusCode, 400);
  ctx.published.length = 0;
  let res = await boss('POST', '/api/teams/team-acme-1/tasks', body);
  assert.equal(res.statusCode, 201);
  let t = res.json();
  assert.equal(t.assignee, 'ann');
  assert.equal(t.assignedBy, 'boss');
  assert.equal(t.teamId, 'team-acme-1');
  assert.equal(t.dueAt, '2026-10-20T17:00');
  assert.ok(ctx.published.some((e) => e.uid === 'ann' && e.type === 'tasks' && e.dates.includes(TODAY)));
  assert.ok(ctx.published.some((e) => e.uid === 'bob' && e.type === 'teams' && e.tasks));
  // A retry is harmless.
  assert.equal((await boss('POST', '/api/teams/team-acme-1/tasks', body)).statusCode, 200);

  // It's in Ann's own list (and not in Boss's).
  let mine = (await ann('GET', `/api/tasks?date=${TODAY}`)).json().tasks;
  assert.deepEqual(mine.map((x) => x.title), ['Quarterly report']);
  assert.equal((await boss('GET', `/api/tasks?date=${TODAY}`)).json().tasks.length, 0);

  // Ann works on it: ticks a step, writes notes, tags it with her own tag, adds a picture...
  const tag = (await ann('POST', '/api/tags', { id: 'tag-ann-01', name: 'Work' })).json();
  ctx.published.length = 0;
  res = await ann('PATCH', '/api/tasks/team-task-1', {
    subtasks: [{ ...steps[0], done: true }, steps[1]], notes: 'Half way', tagIds: [tag.id],
  });
  assert.equal(res.statusCode, 200);
  assert.ok(ctx.published.some((e) => e.uid === 'boss' && e.type === 'teams' && e.teamId === 'team-acme-1'));
  res = await ann('POST', '/api/tasks/team-task-1/attachments', {
    id: 'att-team-01', image: `data:image/jpeg;base64,${JPEG}`, thumb: `data:image/jpeg;base64,${JPEG}`, width: 1, height: 1,
  });
  assert.equal(res.statusCode, 201);

  // ...but doesn't change what the task is, cancel it or delete it.
  for (const change of [
    { title: 'Something easier' }, { priority: 4 }, { dueAt: null }, { status: 'cancelled' },
    { subtasks: [steps[0]] }, { subtasks: [{ ...steps[0], title: 'Skip' }, steps[1]] },
  ]) {
    assert.equal((await ann('PATCH', '/api/tasks/team-task-1', change)).statusCode, 403, JSON.stringify(change));
  }
  assert.equal((await ann('PATCH', '/api/tasks/team-task-1', { title: 'Quarterly report', priority: 1 })).statusCode, 200);
  assert.equal((await ann('DELETE', '/api/tasks/team-task-1')).statusCode, 403);
  assert.equal((await ann('PATCH', '/api/teams/team-acme-1/tasks/team-task-1', { title: 'x' })).statusCode, 403);

  // Admins see the team's tasks (without Ann's personal tags) and the images on them.
  assert.equal((await ann('GET', `/api/teams/team-acme-1/tasks?from=${TODAY}&to=${TODAY}`)).statusCode, 403);
  assert.equal((await eve('GET', `/api/teams/team-acme-1/tasks?from=${TODAY}&to=${TODAY}`)).statusCode, 404);
  let board = (await bob('GET', `/api/teams/team-acme-1/tasks?from=${TODAY}&to=${TODAY}`)).json().tasks;
  assert.equal(board.length, 1);
  assert.equal(board[0].notes, 'Half way');
  assert.deepEqual(board[0].tagIds, []);
  assert.equal(board[0].attachments.length, 1);
  assert.equal((await bob('GET', '/api/attachments/att-team-01?size=thumb')).statusCode, 200);
  assert.equal((await eve('GET', '/api/attachments/att-team-01')).statusCode, 404);

  // Ann postpones it and finishes it.
  res = await ann('POST', '/api/tasks/team-task-1/postpone', { today: TODAY, from: TODAY });
  assert.equal(res.json().date, '2026-10-18');
  res = await ann('PATCH', '/api/tasks/team-task-1', { subtasks: steps.map((s) => ({ ...s, done: true })) });
  assert.equal(res.json().status, 'done');
  board = (await boss('GET', '/api/teams/team-acme-1/tasks?from=2026-10-18&to=2026-10-18')).json().tasks;
  assert.equal(board[0].status, 'done');
  // Done tasks outside the range are left out; open ones are always there.
  assert.equal((await boss('GET', '/api/teams/team-acme-1/tasks?from=2026-10-01&to=2026-10-02')).json().tasks.length, 0);

  // An admin edits it and gives it to Bob: Ann's tags stay with Ann, the image goes along.
  res = await boss('PATCH', '/api/teams/team-acme-1/tasks/team-task-1', {
    assignee: 'bob', status: 'pending', title: 'Quarterly report v2', dueAt: null,
  });
  assert.equal(res.statusCode, 200);
  t = res.json();
  assert.equal(t.assignee, 'bob');
  assert.equal(t.title, 'Quarterly report v2');
  assert.equal(t.dueAt, null);
  assert.equal(t.status, 'pending');
  assert.equal((await ann('GET', '/api/tasks?date=2026-10-18')).json().tasks.length, 0);
  mine = (await bob('GET', '/api/tasks?date=2026-10-18')).json().tasks;
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].tagIds, []);
  assert.equal(mine[0].attachments.length, 1);
  assert.equal((await bob('GET', '/api/attachments/att-team-01')).statusCode, 200);
  assert.equal((await ann('GET', '/api/attachments/att-team-01')).statusCode, 404);
  assert.equal((await boss('PATCH', '/api/teams/team-acme-1/tasks/team-task-1', { assignee: 'eve' })).statusCode, 400);

  // An admin with a team task of their own can do everything with it.
  assert.equal((await bob('PATCH', '/api/tasks/team-task-1', { title: 'Report' })).statusCode, 200);

  // Admin deletes a team task.
  await boss('POST', '/api/teams/team-acme-1/tasks', { ...body, id: 'team-task-2', subtasks: [] });
  assert.equal((await boss('DELETE', '/api/teams/team-acme-1/tasks/team-task-2')).statusCode, 204);
  assert.equal((await ann('GET', `/api/tasks?date=${TODAY}`)).json().tasks.length, 0);
  assert.equal((await boss('DELETE', '/api/teams/team-acme-1/tasks/team-task-2')).statusCode, 404);

  // Personal tasks of teammates stay private.
  await ann('POST', '/api/tasks', { id: 'personal-01', title: 'Dentist', date: TODAY, today: TODAY });
  assert.equal((await boss('PATCH', '/api/teams/team-acme-1/tasks/personal-01', { title: 'x' })).statusCode, 404);
  board = (await boss('GET', `/api/teams/team-acme-1/tasks?from=${TODAY}&to=${TODAY}`)).json().tasks;
  assert.ok(!board.some((x) => x.id === 'personal-01'));
  // Members can't make team tasks through their own list either.
  assert.equal((await ann('POST', '/api/tasks', { title: 'x', date: TODAY, teamId: 'team-acme-1' })).statusCode, 403);
});

test('team tasks stay with their people when they leave or the team is deleted', async () => {
  const ctx = await setup();
  const { boss, ann, bob } = await acme(ctx);
  await boss('POST', '/api/teams/team-acme-1/tasks', { id: 'team-task-a', assignee: 'ann', title: 'A', date: TODAY });
  await boss('POST', '/api/teams/team-acme-1/tasks', { id: 'team-task-b', assignee: 'bob', title: 'B', date: TODAY });

  assert.equal((await boss('DELETE', '/api/teams/team-acme-1/members/ann')).statusCode, 204);
  let t = (await ann('GET', `/api/tasks?date=${TODAY}`)).json().tasks[0];
  assert.equal(t.teamId, null);
  assert.equal(t.assignedBy, null);
  assert.equal((await ann('PATCH', '/api/tasks/team-task-a', { title: 'Mine now' })).statusCode, 200);

  assert.equal((await boss('DELETE', '/api/teams/team-acme-1')).statusCode, 204);
  t = (await bob('GET', `/api/tasks?date=${TODAY}`)).json().tasks[0];
  assert.equal(t.teamId, null);
  assert.equal((await bob('DELETE', '/api/tasks/team-task-b')).statusCode, 204);
});

test('deadlines on personal tasks', async () => {
  const ctx = await setup();
  const me = await ctx.as('solo');
  let res = await me('POST', '/api/tasks', { id: 'due-task-1', title: 'Pay rent', date: TODAY, dueAt: '2026-10-31T23:59' });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().dueAt, '2026-10-31T23:59');
  for (const dueAt of ['2026-02-30T10:00', '2026-10-31 10:00', '2026-10-31T10:60', '2026-10-31T24:00', '2026-10-31']) {
    assert.equal((await me('PATCH', '/api/tasks/due-task-1', { dueAt })).statusCode, 400, dueAt);
  }
  res = await me('PATCH', '/api/tasks/due-task-1', { dueAt: '2026-11-01T09:30' });
  assert.equal(res.json().dueAt, '2026-11-01T09:30');
  res = await me('PATCH', '/api/tasks/due-task-1', { title: 'Pay the rent' });
  assert.equal(res.json().dueAt, '2026-11-01T09:30'); // other edits keep it
  res = await me('PATCH', '/api/tasks/due-task-1', { dueAt: null });
  assert.equal(res.json().dueAt, null);
  res = await me('POST', '/api/tasks', { id: 'due-task-2', title: 'No limit', date: TODAY });
  assert.equal(res.json().dueAt, null);
});

test('Android app download', async () => {
  let ctx = await setup({ apkPath: '/nonexistent/Tasks.apk' });
  assert.equal((await ctx.app.inject('/api/config')).json().android, null);
  assert.equal((await ctx.app.inject('/download/android')).statusCode, 404);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-apk-'));
  const apk = path.join(dir, 'Tasks.apk');
  fs.writeFileSync(apk, Buffer.from('PK\u0003\u0004fake apk'));
  ctx = await setup({ apkPath: apk });
  const info = (await ctx.app.inject('/api/config')).json().android;
  assert.equal(info.size, 12);
  const res = await ctx.app.inject('/download/android');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/vnd.android.package-archive');
  assert.match(res.headers['content-disposition'], /attachment; filename="Tasks.apk"/);
  assert.equal(res.body, 'PK\u0003\u0004fake apk');
});

test('dev sign-in: dev:<name> is another person (development only)', async () => {
  const verify = createDevVerifier();
  assert.equal((await verify('')).uid, 'dev-user');
  assert.equal((await verify('anything')).uid, 'dev-user');
  const ann = await verify('dev:ann');
  assert.equal(ann.uid, 'dev-ann');
  assert.equal(ann.email, 'ann@localhost');
  assert.equal(ann.name, 'Ann');
  assert.equal((await verify('dev:../x')).uid, 'dev-user');
});

test('review fixes: verified invites only, cancelled stays cancelled, honest "given by", undo by an ex-admin', async () => {
  const ctx = await setup();
  const { boss, ann, bob } = await acme(ctx);
  // An unverified sign-up with someone else's address sees and touches nothing.
  await boss('POST', '/api/teams/team-acme-1/invites', { emails: ['carol@example.com'] });
  const fake = await ctx.as('mallory', { email: 'carol@example.com', email_verified: false, firebase: { sign_in_provider: 'password' } });
  assert.deepEqual((await fake('GET', '/api/invites')).json().invites, []);
  assert.deepEqual((await fake('GET', `/api/sync?today=${TODAY}`)).json().invites, []);
  const inviteId = (await boss('GET', '/api/teams')).json().teams[0].invites[0].id;
  assert.equal((await fake('POST', `/api/invites/${inviteId}/decline`)).statusCode, 403);
  assert.equal((await boss('GET', '/api/teams')).json().teams[0].invites.length, 1);

  // A task its admins cancelled can't be reopened or completed by the member.
  await boss('POST', '/api/teams/team-acme-1/tasks', { id: 'team-task-c', assignee: 'ann', title: 'C', date: TODAY });
  await boss('PATCH', '/api/teams/team-acme-1/tasks/team-task-c', { status: 'cancelled' });
  for (const status of ['pending', 'done']) {
    assert.equal((await ann('PATCH', '/api/tasks/team-task-c', { status })).statusCode, 403);
  }
  assert.equal((await ann('PATCH', '/api/tasks/team-task-c', { notes: 'ok' })).statusCode, 200);

  // "Given by" can't be made up on a new task.
  let t = (await bob('POST', '/api/tasks', { id: 'team-task-d', title: 'D', date: TODAY, teamId: 'team-acme-1', assignedBy: 'boss' })).json();
  assert.equal(t.assignedBy, 'bob');
  // Undo of a delete restores who gave it...
  await bob('DELETE', '/api/tasks/team-task-d');
  t = (await bob('POST', '/api/tasks', { id: 'team-task-d', title: 'D', date: TODAY, teamId: 'team-acme-1', assignedBy: 'bob', createdAt: 1 })).json();
  assert.equal(t.teamId, 'team-acme-1');
  // ...and by someone who is no longer an admin, it comes back as their own task.
  await bob('DELETE', '/api/tasks/team-task-d');
  await boss('PATCH', '/api/teams/team-acme-1/members/bob', { role: 'member' });
  const res = await bob('POST', '/api/tasks', { id: 'team-task-d', title: 'D', date: TODAY, teamId: 'team-acme-1', assignedBy: 'bob', createdAt: 1 });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().teamId, null);
  assert.equal((await bob('POST', '/api/tasks', { title: 'E', date: TODAY, teamId: 'team-acme-1' })).statusCode, 403);

  // Reassigning and editing happen together (nested transactions join).
  await boss('POST', '/api/teams/team-acme-1/tasks', { id: 'team-task-r', assignee: 'ann', title: 'R', date: TODAY });
  t = (await boss('PATCH', '/api/teams/team-acme-1/tasks/team-task-r', { assignee: 'bob', title: 'R2' })).json();
  assert.equal(t.assignee, 'bob');
  assert.equal(t.title, 'R2');
});
