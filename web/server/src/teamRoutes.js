// Teams: everything about working together. A team has one owner, admins and members.
//
// A team task is an ordinary task owned by the person it's for (tasks.uid), marked with team_id
// and assigned_by, so it sits in their own list, carries over and works offline. The team's
// admins follow and manage it from here. Since 2.0: sign-off (review), one task for several
// people, team tags, repeating tasks, templates, comments, files, sub-groups, job titles, invite
// links, an activity log, notifications, settings and archived teams.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { MAX_MEMBERS, MAX_PENDING_INVITES, MAX_TEAMS_PER_USER } from './teams.js';
import { normalizeSubtasks } from './subtasks.js';
import { addDays, daysBetween, isValidDate } from './dates.js';
import {
  DATE, DUE_AT, EMAIL, HttpError, ID, IMAGE_DATA_URL, MAX_ATTACHMENTS, MAX_IMAGE_BYTES, MAX_INVITES_AT_ONCE, MAX_THUMB_BYTES,
  NOTES, PRIORITY, STATUS, SUBTASKS, TAG_COLOR, TAG_LOGO, TEAM_NAME, TITLE, UID, assertDate, assertDueAt, assertLogo,
  cleanLine, cleanName, cleanNotes, cleanTitle, decodeImage, resolveStatus, sameSteps,
} from './common.js';

export const MAX_GROUPS = 30;
export const MAX_TEAM_TAGS = 50;
export const MAX_TEMPLATES = 100;
export const MAX_RECURRING = 100;
export const MAX_ASSIGNEES = 50;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 20;
const NUDGE_EVERY_MS = 30 * 60 * 1000;
const NOTIFICATION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const TIME = { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' };
const COMMENT = { type: 'string', minLength: 1, maxLength: 2000 };
const JOB_TITLE = { anyOf: [{ type: 'string', maxLength: 60 }, { type: 'null' }] };
const TEAM_TAG_IDS = { type: 'array', maxItems: 10, uniqueItems: true, items: ID };
const FILE_DATA_URL = '^data:[A-Za-z0-9.+/-]{1,100};base64,[A-Za-z0-9+/]+={0,2}$';
const TOKEN = { type: 'string', pattern: '^[A-Za-z0-9_-]{16,64}$' };
const RULE = {
  type: 'object',
  required: ['freq'],
  properties: {
    freq: { type: 'string', enum: ['daily', 'weekdays', 'weekly', 'monthly'] },
    days: { type: 'array', minItems: 1, maxItems: 7, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 6 } },
    day: { type: 'integer', minimum: 1, maximum: 31 },
  },
  additionalProperties: false,
};

const shorten = (text, n = 120) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Day of the week (0 = Sunday) of a YYYY-MM-DD date. */
const weekday = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const lastDayOfMonth = (d) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();

/** Does this repeating rule fall on day `d`? */
export function ruleMatches(rule, d) {
  const w = weekday(d);
  switch (rule.freq) {
    case 'daily': return true;
    case 'weekdays': return w >= 1 && w <= 5;
    case 'weekly': return (rule.days ?? [1]).includes(w);
    case 'monthly': {
      const day = Number(d.slice(8, 10));
      // "The 31st" means the last day in shorter months.
      return day === Math.min(rule.day ?? 1, lastDayOfMonth(d));
    }
    default: return false;
  }
}

/** The first day on or after `from` that the rule falls on. */
export function nextOccurrence(rule, from) {
  let d = from;
  for (let i = 0; i < 400; i++) {
    if (ruleMatches(rule, d)) return d;
    d = addDays(d, 1);
  }
  return null;
}

export function registerTeamRoutes(app, ctx) {
  const {
    repo, teams, config, clock, tell, tellTasks, tellTeam, isAdminRole, isTeamAdmin, plausibleToday, idParams,
    filesDir, filePath, writeFileAtomic, removeFiles,
  } = ctx;
  const now = () => clock();
  const serverToday = () => new Date(clock()).toISOString().slice(0, 10);

  // ---- Shared helpers ---------------------------------------------------------------

  const teamParams = {
    type: 'object', required: ['id'], properties: { id: ID }, additionalProperties: false,
  };
  const emailRe = config.devAuth ? /^[^\s@<>,;"]+@[^\s@<>,;"]+$/ : /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;".]{2,}$/;

  /**
   * The team and the caller's role in it; 404 for people outside it (it isn't theirs to know
   * about). `write`: refused while the team is archived.
   */
  function teamFor(req, teamId, { admin = false, owner = false, write = false } = {}) {
    const team = teams.get(teamId);
    const role = team && teams.role(teamId, req.user.uid);
    if (!role) throw new HttpError(404, 'Team not found');
    if (owner && role !== 'owner') throw new HttpError(403, 'Only the team owner can do this');
    if (admin && !isAdminRole(role)) throw new HttpError(403, 'Only team admins can do this');
    if (write && team.archived_at != null) throw new HttpError(409, 'This team is archived. Its owner can bring it back.');
    return { team, role, admin: isAdminRole(role), settings: teams.settings(team) };
  }
  const myView = (req, teamId) => teams.viewFor(teamId, req.user.uid);
  const actorName = (req) => repo.getProfile(req.user.uid)?.name ?? 'Someone';

  /** Notifies people (never the one who did it) and nudges their open apps to fetch. */
  function notify(req, uids, n) {
    const to = [...new Set(uids.filter((u) => u && u !== req?.user?.uid))];
    for (const uid of to) teams.notify(uid, { ...n, actor: req?.user?.uid ?? n.actor ?? null }, now());
    if (to.length) ctx.publish(to, { type: 'notifications' });
  }

  /** Who follows a team task: its admins and whoever gave it (when a member did). */
  function followers(task) {
    return [...teams.adminUids(task.teamId), task.assignedBy].filter((u) => u && teams.role(task.teamId, u));
  }

  /** Tells everyone who sees a team task that it changed (admins' boards, the people on it). */
  function touched(req, ...tasks) {
    for (const t of tasks.filter(Boolean)) {
      if (!t.teamId) continue;
      const uids = new Set(teams.adminUids(t.teamId));
      if (t.assignedBy) uids.add(t.assignedBy);
      if (t.groupId) for (const g of teams.groupTasks(t.groupId)) uids.add(g.owner);
      tell(req, [...uids].filter((u) => teams.role(t.teamId, u)), { type: 'teams', teamId: t.teamId, tasks: true });
    }
  }

  /** May this person see (and comment on) this team task? */
  function canSee(task, uid) {
    if (!task?.teamId) return false;
    if (task.owner === uid) return true;
    // Everyone else only while they're in the team (someone who left loses access to what they gave).
    if (!teams.role(task.teamId, uid)) return false;
    if (task.assignedBy === uid || isTeamAdmin(task.teamId, uid)) return true;
    return Boolean(task.groupId && teams.groupTasks(task.groupId).some((g) => g.owner === uid && g.teamId === task.teamId));
  }

  /** Admins change any team task; with "members can give tasks", a member changes the ones they gave. */
  function canManage(task, uid, team) {
    if (isTeamAdmin(task.teamId, uid)) return true;
    return teams.settings(team).membersCanAssign && task.assignedBy === uid && teams.role(task.teamId, uid) != null;
  }

  const thread = (task) => task.groupId ?? task.id;
  const boardTask = (task, counts) => ({ ...task, tagIds: [], comments: counts?.[thread(task)]?.count ?? 0 });

  function assertTeamTags(teamId, ids) {
    if (!ids?.length) return [];
    const known = new Set(teams.tags(teamId).map((t) => t.id));
    for (const id of ids) if (!known.has(id)) throw new HttpError(400, 'Unknown team tag');
    return ids;
  }

  /** The people a new team task is for: one person, a list, or a sub-group. */
  function assigneesOf(team, b) {
    let list = [];
    if (b.assignee) list.push(b.assignee);
    if (b.assignees) list.push(...b.assignees);
    if (b.groupId) {
      const g = teams.group(b.groupId);
      if (!g || g.team_id !== team.id) throw new HttpError(400, 'Unknown group');
      list.push(...teams.groups(team.id).find((x) => x.id === g.id).members);
    }
    list = [...new Set(list)];
    if (!list.length) throw new HttpError(400, b.groupId ? 'That group has nobody in it yet' : 'Pick who the task is for');
    if (list.length > MAX_ASSIGNEES) throw new HttpError(400, `A task can go to at most ${MAX_ASSIGNEES} people`);
    for (const uid of list) if (!teams.role(team.id, uid)) throw new HttpError(400, 'That person is not in the team');
    return list;
  }

  /**
   * Creates a team task for each person (sharing a group when there are several). Returns the
   * tasks. `by` is who gave it (or who set up the repeat).
   */
  function createTeamTasks(req, team, data, people, { id, by, recurringId = null }) {
    const created = now();
    const multi = people.length > 1;
    const groupId = multi ? id : null;
    const subtasks = normalizeSubtasks(data.subtasks ?? []);
    const out = [];
    const ids = people.map((_, i) => (multi ? `${id.slice(0, 56)}-${i}` : id));
    if (ids.some((x) => repo.idTaken(x)) || (multi && teams.groupTasks(id).length)) throw new HttpError(409, 'Id already in use');
    teams.tx(() => {
      people.forEach((uid, i) => {
        const taskId = ids[i];
        out.push(repo.insert(uid, {
          id: taskId,
          title: cleanTitle(data.title),
          notes: cleanNotes(data.notes || ''),
          priority: data.priority ?? 4,
          date: data.date,
          status: 'pending',
          originalDate: data.date,
          postponed: 0,
          carriedFrom: null,
          createdAt: created,
          updatedAt: created,
          completedAt: null,
          tagIds: [],
          subtasks,
          dueAt: data.dueAt ?? null,
          teamId: team.id,
          assignedBy: by,
          needsReview: Boolean(data.needsReview),
          groupId,
          groupMode: multi ? (data.mode ?? 'each') : null,
          teamTagIds: data.teamTagIds ?? [],
          recurringId,
        }));
      });
    });
    return out.map((t) => ({ ...t, tagIds: [] }));
  }

  /** After a person's own change to a team task: sign-off, "first one closes it", notices. */
  function afterWork(req, before, after) {
    if (!after?.teamId || !before) return;
    const uid = req.user.uid;
    const team = teams.get(after.teamId);
    if (!team) return;
    const tname = team.name;
    if (before.status !== 'done' && after.status === 'done') {
      if (after.needsReview && !isTeamAdmin(after.teamId, uid)) {
        teams.setReview(after.id, 'waiting');
        teams.log(team.id, uid, 'review-requested', after.id, { title: after.title });
        notify(req, followers(after), { kind: 'review', teamId: team.id, taskId: after.id, title: `${actorName(req)} finished a task: review it`, body: `${shorten(after.title)} · ${tname}` });
      } else {
        if (after.needsReview) teams.setReview(after.id, 'approved');
        teams.log(team.id, uid, 'completed', after.id, { title: after.title });
        notify(req, followers(after), { kind: 'done', teamId: team.id, taskId: after.id, title: `${actorName(req)} finished a task`, body: `${shorten(after.title)} · ${tname}` });
      }
      if (after.groupId && after.groupMode === 'first') {
        for (const g of teams.groupTasks(after.groupId)) {
          if (g.id === after.id || g.status !== 'pending') continue;
          teams.setClosed(g.id, uid);
          tellTasks(req, g.owner, g.date);
          notify(req, [g.owner], { kind: 'closed', teamId: team.id, taskId: g.id, title: `${actorName(req)} finished a task you shared`, body: `${shorten(g.title)} · ${tname}` });
        }
      }
    } else if (before.status === 'done' && after.status === 'pending') {
      if (after.review) teams.setReview(after.id, null);
      teams.log(team.id, uid, 'reopened', after.id, { title: after.title });
      reopenSiblings(req, after, uid);
    } else if (before.date !== after.date && after.status === 'pending') {
      teams.log(team.id, uid, 'moved', after.id, { title: after.title, from: before.date, to: after.date });
    }
  }

  /** Someone's task was opened again: the shared copies their finishing closed open again too. */
  function reopenSiblings(req, task, uid) {
    if (!task.groupId || task.groupMode !== 'first') return;
    for (const g of teams.groupTasks(task.groupId)) {
      if (g.id === task.id || g.closedBy !== uid || g.status !== 'cancelled') continue;
      teams.setClosed(g.id, null);
      tellTasks(req, g.owner, g.date);
    }
  }

  /** May a team member (not an admin) make this change to a team task given to them? */
  function memberMayChange(current, b, uid) {
    const team = teams.get(current.teamId);
    if (!team || isTeamAdmin(current.teamId, uid)) return null;
    // What the status would become (unticking a step of a finished task opens it again).
    const steps = b.subtasks !== undefined ? normalizeSubtasks(b.subtasks) : current.subtasks;
    const next = resolveStatus(current.status, b.status, steps, b.subtasks !== undefined);
    if (current.review === 'approved' && next !== current.status) {
      return 'This task was approved. Ask an admin if it needs more work.';
    }
    if (current.closedBy && next !== current.status) {
      return 'Someone else already finished this task.';
    }
    const changes = (b.title !== undefined && cleanTitle(b.title) !== current.title)
      || (b.priority !== undefined && b.priority !== current.priority)
      || (b.dueAt !== undefined && b.dueAt !== current.dueAt)
      || (b.status !== undefined && b.status !== current.status && (b.status === 'cancelled' || current.status === 'cancelled'))
      || (b.subtasks !== undefined && !sameSteps(normalizeSubtasks(b.subtasks), current.subtasks));
    return changes ? 'Only team admins can change this task. You can complete it, postpone it, tick its steps and add notes.' : null;
  }

  // ---- Background jobs: repeats, late notices, the weekly report ----------------------

  /**
   * Gives out repeating tasks due up to `today`. The server's own day is UTC, so apps also call
   * this with their (plausible) local day: someone a few hours ahead gets today's tasks on time.
   */
  function runRecurring(today = serverToday()) {
    for (const r of teams.recurringDue(today)) {
      try {
        const data = JSON.parse(r.data);
        const rule = JSON.parse(r.rule);
        // Every day it falls on that wasn't given yet, up to today; a server that was down for long
        // only catches up the last week (no backlog of a month of tasks).
        const floor = addDays(serverToday(), -7);
        const days = [];
        for (let d = r.next_date < floor ? floor : r.next_date; d <= today; d = addDays(d, 1)) if (ruleMatches(rule, d)) days.push(d);
        const next = nextOccurrence(rule, addDays(today, 1));
        for (const day of days) {
          const team = teams.get(r.team_id);
          const people = data.assignees.filter((u) => teams.role(r.team_id, u));
          const key = `rec:${r.id}:${day}`;
          if (people.length && !teams.swept(key)) {
            const dueAt = data.dueTime ? `${day}T${data.dueTime}` : null;
            const tasks = createTeamTasks(null, team, { ...data, date: day, dueAt }, people, {
              id: `r${crypto.createHash('sha256').update(key).digest('hex').slice(0, 30)}`, by: r.created_by, recurringId: r.id,
            });
            teams.markSwept(key);
            teams.log(team.id, r.created_by, 'given', tasks[0].id, { title: tasks[0].title, to: people, repeat: true });
            for (const t of tasks) {
              ctx.publish([t.assignee], { type: 'tasks', dates: [t.date] });
              notify(null, [t.assignee], { kind: 'given', teamId: team.id, taskId: t.id, actor: r.created_by, title: `New task in ${team.name}`, body: shorten(t.title) });
            }
            ctx.publish(teams.adminUids(team.id), { type: 'teams', teamId: team.id, tasks: true });
          }
        }
        teams.advanceRecurring(r.id, next ?? addDays(today, 3650));
      } catch (err) {
        app.log.error(err, 'repeating task failed');
      }
    }
  }

  function runLateNotices() {
    const today = serverToday();
    for (const { uid, teamId, count } of teams.lateTeamTasks(today)) {
      const key = `late:${uid}:${teamId}:${today}`;
      if (teams.swept(key)) continue;
      teams.markSwept(key);
      const team = teams.get(teamId);
      notify(null, [uid], { kind: 'late', teamId, title: `${plural(count, 'team task')} ${count === 1 ? 'is' : 'are'} late`, body: team?.name ?? '' });
    }
  }

  function runWeeklyReport() {
    const today = serverToday();
    if (weekday(today) !== 1) return; // Mondays
    const from = addDays(today, -7);
    const to = addDays(today, -1);
    for (const t of teams.teamsActive()) {
      const key = `weekly:${t.id}:${today}`;
      if (teams.swept(key)) continue;
      teams.markSwept(key);
      const rows = teams.weekStats(t.id, from, to, today);
      const done = rows.reduce((a, r) => a + r.done, 0);
      const late = rows.reduce((a, r) => a + r.late, 0);
      if (!rows.length) continue;
      const top = [...rows].sort((a, b) => b.done - a.done)[0];
      const topName = top && top.done > 0 ? teams.members(t.id).find((m) => m.uid === top.uid)?.name : null;
      notify(null, teams.adminUids(t.id), {
        kind: 'weekly', teamId: t.id,
        title: `Last week in ${t.name}`,
        body: `${done} done · ${late} late${topName ? ` · most done: ${topName} (${top.done})` : ''}`,
      });
    }
  }

  /** Each morning, admins get one line per team: what's due today, what's late, what waits for review. */
  function runDailyDigest() {
    const at = new Date(clock());
    if (at.getUTCHours() < (config.digestHourUtc ?? 3)) return;
    const today = serverToday();
    for (const t of teams.teamsActive()) {
      const key = `digest:${t.id}:${today}`;
      if (teams.swept(key)) continue;
      teams.markSwept(key);
      const d = teams.digest(t.id, today);
      if (!d.due && !d.late && !d.review) continue;
      notify(null, teams.adminUids(t.id), {
        kind: 'digest', teamId: t.id,
        title: `Today in ${t.name}`,
        body: [`${d.due} due today`, d.late ? `${d.late} late` : null, d.review ? `${d.review} to review` : null].filter(Boolean).join(' · '),
      });
    }
  }

  function runJobs() {
    try {
      runRecurring();
      runLateNotices();
      runWeeklyReport();
      runDailyDigest();
      teams.trimNotifications(now() - NOTIFICATION_TTL_MS);
    } catch (err) {
      app.log.error(err, 'team jobs failed');
    }
  }
  let jobTimer = null;
  app.addHook('onReady', async () => {
    runJobs();
    jobTimer = setInterval(runJobs, 15 * 60 * 1000);
    jobTimer.unref();
  });
  app.addHook('onClose', async () => clearInterval(jobTimer));
  app.decorate('runTeamJobs', runJobs);

  // ---- Teams ------------------------------------------------------------------------

  app.get('/api/teams', async (req) => ({
    teams: teams.listFor(req.user.uid),
    invites: teams.myInvites(req.user.emailVerified ? req.user.email : null),
  }));

  app.post('/api/teams', {
    schema: {
      body: {
        type: 'object', required: ['name'],
        properties: { id: ID, name: TEAM_NAME, color: TAG_COLOR, logo: TAG_LOGO },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const uid = req.user.uid;
    const b = req.body;
    if (b.id) {
      if (teams.role(b.id, uid)) return reply.code(200).send(myView(req, b.id)); // a retry
      if (teams.teamIdTaken(b.id)) throw new HttpError(409, 'Id already in use');
    }
    if (teams.teamCount(uid) >= MAX_TEAMS_PER_USER) throw new HttpError(400, `You can be in at most ${MAX_TEAMS_PER_USER} teams`);
    const id = b.id || crypto.randomUUID();
    assertLogo(b.logo);
    teams.create(uid, { id, name: cleanName(b.name), color: b.color || 'blue', logo: b.logo ?? null });
    teams.log(id, uid, 'created', null, { name: cleanName(b.name) });
    tellTeam(req, id);
    return reply.code(201).send(myView(req, id));
  });

  app.patch('/api/teams/:id', {
    schema: {
      params: teamParams,
      body: {
        type: 'object', minProperties: 1,
        properties: {
          name: TEAM_NAME, color: TAG_COLOR, logo: TAG_LOGO,
          settings: {
            type: 'object', properties: { membersCanAssign: { type: 'boolean' } }, additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team, settings } = teamFor(req, req.params.id, { admin: true, write: true });
    if (req.body.logo !== undefined) assertLogo(req.body.logo);
    if (req.body.name !== undefined || req.body.color !== undefined || req.body.logo !== undefined) {
      teams.update(team.id, {
        name: req.body.name !== undefined ? cleanName(req.body.name) : team.name,
        color: req.body.color ?? team.color,
        logo: req.body.logo !== undefined ? req.body.logo : team.logo, // null removes it
      });
    }
    if (req.body.settings) {
      teams.setSettings(team.id, { ...settings, ...req.body.settings });
      teams.log(team.id, req.user.uid, 'settings', null, req.body.settings);
    } else {
      teams.log(team.id, req.user.uid, 'edited', null, { name: req.body.name ?? null });
    }
    tellTeam(req, team.id);
    return myView(req, team.id);
  });

  app.post('/api/teams/:id/archive', {
    schema: {
      params: teamParams,
      body: { type: 'object', required: ['archived'], properties: { archived: { type: 'boolean' } }, additionalProperties: false },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { owner: true });
    teams.setArchived(team.id, req.body.archived);
    teams.log(team.id, req.user.uid, req.body.archived ? 'archived' : 'unarchived');
    tellTeam(req, team.id);
    return myView(req, team.id);
  });

  app.delete('/api/teams/:id', { schema: { params: teamParams } }, async (req, reply) => {
    const { team } = teamFor(req, req.params.id, { owner: true });
    const members = teams.memberUids(team.id);
    const owners = teams.remove(team.id); // its tasks stay with their people, as their own
    tell(req, members, { type: 'teams', teamId: team.id });
    const days = new Map();
    for (const { uid, date } of owners) days.set(uid, [...(days.get(uid) ?? []), date]);
    for (const [uid, dates] of days) tellTasks(req, uid, ...dates);
    return reply.code(204).send();
  });

  // ---- Invites by email ---------------------------------------------------------------

  app.post('/api/teams/:id/invites', {
    schema: {
      params: teamParams,
      body: {
        type: 'object', required: ['emails'],
        properties: {
          emails: { type: 'array', minItems: 1, maxItems: MAX_INVITES_AT_ONCE, items: EMAIL },
          role: { type: 'string', enum: ['admin', 'member'] },
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    const role = req.body.role ?? 'member';
    const emails = [...new Set(req.body.emails.map((e) => e.trim().toLowerCase()))];
    const bad = emails.filter((e) => !emailRe.test(e));
    if (bad.length) throw new HttpError(400, `Not an email address: ${bad.slice(0, 3).join(', ')}`);
    const alreadyMembers = emails.filter((e) => teams.isMemberEmail(team.id, e));
    const invited = emails.filter((e) => !alreadyMembers.includes(e));
    if (teams.inviteCount(team.id) + invited.length > MAX_PENDING_INVITES) {
      throw new HttpError(400, `A team can have at most ${MAX_PENDING_INVITES} invites waiting`);
    }
    if (teams.memberCount(team.id) + invited.length > MAX_MEMBERS) {
      throw new HttpError(400, `A team can have at most ${MAX_MEMBERS} people`);
    }
    if (invited.length) {
      teams.addInvites(team.id, invited.map((email) => ({ id: crypto.randomUUID(), email, role })), req.user.uid);
      teams.log(team.id, req.user.uid, 'invited', null, { emails: invited, role });
    }
    tellTeam(req, team.id);
    // People who already use the app see the invite right away.
    const known = invited.flatMap((e) => teams.uidsByEmail(e));
    tell(req, known, { type: 'invites' });
    notify(req, known, { kind: 'invite', teamId: team.id, title: `${actorName(req)} invited you to ${team.name}`, body: 'Open Teams to join' });
    return { team: myView(req, team.id), invited, alreadyMembers };
  });

  app.delete('/api/teams/:id/invites/:inviteId', {
    schema: {
      params: {
        type: 'object', required: ['id', 'inviteId'], properties: { id: ID, inviteId: ID }, additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    const invite = teams.invite(req.params.inviteId);
    if (!invite || invite.team_id !== team.id) throw new HttpError(404, 'Invite not found');
    teams.removeInvite(invite.id);
    teams.touch(team.id);
    tellTeam(req, team.id);
    tell(req, teams.uidsByEmail(invite.email), { type: 'invites' });
    return myView(req, team.id);
  });

  // Invites show only to a verified owner of the address (anyone can sign up with any email).
  app.get('/api/invites', async (req) => ({ invites: teams.myInvites(req.user.emailVerified ? req.user.email : null) }));

  /** An invite for the caller's own (verified) email address. */
  function myInvite(req) {
    const invite = teams.invite(req.params.id);
    if (!invite || !req.user.email || invite.email !== req.user.email) throw new HttpError(404, 'Invite not found');
    if (!req.user.emailVerified) {
      throw new HttpError(403, 'Verify your email address first (check your inbox), then sign in again to join');
    }
    return invite;
  }

  function joined(req, teamId) {
    const team = teams.get(teamId);
    teams.log(teamId, req.user.uid, 'joined');
    notify(req, teams.adminUids(teamId), { kind: 'joined', teamId, title: `${actorName(req)} joined ${team.name}`, body: req.user.email ?? '' });
    tellTeam(req, teamId);
  }

  app.post('/api/invites/:id/accept', { schema: { params: idParams } }, async (req) => {
    const invite = myInvite(req);
    const team = teams.get(invite.team_id);
    if (team.archived_at != null) throw new HttpError(409, 'This team is archived');
    if (!teams.role(invite.team_id, req.user.uid)) {
      if (teams.teamCount(req.user.uid) >= MAX_TEAMS_PER_USER) throw new HttpError(400, `You can be in at most ${MAX_TEAMS_PER_USER} teams`);
      if (teams.memberCount(invite.team_id) >= MAX_MEMBERS) throw new HttpError(400, 'This team is full');
    }
    repo.upsertUser(req.user); // teammates see the name and email right away
    teams.accept(invite, req.user.uid);
    teams.removeRequest(invite.team_id, req.user.uid);
    joined(req, invite.team_id);
    tell(req, [req.user.uid], { type: 'invites' });
    return { team: myView(req, invite.team_id) };
  });

  app.post('/api/invites/:id/decline', { schema: { params: idParams } }, async (req, reply) => {
    const invite = myInvite(req);
    teams.removeInvite(invite.id);
    teams.touch(invite.team_id);
    tell(req, teams.adminUids(invite.team_id), { type: 'teams', teamId: invite.team_id });
    tell(req, [req.user.uid], { type: 'invites' });
    return reply.code(204).send();
  });

  // ---- Invite link (and QR code), join requests ---------------------------------------

  const publicUrl = (req) => {
    if (config.publicUrl) return config.publicUrl.replace(/\/+$/, '');
    const proto = req.headers['x-forwarded-proto']?.split(',')[0].trim() || req.protocol || 'https';
    const host = req.headers['x-forwarded-host']?.split(',')[0].trim() || req.headers.host || 'localhost';
    return `${proto}://${host}`;
  };
  async function linkView(req, link) {
    if (!link) return { link: null };
    const url = `${publicUrl(req)}/join/${link.token}`;
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
    return { link: { token: link.token, url, qr, createdAt: link.created_at } };
  }

  app.get('/api/teams/:id/link', { schema: { params: teamParams } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    return linkView(req, teams.link(team.id));
  });

  // Turns the link on, or makes a new one (the old one stops working).
  app.post('/api/teams/:id/link', { schema: { params: teamParams } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    teams.putLink(team.id, crypto.randomBytes(18).toString('base64url'), req.user.uid);
    teams.log(team.id, req.user.uid, 'link');
    return linkView(req, teams.link(team.id));
  });

  app.delete('/api/teams/:id/link', { schema: { params: teamParams } }, async (req, reply) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    teams.removeLink(team.id);
    return reply.code(204).send();
  });

  const tokenParams = { type: 'object', required: ['token'], properties: { token: TOKEN }, additionalProperties: false };
  function linkFor(token) {
    const link = teams.linkByToken(token);
    if (!link) throw new HttpError(404, 'This invite link is not valid any more. Ask for a new one.');
    if (link.archived_at != null) throw new HttpError(409, 'This team is archived');
    return link;
  }

  app.get('/api/join/:token', { schema: { params: tokenParams } }, async (req) => {
    const link = linkFor(req.params.token);
    const status = teams.role(link.team_id, req.user.uid) ? 'member' : teams.request(link.team_id, req.user.uid) ? 'requested' : 'none';
    return {
      team: { id: link.team_id, name: link.name, color: link.color, logo: link.logo ?? null, memberCount: teams.memberCount(link.team_id) },
      status,
    };
  });

  app.post('/api/join/:token', { schema: { params: tokenParams } }, async (req) => {
    const link = linkFor(req.params.token);
    const uid = req.user.uid;
    if (teams.role(link.team_id, uid)) return { status: 'member' };
    if (teams.request(link.team_id, uid)) return { status: 'requested' };
    if (teams.swept(`declined:${link.team_id}:${uid}`) && now() - teams.sweptAt(`declined:${link.team_id}:${uid}`) < 7 * 86_400_000) {
      throw new HttpError(429, 'Your request to join was declined. You can ask again in a week, or ask an admin to invite you.');
    }
    if (teams.teamCount(uid) >= MAX_TEAMS_PER_USER) throw new HttpError(400, `You can be in at most ${MAX_TEAMS_PER_USER} teams`);
    if (teams.requestCount(link.team_id) >= MAX_PENDING_INVITES) throw new HttpError(400, 'This team has too many requests waiting');
    repo.upsertUser(req.user);
    teams.addRequest(link.team_id, uid);
    notify(req, teams.adminUids(link.team_id), {
      kind: 'request', teamId: link.team_id,
      title: `${actorName(req)} asks to join ${link.name}`,
      body: `${req.user.email ?? ''}${req.user.emailVerified ? '' : ' (email not verified)'}`,
    });
    tellTeam(req, link.team_id);
    return { status: 'requested' };
  });

  app.post('/api/teams/:id/requests/:uid', {
    schema: {
      params: { type: 'object', required: ['id', 'uid'], properties: { id: ID, uid: UID }, additionalProperties: false },
      body: { type: 'object', required: ['approve'], properties: { approve: { type: 'boolean' } }, additionalProperties: false },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    const uid = req.params.uid;
    if (!teams.request(team.id, uid)) throw new HttpError(404, 'Request not found');
    if (req.body.approve) {
      if (teams.memberCount(team.id) >= MAX_MEMBERS) throw new HttpError(400, 'This team is full');
      if (teams.teamCount(uid) >= MAX_TEAMS_PER_USER) throw new HttpError(400, `They are already in ${MAX_TEAMS_PER_USER} teams`);
      teams.approveRequest(team.id, uid);
      teams.log(team.id, req.user.uid, 'approved-join', null, { uid });
      teams.log(team.id, uid, 'joined');
      notify(req, [uid], { kind: 'joined', teamId: team.id, title: `You're in ${team.name}`, body: `${actorName(req)} let you in` });
    } else {
      teams.removeRequest(team.id, uid);
      teams.markSwept(`declined:${team.id}:${uid}`, now());
    }
    tellTeam(req, team.id, [uid]);
    return myView(req, team.id);
  });

  // ---- People: roles, job titles, leaving ---------------------------------------------

  const memberParams = {
    type: 'object', required: ['id', 'uid'], properties: { id: ID, uid: UID }, additionalProperties: false,
  };

  app.patch('/api/teams/:id/members/:uid', {
    schema: {
      params: memberParams,
      body: {
        type: 'object', minProperties: 1,
        properties: { role: { type: 'string', enum: ['owner', 'admin', 'member'] }, title: JOB_TITLE },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team, role: mine } = teamFor(req, req.params.id, { write: true });
    const target = req.params.uid;
    const theirs = teams.role(team.id, target);
    if (!theirs) throw new HttpError(404, 'This person is not in the team');
    if (req.body.title !== undefined) {
      // Your own job title, or anyone's for admins.
      if (target !== req.user.uid && !isAdminRole(mine)) throw new HttpError(403, 'Only team admins can change job titles');
      const title = req.body.title == null || !req.body.title.trim() ? null : cleanLine(req.body.title, 'Job title').slice(0, 60);
      teams.setTitle(team.id, target, title || null);
    }
    const next = req.body.role;
    if (next !== undefined && next !== theirs) {
      if (!isAdminRole(mine)) throw new HttpError(403, 'Only team admins can do this');
      if (next === 'owner') {
        if (mine !== 'owner') throw new HttpError(403, 'Only the owner can hand the team over');
        teams.transfer(team.id, req.user.uid, target);
      } else {
        if (theirs === 'owner') throw new HttpError(403, "The owner's role changes only when they hand the team over");
        // Admins can make more admins; only the owner can take that back.
        if (mine !== 'owner' && !(theirs === 'member' && next === 'admin')) {
          throw new HttpError(403, 'Only the owner can change an admin back to a member');
        }
        teams.setRole(team.id, target, next);
      }
      teams.log(team.id, req.user.uid, 'role', null, { uid: target, role: next });
      if (next !== 'member') notify(req, [target], { kind: 'role', teamId: team.id, title: next === 'owner' ? `You now own ${team.name}` : `You're an admin of ${team.name}`, body: '' });
    }
    teams.touch(team.id);
    tellTeam(req, team.id);
    return myView(req, team.id);
  });

  app.delete('/api/teams/:id/members/:uid', { schema: { params: memberParams } }, async (req, reply) => {
    const { team, role: mine } = teamFor(req, req.params.id);
    const target = req.params.uid;
    const self = target === req.user.uid;
    const theirs = self ? mine : teams.role(team.id, target);
    if (!theirs) throw new HttpError(404, 'This person is not in the team');
    if (self) {
      if (mine === 'owner') throw new HttpError(409, 'Hand the team over to someone else first, or delete the team');
    } else if (!isAdminRole(mine)) {
      throw new HttpError(403, 'Only team admins can remove people');
    } else if (theirs === 'owner' || (theirs === 'admin' && mine !== 'owner')) {
      throw new HttpError(403, theirs === 'owner' ? 'The owner cannot be removed' : 'Only the owner can remove an admin');
    }
    const members = teams.memberUids(team.id);
    const days = teams.removeMember(team.id, target); // their team tasks stay with them, as their own
    teams.log(team.id, req.user.uid, self ? 'left' : 'removed', null, { uid: target });
    tell(req, members, { type: 'teams', teamId: team.id });
    if (days.length) tellTasks(req, target, ...days);
    return reply.code(204).send();
  });

  // ---- Sub-groups --------------------------------------------------------------------

  const groupBody = {
    type: 'object',
    properties: {
      id: ID, name: { type: 'string', minLength: 1, maxLength: 40 }, color: TAG_COLOR,
      members: { type: 'array', maxItems: MAX_MEMBERS, uniqueItems: true, items: UID },
    },
    additionalProperties: false,
  };
  function saveGroup(req, team, group, b) {
    const members = b.members?.filter((uid) => teams.role(team.id, uid));
    if (b.members && members.length !== b.members.length) throw new HttpError(400, 'Someone in that list is not in the team');
    teams.saveGroup({
      id: group?.id ?? b.id ?? crypto.randomUUID(), teamId: team.id,
      name: b.name !== undefined ? cleanLine(b.name, 'Name') : group.name, color: b.color ?? group?.color ?? 'blue',
      members,
    }, !group);
    teams.log(team.id, req.user.uid, group ? 'group-edited' : 'group-created', null, { name: b.name ?? group?.name });
    tellTeam(req, team.id);
    return myView(req, team.id);
  }
  app.post('/api/teams/:id/groups', { schema: { params: teamParams, body: { ...groupBody, required: ['name'] } } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    if (teams.groupCount(team.id) >= MAX_GROUPS) throw new HttpError(400, `A team can have at most ${MAX_GROUPS} groups`);
    if (req.body.id && teams.group(req.body.id)) throw new HttpError(409, 'Id already in use');
    return saveGroup(req, team, null, req.body);
  });
  const groupParams = { type: 'object', required: ['id', 'groupId'], properties: { id: ID, groupId: ID }, additionalProperties: false };
  app.patch('/api/teams/:id/groups/:groupId', { schema: { params: groupParams, body: { ...groupBody, minProperties: 1 } } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    const group = teams.group(req.params.groupId);
    if (!group || group.team_id !== team.id) throw new HttpError(404, 'Group not found');
    return saveGroup(req, team, group, req.body);
  });
  app.delete('/api/teams/:id/groups/:groupId', { schema: { params: groupParams } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    const group = teams.group(req.params.groupId);
    if (!group || group.team_id !== team.id) throw new HttpError(404, 'Group not found');
    teams.removeGroup(group.id);
    teams.log(team.id, req.user.uid, 'group-deleted', null, { name: group.name });
    tellTeam(req, team.id);
    return myView(req, team.id);
  });

  // ---- Team tags ------------------------------------------------------------------------

  const tagBody = { type: 'object', properties: { id: ID, name: { type: 'string', minLength: 1, maxLength: 40 }, color: TAG_COLOR }, additionalProperties: false };
  const tagParams = { type: 'object', required: ['id', 'tagId'], properties: { id: ID, tagId: ID }, additionalProperties: false };
  const tagNameTaken = (teamId, name, except) => teams.tags(teamId).some((t) => t.id !== except && t.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  app.post('/api/teams/:id/tags', { schema: { params: teamParams, body: { ...tagBody, required: ['name'] } } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    if (teams.tagCount(team.id) >= MAX_TEAM_TAGS) throw new HttpError(400, `A team can have at most ${MAX_TEAM_TAGS} tags`);
    const name = cleanLine(req.body.name, 'Name');
    if (tagNameTaken(team.id, name)) throw new HttpError(409, `A team tag named "${name}" already exists`);
    if (req.body.id && teams.tag(req.body.id)) throw new HttpError(409, 'Id already in use');
    teams.saveTag({ id: req.body.id ?? crypto.randomUUID(), teamId: team.id, name, color: req.body.color ?? 'blue' }, true);
    tellTeam(req, team.id);
    return myView(req, team.id);
  });
  app.patch('/api/teams/:id/tags/:tagId', { schema: { params: tagParams, body: { ...tagBody, minProperties: 1 } } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    const tag = teams.tag(req.params.tagId);
    if (!tag || tag.team_id !== team.id) throw new HttpError(404, 'Tag not found');
    const name = req.body.name !== undefined ? cleanLine(req.body.name, 'Name') : tag.name;
    if (tagNameTaken(team.id, name, tag.id)) throw new HttpError(409, `A team tag named "${name}" already exists`);
    teams.saveTag({ id: tag.id, name, color: req.body.color ?? tag.color }, false);
    tellTeam(req, team.id);
    return myView(req, team.id);
  });
  app.delete('/api/teams/:id/tags/:tagId', { schema: { params: tagParams } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    const tag = teams.tag(req.params.tagId);
    if (!tag || tag.team_id !== team.id) throw new HttpError(404, 'Tag not found');
    const touchedIds = teams.removeTag(team.id, tag.id);
    tellTeam(req, team.id);
    for (const id of touchedIds) {
      const t = teams.taskAny(id);
      if (t) tellTasks(req, t.owner, t.date);
    }
    return myView(req, team.id);
  });

  // ---- Templates --------------------------------------------------------------------------

  const templateData = {
    type: 'object',
    required: ['title'],
    properties: {
      title: TITLE, notes: NOTES, priority: PRIORITY, subtasks: SUBTASKS, dueTime: { anyOf: [TIME, { type: 'null' }] },
      teamTagIds: TEAM_TAG_IDS, needsReview: { type: 'boolean' },
    },
    additionalProperties: false,
  };
  function cleanTemplateData(teamId, d) {
    return {
      title: cleanTitle(d.title),
      notes: cleanNotes(d.notes ?? ''),
      priority: d.priority ?? 4,
      subtasks: normalizeSubtasks(d.subtasks ?? []),
      dueTime: d.dueTime ?? null,
      teamTagIds: assertTeamTags(teamId, d.teamTagIds ?? []),
      needsReview: Boolean(d.needsReview),
    };
  }
  app.get('/api/teams/:id/templates', { schema: { params: teamParams } }, async (req) => {
    const { team, admin, settings } = teamFor(req, req.params.id);
    if (!admin && !settings.membersCanAssign) throw new HttpError(403, 'Only team admins can do this');
    return { templates: teams.templates(team.id) };
  });
  app.post('/api/teams/:id/templates', {
    schema: {
      params: teamParams,
      body: { type: 'object', required: ['name', 'data'], properties: { id: ID, name: { type: 'string', minLength: 1, maxLength: 60 }, data: templateData }, additionalProperties: false },
    },
  }, async (req, reply) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    if (teams.templateCount(team.id) >= MAX_TEMPLATES) throw new HttpError(400, `A team can have at most ${MAX_TEMPLATES} templates`);
    if (req.body.id && teams.template(req.body.id)) throw new HttpError(409, 'Id already in use');
    const id = req.body.id ?? crypto.randomUUID();
    teams.saveTemplate({ id, teamId: team.id, name: cleanLine(req.body.name, 'Name'), data: cleanTemplateData(team.id, req.body.data), createdBy: req.user.uid }, true);
    teams.log(team.id, req.user.uid, 'template-created', null, { name: req.body.name });
    tellTeam(req, team.id);
    return reply.code(201).send({ templates: teams.templates(team.id) });
  });
  const templateParams = { type: 'object', required: ['id', 'templateId'], properties: { id: ID, templateId: ID }, additionalProperties: false };
  app.patch('/api/teams/:id/templates/:templateId', {
    schema: {
      params: templateParams,
      body: { type: 'object', minProperties: 1, properties: { name: { type: 'string', minLength: 1, maxLength: 60 }, data: templateData }, additionalProperties: false },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    const t = teams.template(req.params.templateId);
    if (!t || t.team_id !== team.id) throw new HttpError(404, 'Template not found');
    teams.saveTemplate({
      id: t.id,
      name: req.body.name !== undefined ? cleanLine(req.body.name, 'Name') : t.name,
      data: req.body.data ? cleanTemplateData(team.id, req.body.data) : JSON.parse(t.data),
    }, false);
    tellTeam(req, team.id);
    return { templates: teams.templates(team.id) };
  });
  app.delete('/api/teams/:id/templates/:templateId', { schema: { params: templateParams } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    const t = teams.template(req.params.templateId);
    if (!t || t.team_id !== team.id) throw new HttpError(404, 'Template not found');
    teams.removeTemplate(t.id);
    tellTeam(req, team.id);
    return { templates: teams.templates(team.id) };
  });

  // ---- Repeating team tasks ------------------------------------------------------------------

  const recurringData = {
    type: 'object',
    required: ['title', 'assignees'],
    properties: {
      title: TITLE, notes: NOTES, priority: PRIORITY, subtasks: SUBTASKS, dueTime: { anyOf: [TIME, { type: 'null' }] },
      teamTagIds: TEAM_TAG_IDS, needsReview: { type: 'boolean' },
      assignees: { type: 'array', minItems: 1, maxItems: MAX_ASSIGNEES, uniqueItems: true, items: UID },
      mode: { type: 'string', enum: ['each', 'first'] },
    },
    additionalProperties: false,
  };
  function cleanRecurring(team, d, rule) {
    for (const uid of d.assignees) if (!teams.role(team.id, uid)) throw new HttpError(400, 'That person is not in the team');
    if (rule.freq === 'weekly' && !rule.days?.length) throw new HttpError(400, 'Pick the days of the week');
    if (rule.freq === 'monthly' && !rule.day) throw new HttpError(400, 'Pick the day of the month');
    return { ...cleanTemplateData(team.id, d), assignees: d.assignees, mode: d.mode ?? 'each' };
  }
  app.get('/api/teams/:id/recurring', { schema: { params: teamParams } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    return { recurring: teams.recurringList(team.id) };
  });
  app.post('/api/teams/:id/recurring', {
    schema: {
      params: teamParams,
      body: {
        type: 'object', required: ['data', 'rule'],
        properties: { id: ID, data: recurringData, rule: RULE, start: DATE, today: DATE },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    if (teams.recurringCount(team.id) >= MAX_RECURRING) throw new HttpError(400, `A team can have at most ${MAX_RECURRING} repeating tasks`);
    if (req.body.id && teams.recurring(req.body.id)) throw new HttpError(409, 'Id already in use');
    const data = cleanRecurring(team, req.body.data, req.body.rule);
    const today = req.body.today && plausibleToday(req.body.today) ? req.body.today : serverToday();
    const start = req.body.start && req.body.start > today ? req.body.start : today;
    if (req.body.start) assertDate(req.body.start, 'start');
    const nextDate = nextOccurrence(req.body.rule, start);
    if (!nextDate) throw new HttpError(400, 'That rule never repeats');
    const id = req.body.id ?? crypto.randomUUID();
    teams.saveRecurring({ id, teamId: team.id, data, rule: req.body.rule, nextDate, active: true, createdBy: req.user.uid }, true);
    teams.log(team.id, req.user.uid, 'repeat-created', null, { title: data.title });
    runRecurring(today > serverToday() ? today : serverToday()); // today's, if it falls on today
    tellTeam(req, team.id);
    return reply.code(201).send({ recurring: teams.recurringList(team.id) });
  });
  const recurringParams = { type: 'object', required: ['id', 'recurringId'], properties: { id: ID, recurringId: ID }, additionalProperties: false };
  app.patch('/api/teams/:id/recurring/:recurringId', {
    schema: {
      params: recurringParams,
      body: { type: 'object', minProperties: 1, properties: { data: recurringData, rule: RULE, active: { type: 'boolean' } }, additionalProperties: false },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true, write: true });
    const r = teams.recurring(req.params.recurringId);
    if (!r || r.team_id !== team.id) throw new HttpError(404, 'Repeating task not found');
    const rule = req.body.rule ?? JSON.parse(r.rule);
    const data = req.body.data ? cleanRecurring(team, req.body.data, rule) : JSON.parse(r.data);
    // A new rule starts counting from tomorrow (today's task, if any, was already given).
    const nextDate = req.body.rule || req.body.active === true ? nextOccurrence(rule, addDays(serverToday(), 1)) : r.next_date;
    teams.saveRecurring({ id: r.id, data, rule, nextDate: nextDate ?? r.next_date, active: req.body.active ?? Boolean(r.active) }, false);
    teams.log(team.id, req.user.uid, 'repeat-edited', null, { title: data.title });
    tellTeam(req, team.id);
    return { recurring: teams.recurringList(team.id) };
  });
  app.delete('/api/teams/:id/recurring/:recurringId', { schema: { params: recurringParams } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    const r = teams.recurring(req.params.recurringId);
    if (!r || r.team_id !== team.id) throw new HttpError(404, 'Repeating task not found');
    teams.removeRecurring(r.id);
    teams.log(team.id, req.user.uid, 'repeat-deleted', null, { title: JSON.parse(r.data).title });
    tellTeam(req, team.id);
    return { recurring: teams.recurringList(team.id) };
  });

  // ---- Team tasks ----------------------------------------------------------------------------

  const teamTaskParams = {
    type: 'object', required: ['id', 'taskId'], properties: { id: ID, taskId: ID }, additionalProperties: false,
  };

  // Admins: every team task in the range plus all open ones. Members: the ones they have or gave.
  app.get('/api/teams/:id/tasks', {
    schema: {
      params: teamParams,
      querystring: {
        type: 'object', required: ['from', 'to'], properties: { from: DATE, to: DATE, today: DATE }, additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team, admin } = teamFor(req, req.params.id);
    const { from, to } = req.query;
    assertDate(from, 'from');
    assertDate(to, 'to');
    const span = daysBetween(from, to);
    if (span < 0 || span > 92) throw new HttpError(400, 'Range must be 0-92 days');
    const today = req.query.today && isValidDate(req.query.today) && plausibleToday(req.query.today) ? req.query.today : serverToday();
    runRecurring(today > serverToday() ? today : serverToday());
    const counts = teams.commentCounts(team.id);
    let list = teams.tasks(team.id, from, to);
    if (!admin) list = list.filter((t) => t.assignee === req.user.uid || t.assignedBy === req.user.uid);
    return { tasks: list.map((t) => boardTask(t, counts)) };
  });

  app.post('/api/teams/:id/tasks', {
    schema: {
      params: teamParams,
      body: {
        type: 'object', required: ['title', 'date'],
        properties: {
          id: ID, assignee: UID, assignees: { type: 'array', minItems: 1, maxItems: MAX_ASSIGNEES, uniqueItems: true, items: UID },
          groupId: ID, mode: { type: 'string', enum: ['each', 'first'] },
          title: TITLE, notes: NOTES, priority: PRIORITY, date: DATE,
          subtasks: SUBTASKS, dueAt: DUE_AT, today: DATE, needsReview: { type: 'boolean' }, teamTagIds: TEAM_TAG_IDS,
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { team, admin, settings } = teamFor(req, req.params.id, { write: true });
    if (!admin && !settings.membersCanAssign) throw new HttpError(403, 'Only team admins can give tasks in this team');
    const b = req.body;
    assertDate(b.date, 'date');
    if (b.today) assertDate(b.today, 'today');
    assertDueAt(b.dueAt);
    const people = assigneesOf(team, b);
    const id = b.id ?? crypto.randomUUID();
    if (b.id) {
      // A retry: the same task(s) back.
      // Only the person who gave it gets it back; anyone else is told the id is taken.
      const single = teams.task(team.id, b.id);
      if (single && single.assignedBy === req.user.uid && !single.groupId) {
        return reply.code(200).send(people.length > 1 || b.assignees || b.groupId ? { tasks: [single] } : single);
      }
      const group = teams.groupTasks(b.id).filter((t) => t.teamId === team.id);
      if (!single && group.length && group.every((t) => t.assignedBy === req.user.uid)) {
        return reply.code(200).send({ tasks: group.map((t) => ({ ...t, owner: undefined })) });
      }
      if (single || group.length || repo.idTaken(b.id) || teams.groupTasks(b.id).length) throw new HttpError(409, 'Id already in use');
    }
    const earliest = b.today && plausibleToday(b.today) ? b.today : addDays(serverToday(), -1);
    if (b.date < earliest) throw new HttpError(400, 'Tasks can only be given for today or a later day');
    const tags = assertTeamTags(team.id, b.teamTagIds);
    const tasks = createTeamTasks(req, team, { ...b, teamTagIds: tags }, people, { id, by: req.user.uid });
    teams.log(team.id, req.user.uid, 'given', tasks[0].id, { title: tasks[0].title, to: people });
    for (const t of tasks) tellTasks(req, t.assignee, t.date);
    notify(req, people, { kind: 'given', teamId: team.id, taskId: tasks[0].id, title: `${actorName(req)} gave you a task`, body: `${shorten(tasks[0].title)} · ${team.name}` });
    touched(req, tasks[0]);
    return reply.code(201).send(people.length > 1 || b.assignees || b.groupId ? { tasks } : tasks[0]);
  });

  app.patch('/api/teams/:id/tasks/:taskId', {
    schema: {
      params: teamTaskParams,
      body: {
        type: 'object', minProperties: 1,
        properties: {
          assignee: UID, title: TITLE, notes: NOTES, priority: PRIORITY, date: DATE, status: STATUS,
          subtasks: SUBTASKS, dueAt: DUE_AT, needsReview: { type: 'boolean' }, teamTagIds: TEAM_TAG_IDS,
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { write: true });
    const current = teams.task(team.id, req.params.taskId);
    if (!current) throw new HttpError(404, 'Task not found');
    if (!canManage(current, req.user.uid, team)) throw new HttpError(403, 'Only team admins can do this');
    const b = req.body;
    if (b.date !== undefined) assertDate(b.date, 'date');
    if (b.dueAt !== undefined) assertDueAt(b.dueAt);
    const owner = b.assignee !== undefined ? (teams.role(team.id, b.assignee) ? b.assignee : null) : current.assignee;
    if (!owner) throw new HttpError(400, 'That person is not in the team');
    const tags = b.teamTagIds !== undefined ? assertTeamTags(team.id, b.teamTagIds) : undefined;
    const next = { ...current, tagIds: undefined, updatedAt: now() };
    if (b.title !== undefined) next.title = cleanTitle(b.title);
    if (b.notes !== undefined) next.notes = cleanNotes(b.notes);
    if (b.priority !== undefined) next.priority = b.priority;
    if (b.date !== undefined && b.date !== current.date) {
      next.date = b.date;
      next.carriedFrom = null;
    }
    if (b.dueAt !== undefined) next.dueAt = b.dueAt;
    if (b.subtasks !== undefined) next.subtasks = normalizeSubtasks(b.subtasks);
    const status = resolveStatus(current.status, b.status, next.subtasks, b.subtasks !== undefined);
    const admin = isTeamAdmin(team.id, req.user.uid);
    // A member who gave a task to themself doesn't sign off their own work (or reopen it past its sign-off).
    if (!admin && current.assignee === req.user.uid && status !== current.status && (current.needsReview || b.needsReview)) {
      throw new HttpError(403, 'Someone else signs off your own work');
    }
    if (status !== current.status) {
      next.status = status;
      next.completedAt = status === 'done' ? next.updatedAt : null;
    }
    const moved = owner !== current.assignee;
    // Everything is checked by now: move it to its new person and save the changes, as one.
    teams.tx(() => {
      if (moved) {
        teams.reassign(current.id, owner);
        // The shared copies this person's finishing closed now count as the new person's; a sign-off
        // that was waiting starts again with them.
        if (current.groupId) teams.renameCloser(current.groupId, current.assignee, owner);
        if (current.review === 'waiting' && status !== 'done') teams.setReview(current.id, null);
      }
      repo.update(owner, next);
      if (tags !== undefined) teams.setTeamTags(current.id, tags);
      if (b.needsReview !== undefined) teams.setNeedsReview(current.id, b.needsReview);
      if (status !== current.status) {
        // Done by an admin counts as signed off; opened again clears the sign-off.
        if (status === 'done' && (b.needsReview ?? current.needsReview)) teams.setReview(current.id, 'approved');
        if (status !== 'done') teams.setReview(current.id, null);
        if (status === 'pending' && current.closedBy) teams.setClosed(current.id, null);
      }
    });
    const saved = teams.task(team.id, current.id);
    if (status === 'done' && current.status !== 'done' && saved.groupId && saved.groupMode === 'first') {
      for (const g of teams.groupTasks(saved.groupId)) {
        if (g.id !== saved.id && g.status === 'pending') {
          teams.setClosed(g.id, saved.assignee);
          tellTasks(req, g.owner, g.date);
        }
      }
    }
    if (status === 'pending' && current.status === 'done') reopenSiblings(req, saved, current.assignee);
    teams.log(team.id, req.user.uid, owner !== current.assignee ? 'reassigned' : status !== current.status ? `status-${status}` : 'edited', current.id, {
      title: saved.title, ...(owner !== current.assignee ? { from: current.assignee, to: owner } : {}),
    });
    tellTasks(req, owner, current.date, saved.date);
    if (owner !== current.assignee) {
      tellTasks(req, current.assignee, current.date);
      notify(req, [owner], { kind: 'given', teamId: team.id, taskId: saved.id, title: `${actorName(req)} gave you a task`, body: `${shorten(saved.title)} · ${team.name}` });
    } else if (b.title !== undefined || b.notes !== undefined || b.dueAt !== undefined || b.date !== undefined || b.priority !== undefined) {
      notify(req, [owner], { kind: 'changed', teamId: team.id, taskId: saved.id, title: `${actorName(req)} changed a task`, body: `${shorten(saved.title)} · ${team.name}` });
    }
    touched(req, saved);
    return { ...saved, comments: teams.commentCounts(team.id)[thread(saved)]?.count ?? 0 };
  });

  app.delete('/api/teams/:id/tasks/:taskId', { schema: { params: teamTaskParams } }, async (req, reply) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    const current = teams.task(team.id, req.params.taskId);
    if (!current || !repo.remove(current.assignee, current.id)) throw new HttpError(404, 'Task not found');
    // The shared copies its finishing had closed open again (nobody finished them now).
    if (current.status === 'done') reopenSiblings(req, current, current.assignee);
    teams.log(team.id, req.user.uid, 'deleted', current.id, { title: current.title });
    tellTasks(req, current.assignee, current.date);
    touched(req, current);
    return reply.code(204).send();
  });

  // Sign-off: approve the work, or send it back with a note.
  app.post('/api/teams/:id/tasks/:taskId/review', {
    schema: {
      params: teamTaskParams,
      body: {
        type: 'object', required: ['decision'],
        properties: { decision: { type: 'string', enum: ['approve', 'return'] }, note: { type: 'string', maxLength: 2000 } },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { write: true });
    const current = teams.task(team.id, req.params.taskId);
    if (!current) throw new HttpError(404, 'Task not found');
    if (!canManage(current, req.user.uid, team)) throw new HttpError(403, 'Only team admins can do this');
    if (current.assignee === req.user.uid && !isTeamAdmin(team.id, req.user.uid)) throw new HttpError(403, 'Someone else signs off your own work');
    if (current.review !== 'waiting') throw new HttpError(409, 'This task is not waiting for review');
    const note = req.body.note?.trim() ? cleanNotes(req.body.note) : null;
    if (req.body.decision === 'approve') {
      teams.setReview(current.id, 'approved');
      teams.log(team.id, req.user.uid, 'approved', current.id, { title: current.title });
      notify(req, [current.assignee], { kind: 'approved', teamId: team.id, taskId: current.id, title: `${actorName(req)} approved your task`, body: shorten(current.title) });
    } else {
      teams.tx(() => {
        repo.update(current.assignee, { ...current, tagIds: undefined, status: 'pending', completedAt: null, updatedAt: now() });
        teams.setReview(current.id, 'returned');
      });
      reopenSiblings(req, current, current.assignee);
      teams.log(team.id, req.user.uid, 'returned', current.id, { title: current.title, note });
      notify(req, [current.assignee], { kind: 'returned', teamId: team.id, taskId: current.id, title: `${actorName(req)} sent a task back`, body: note ? shorten(note) : shorten(current.title) });
    }
    if (note) {
      teams.addComment({ id: crypto.randomUUID(), thread: thread(current), teamId: team.id, uid: req.user.uid, text: note, createdAt: now() });
    }
    tellTasks(req, current.assignee, current.date);
    touched(req, current);
    return teams.task(team.id, current.id);
  });

  // A friendly reminder about an open task.
  app.post('/api/teams/:id/tasks/:taskId/nudge', { schema: { params: teamTaskParams } }, async (req) => {
    const { team } = teamFor(req, req.params.id, { write: true });
    const current = teams.task(team.id, req.params.taskId);
    if (!current) throw new HttpError(404, 'Task not found');
    if (!canManage(current, req.user.uid, team)) throw new HttpError(403, 'Only team admins can do this');
    if (current.status !== 'pending') throw new HttpError(409, 'Only open tasks can be nudged');
    const last = teams.lastNudge(current.id);
    if (last && now() - last < NUDGE_EVERY_MS) throw new HttpError(429, 'Already reminded in the last half hour');
    teams.notify(current.assignee, { kind: 'nudge', teamId: team.id, taskId: current.id, actor: req.user.uid, title: `${actorName(req)} reminds you about a task`, body: `${shorten(current.title)} · ${team.name}` }, now());
    ctx.publish([current.assignee], { type: 'notifications' });
    teams.log(team.id, req.user.uid, 'nudged', current.id, { title: current.title });
    return { ok: true };
  });

  // Images and files that admins add to a team task (they're stored with the person's task).
  app.post('/api/teams/:id/tasks/:taskId/attachments', {
    bodyLimit: Math.ceil((MAX_IMAGE_BYTES + MAX_THUMB_BYTES) * 1.37) + 4096,
    schema: {
      params: teamTaskParams,
      body: {
        type: 'object', required: ['id', 'image', 'thumb', 'width', 'height'],
        properties: {
          id: ID, image: { type: 'string', pattern: IMAGE_DATA_URL }, thumb: { type: 'string', pattern: IMAGE_DATA_URL },
          width: { type: 'integer', minimum: 1, maximum: 20000 }, height: { type: 'integer', minimum: 1, maximum: 20000 },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { team } = teamFor(req, req.params.id, { write: true });
    const task = teams.task(team.id, req.params.taskId);
    if (!task) throw new HttpError(404, 'Task not found');
    if (!canManage(task, req.user.uid, team)) throw new HttpError(403, 'Only team admins can do this');
    const b = req.body;
    const owner = task.assignee;
    const existing = repo.getAttachment(owner, b.id);
    if (existing) {
      if (existing.task_id !== task.id) throw new HttpError(409, 'Id already in use');
      return reply.code(200).send(teams.task(team.id, task.id));
    }
    if (repo.attachmentIdTaken(b.id)) throw new HttpError(409, 'Id already in use');
    if (repo.attachmentCount(owner, task.id) >= MAX_ATTACHMENTS) throw new HttpError(400, `A task can have at most ${MAX_ATTACHMENTS} images`);
    const image = decodeImage(b.image, 'Image', MAX_IMAGE_BYTES);
    const thumb = decodeImage(b.thumb, 'Thumbnail', MAX_THUMB_BYTES);
    if (thumb.type !== image.type) throw new HttpError(400, 'Thumbnail must be the same image type');
    fs.mkdirSync(filesDir, { recursive: true });
    writeFileAtomic(filePath(b.id, image.type, false), image.buf);
    writeFileAtomic(filePath(b.id, image.type, true), thumb.buf);
    try {
      repo.insertAttachment(owner, { id: b.id, taskId: task.id, type: image.type, width: b.width, height: b.height, size: image.buf.length, createdAt: now() });
    } catch (err) {
      removeFiles(b.id, image.type);
      throw err;
    }
    tellTasks(req, owner, task.date);
    touched(req, task);
    return reply.code(201).send(teams.task(team.id, task.id));
  });

  // ---- Files on tasks (any type: PDFs, documents, sheets…) ---------------------------------

  const binPath = (id) => path.join(filesDir, `${id}.bin`);
  const fileBody = {
    type: 'object', required: ['id', 'name', 'data'],
    properties: { id: ID, name: { type: 'string', minLength: 1, maxLength: 200 }, data: { type: 'string', pattern: FILE_DATA_URL } },
    additionalProperties: false,
  };
  const fileLimit = Math.ceil(MAX_FILE_BYTES * 1.37) + 4096;

  function addFile(req, task, owner, b) {
    const [, mime, b64] = b.data.match(/^data:([^;]+);base64,(.*)$/s) || [];
    if (!mime || b64.length % 4 !== 0) throw new HttpError(400, 'File is not valid');
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) throw new HttpError(400, 'The file is empty');
    if (buf.length > MAX_FILE_BYTES) throw new HttpError(413, `Files can be at most ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    if (teams.fileCount(task.id) >= MAX_FILES) throw new HttpError(400, `A task can have at most ${MAX_FILES} files`);
    const name = cleanLine(b.name, 'File name').replace(/[\\/]/g, '_').slice(0, 200);
    fs.mkdirSync(filesDir, { recursive: true });
    writeFileAtomic(binPath(b.id), buf);
    try {
      teams.insertFile({ id: b.id, uid: owner, taskId: task.id, name, mime: mime.toLowerCase(), size: buf.length, addedBy: req.user.uid, createdAt: now() });
    } catch (err) {
      fs.rmSync(binPath(b.id), { force: true });
      throw err;
    }
  }

  // On your own task.
  app.post('/api/tasks/:id/files', { bodyLimit: fileLimit, schema: { params: idParams, body: fileBody } }, async (req, reply) => {
    const task = repo.get(req.user.uid, req.params.id);
    if (!task) throw new HttpError(404, 'Task not found');
    if (task.teamId && teams.get(task.teamId)?.archived_at != null) throw new HttpError(409, 'This team is archived');
    const f = teams.fileWithTeam(req.body.id);
    if (f) {
      if (f.task_id !== task.id) throw new HttpError(409, 'Id already in use');
      return reply.code(200).send(repo.get(req.user.uid, task.id));
    }
    if (teams.fileIdTaken(req.body.id)) throw new HttpError(409, 'Id already in use');
    addFile(req, task, req.user.uid, req.body);
    ctx.changed(req, { type: 'tasks', dates: [task.date] });
    touched(req, task);
    return reply.code(201).send(repo.get(req.user.uid, task.id));
  });

  // On a team task, by its admins (or the member who gave it).
  app.post('/api/teams/:id/tasks/:taskId/files', { bodyLimit: fileLimit, schema: { params: teamTaskParams, body: fileBody } }, async (req, reply) => {
    const { team } = teamFor(req, req.params.id, { write: true });
    const task = teams.task(team.id, req.params.taskId);
    if (!task) throw new HttpError(404, 'Task not found');
    if (!canManage(task, req.user.uid, team)) throw new HttpError(403, 'Only team admins can do this');
    const f = teams.fileWithTeam(req.body.id);
    if (f) {
      if (f.task_id !== task.id) throw new HttpError(409, 'Id already in use');
      return reply.code(200).send(teams.task(team.id, task.id));
    }
    if (teams.fileIdTaken(req.body.id)) throw new HttpError(409, 'Id already in use');
    addFile(req, task, task.assignee, req.body);
    tellTasks(req, task.assignee, task.date);
    touched(req, task);
    return reply.code(201).send(teams.task(team.id, task.id));
  });

  /** A file and whether this person may see it (the task's person, its team's admins, whoever gave it). */
  function fileFor(req) {
    const f = teams.fileWithTeam(req.params.id);
    if (!f || f.orphaned_at != null) throw new HttpError(404, 'File not found');
    if (f.uid === req.user.uid) return f;
    const task = teams.taskAny(f.task_id);
    if (task && canSee(task, req.user.uid)) return f;
    throw new HttpError(404, 'File not found');
  }

  app.get('/api/files/:id', { schema: { params: idParams } }, async (req, reply) => {
    const f = fileFor(req);
    let buf;
    try {
      buf = fs.readFileSync(binPath(f.id));
    } catch {
      throw new HttpError(404, 'The file is missing');
    }
    // Always downloaded, never shown in place (nothing someone uploaded runs in the app's pages).
    reply.header('Content-Disposition', `attachment; filename="${f.name.replace(/[^\w.\- ()]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.type('application/octet-stream');
    return reply.send(buf);
  });

  app.delete('/api/files/:id', { schema: { params: idParams } }, async (req) => {
    const f = fileFor(req);
    const task = teams.taskAny(f.task_id);
    const mayDelete = f.uid === req.user.uid || f.added_by === req.user.uid || (task?.teamId && isTeamAdmin(task.teamId, req.user.uid));
    if (!mayDelete) throw new HttpError(403, 'You can remove the files you added');
    teams.removeFile(f.id);
    fs.rmSync(binPath(f.id), { force: true });
    if (task) {
      tellTasks(req, task.owner, task.date);
      touched(req, task);
    }
    const fresh = task ? teams.taskAny(task.id) : null;
    return fresh ? { ...fresh, owner: undefined } : { deleted: true };
  });

  // ---- Comments ---------------------------------------------------------------------------

  function commentTask(req, taskId) {
    const task = teams.taskAny(taskId);
    if (!task || !canSee(task, req.user.uid)) throw new HttpError(404, 'Task not found');
    return task;
  }

  app.get('/api/tasks/:id/comments', { schema: { params: idParams } }, async (req) => {
    const task = commentTask(req, req.params.id);
    return { comments: teams.comments(task.teamId, thread(task)) };
  });

  app.post('/api/tasks/:id/comments', {
    schema: { params: idParams, body: { type: 'object', required: ['text'], properties: { id: ID, text: COMMENT }, additionalProperties: false } },
  }, async (req, reply) => {
    const task = commentTask(req, req.params.id);
    const team = teams.get(task.teamId);
    if (team.archived_at != null) throw new HttpError(409, 'This team is archived');
    if (req.body.id && teams.comment(req.body.id)) return reply.code(200).send({ comments: teams.comments(task.teamId, thread(task)) });
    const text = cleanNotes(req.body.text);
    if (!text) throw new HttpError(400, 'Write something first');
    teams.addComment({ id: req.body.id ?? crypto.randomUUID(), thread: thread(task), teamId: team.id, uid: req.user.uid, text, createdAt: now() });
    teams.log(team.id, req.user.uid, 'commented', task.id, { title: task.title });
    // Everyone on the task hears about it: its people, whoever gave it, the admins.
    const people = new Set([task.owner, task.assignedBy, ...teams.adminUids(team.id)]);
    if (task.groupId) for (const g of teams.groupTasks(task.groupId)) people.add(g.owner);
    for (const u of [...people]) if (u !== task.owner && !teams.role(team.id, u)) people.delete(u); // only people still in the team
    notify(req, [...people], { kind: 'comment', teamId: team.id, taskId: task.id, title: `${actorName(req)} commented on ${shorten(task.title, 60)}`, body: shorten(text) });
    tell(req, [...people, req.user.uid], { type: 'comments', taskId: task.id, thread: thread(task), teamId: team.id });
    return reply.code(201).send({ comments: teams.comments(task.teamId, thread(task)) });
  });

  app.delete('/api/comments/:id', { schema: { params: idParams } }, async (req) => {
    const c = teams.comment(req.params.id);
    if (!c) throw new HttpError(404, 'Comment not found');
    if (c.uid !== req.user.uid && !isTeamAdmin(c.team_id, req.user.uid)) throw new HttpError(403, 'You can delete your own comments');
    teams.removeComment(c.id);
    tell(req, [...teams.adminUids(c.team_id), req.user.uid], { type: 'comments', thread: c.thread, teamId: c.team_id });
    return { comments: teams.comments(c.team_id, c.thread) };
  });

  // ---- Activity log -------------------------------------------------------------------------

  app.get('/api/teams/:id/activity', {
    schema: {
      params: teamParams,
      querystring: { type: 'object', properties: { before: { type: 'string', pattern: '^[0-9]{1,15}$' } }, additionalProperties: false },
    },
  }, async (req) => {
    const { team } = teamFor(req, req.params.id, { admin: true });
    return { activity: teams.activity(team.id, req.query.before ? Number(req.query.before) : undefined, 50) };
  });

  // ---- Notifications --------------------------------------------------------------------------

  app.get('/api/notifications', {
    schema: {
      querystring: {
        type: 'object',
        properties: { after: { type: 'string', pattern: '^[0-9]{1,15}$' }, limit: { type: 'string', pattern: '^[1-9][0-9]?$|^100$' } },
        additionalProperties: false,
      },
    },
  }, async (req) => ({
    notifications: teams.notifications(req.user.uid, Number(req.query.after ?? 0), Number(req.query.limit ?? 50)),
    unread: teams.unread(req.user.uid),
  }));

  app.post('/api/notifications/read', {
    schema: {
      body: {
        type: 'object', minProperties: 1,
        properties: { upTo: { type: 'integer', minimum: 0 }, id: { type: 'integer', minimum: 0 } },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    if (req.body.upTo !== undefined) teams.markRead(req.user.uid, req.body.upTo);
    if (req.body.id !== undefined) teams.markOneRead(req.user.uid, req.body.id);
    ctx.changed(req, { type: 'notifications' });
    return { unread: teams.unread(req.user.uid) };
  });

  // ---- Hooks for the personal task routes -----------------------------------------------------

  return {
    /** Checks a person's change to a team task given to them; returns a reason to refuse, or null. */
    memberMayChange,
    /** After a person changed their own team task: sign-off, closing shared copies, notices. */
    afterWork,
    touched,
    runRecurring,
    /** Removes files of deleted tasks past the Undo window. */
    sweepFiles(cutoff) {
      for (const f of repo.expiredFiles(cutoff)) {
        fs.rmSync(binPath(f.id), { force: true });
        repo.dropFile(f.id);
      }
    },
    canSee,
  };
}
