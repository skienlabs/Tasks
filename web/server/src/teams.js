// Teams: a group of people (a company, a crew) whose admins hand out tasks.
//
// A team task is an ordinary task owned by the person it is assigned to (tasks.uid), marked with
// team_id and assigned_by. That way it shows up in their list, carries over, works offline and
// takes their own tags, while the team's admins can follow and manage it.

import { COLUMNS as TASK_COLUMNS, toTask } from './db.js';

export const ROLES = ['owner', 'admin', 'member'];
export const MAX_TEAMS_PER_USER = 30;
export const MAX_MEMBERS = 200;
export const MAX_PENDING_INVITES = 200;

export function createTeamsRepo(db) {
  const tx = (fn) => {
    if (db.isTransaction) return fn(); // joins one already open
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  const s = {
    team: db.prepare('SELECT * FROM teams WHERE id = ?'),
    teamIdTaken: db.prepare('SELECT 1 AS x FROM teams WHERE id = ?'),
    insertTeam: db.prepare('INSERT INTO teams (id, name, color, logo, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    updateTeam: db.prepare('UPDATE teams SET name = ?, color = ?, logo = ?, updated_at = ? WHERE id = ?'),
    touchTeam: db.prepare('UPDATE teams SET updated_at = ? WHERE id = ?'),
    removeTeam: db.prepare('DELETE FROM teams WHERE id = ?'),
    myTeams: db.prepare(`SELECT t.*, m.role AS my_role FROM team_members m JOIN teams t ON t.id = m.team_id
      WHERE m.uid = ? ORDER BY t.name COLLATE NOCASE, t.created_at`),
    myTeamCount: db.prepare('SELECT COUNT(*) AS n FROM team_members WHERE uid = ?'),
    role: db.prepare('SELECT role FROM team_members WHERE team_id = ? AND uid = ?'),
    members: db.prepare(`SELECT m.uid, m.role, m.joined_at, m.title, u.email, u.name, u.display_name, u.photo
      FROM team_members m LEFT JOIN users u ON u.uid = m.uid WHERE m.team_id = ?
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_at`),
    memberUids: db.prepare('SELECT uid FROM team_members WHERE team_id = ?'),
    adminUids: db.prepare(`SELECT uid FROM team_members WHERE team_id = ? AND role IN ('owner', 'admin')`),
    memberCount: db.prepare('SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?'),
    addMember: db.prepare('INSERT OR IGNORE INTO team_members (team_id, uid, role, joined_at) VALUES (?, ?, ?, ?)'),
    setRole: db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND uid = ?'),
    removeMember: db.prepare('DELETE FROM team_members WHERE team_id = ? AND uid = ?'),
    memberByEmail: db.prepare(`SELECT m.uid FROM team_members m JOIN users u ON u.uid = m.uid
      WHERE m.team_id = ? AND u.email = ?`),

    invites: db.prepare(`SELECT i.*, u.name AS inviter_name, u.display_name AS inviter_display, u.email AS inviter_email
      FROM team_invites i LEFT JOIN users u ON u.uid = i.invited_by WHERE i.team_id = ? ORDER BY i.created_at, i.email`),
    invite: db.prepare('SELECT * FROM team_invites WHERE id = ?'),
    inviteCount: db.prepare('SELECT COUNT(*) AS n FROM team_invites WHERE team_id = ?'),
    upsertInvite: db.prepare(`INSERT INTO team_invites (id, team_id, email, role, invited_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (team_id, email) DO UPDATE SET role = excluded.role`),
    removeInvite: db.prepare('DELETE FROM team_invites WHERE id = ?'),
    myInvites: db.prepare(`SELECT i.*, t.name AS team_name, t.color AS team_color, t.logo AS team_logo,
        u.name AS inviter_name, u.display_name AS inviter_display, u.email AS inviter_email,
        (SELECT COUNT(*) FROM team_members m WHERE m.team_id = i.team_id) AS member_count
      FROM team_invites i JOIN teams t ON t.id = i.team_id LEFT JOIN users u ON u.uid = i.invited_by
      WHERE i.email = ? ORDER BY i.created_at`),
    uidsByEmail: db.prepare('SELECT uid FROM users WHERE email = ?'),

    // Team tasks
    teamTasks: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE team_id = ?
      AND (date BETWEEN ? AND ? OR status = 'pending') ORDER BY date, priority, created_at`),
    teamTask: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE team_id = ? AND id = ?`),
    detachAll: db.prepare('UPDATE tasks SET team_id = NULL, assigned_by = NULL, needs_review = 0, review = NULL, group_id = NULL, group_mode = NULL, closed_by = NULL, team_tag_ids = NULL, recurring_id = NULL, updated_at = ? WHERE team_id = ?'),
    detachMemberRows: db.prepare('SELECT DISTINCT date FROM tasks WHERE team_id = ? AND uid = ?'),
    detachMember: db.prepare('UPDATE tasks SET team_id = NULL, assigned_by = NULL, needs_review = 0, review = NULL, group_id = NULL, group_mode = NULL, closed_by = NULL, team_tag_ids = NULL, recurring_id = NULL, updated_at = ? WHERE team_id = ? AND uid = ?'),
    leaveGroups: db.prepare('DELETE FROM team_group_members WHERE uid = ? AND group_id IN (SELECT id FROM team_groups WHERE team_id = ?)'),
    teamTaskOwners: db.prepare('SELECT uid, date FROM tasks WHERE team_id = ?'),
    moveTask: db.prepare('UPDATE tasks SET uid = ?, updated_at = ? WHERE id = ?'),
    moveAttachments: db.prepare('UPDATE attachments SET uid = ? WHERE task_id = ?'),
    moveFiles: db.prepare('UPDATE task_files SET uid = ? WHERE task_id = ?'),
    moveMisses: db.prepare('UPDATE task_misses SET uid = ? WHERE task_id = ?'),
    clearTags: db.prepare('DELETE FROM task_tags WHERE task_id = ?'),
    // 2.0
    setTitle: db.prepare('UPDATE team_members SET title = ? WHERE team_id = ? AND uid = ?'),
    setSettings: db.prepare('UPDATE teams SET settings = ?, updated_at = ? WHERE id = ?'),
    setArchived: db.prepare('UPDATE teams SET archived_at = ?, updated_at = ? WHERE id = ?'),
    taskAny: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`),
    groupTasks: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE group_id = ? ORDER BY created_at, id`),
    setReview: db.prepare('UPDATE tasks SET review = ?, updated_at = ? WHERE id = ?'),
    setClosed: db.prepare('UPDATE tasks SET status = ?, closed_by = ?, completed_at = ?, updated_at = ? WHERE id = ?'),
    setTeamTags: db.prepare('UPDATE tasks SET team_tag_ids = ?, updated_at = ? WHERE id = ?'),
    setNeedsReview: db.prepare('UPDATE tasks SET needs_review = ?, review = CASE WHEN ? = 0 THEN NULL ELSE review END, updated_at = ? WHERE id = ?'),
    fileAny: db.prepare(`SELECT f.*, t.team_id FROM task_files f JOIN tasks t ON t.id = f.task_id AND t.uid = f.uid WHERE f.id = ?`),
    insertFile: db.prepare(`INSERT INTO task_files (id, uid, task_id, name, mime, size, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    removeFile: db.prepare('DELETE FROM task_files WHERE id = ?'),
    fileIdTaken: db.prepare('SELECT 1 AS x FROM task_files WHERE id = ? UNION SELECT 1 FROM attachments WHERE id = ?'),
    fileCount: db.prepare('SELECT COUNT(*) AS n FROM task_files WHERE task_id = ? AND orphaned_at IS NULL'),

    comments: db.prepare(`SELECT c.*, u.name, u.display_name, u.email, u.photo FROM task_comments c LEFT JOIN users u ON u.uid = c.uid
      WHERE c.team_id = ? AND c.thread = ? ORDER BY c.created_at, c.id`),
    comment: db.prepare('SELECT * FROM task_comments WHERE id = ?'),
    insertComment: db.prepare('INSERT INTO task_comments (id, thread, team_id, uid, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    removeComment: db.prepare('DELETE FROM task_comments WHERE id = ?'),
    commentCounts: db.prepare(`SELECT thread, COUNT(*) AS n, MAX(created_at) AS last FROM task_comments WHERE team_id = ? GROUP BY thread`),

    groups: db.prepare('SELECT * FROM team_groups WHERE team_id = ? ORDER BY name COLLATE NOCASE, created_at'),
    group: db.prepare('SELECT * FROM team_groups WHERE id = ?'),
    groupMembers: db.prepare('SELECT gm.group_id, gm.uid FROM team_group_members gm JOIN team_groups g ON g.id = gm.group_id WHERE g.team_id = ?'),
    insertGroup: db.prepare('INSERT INTO team_groups (id, team_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)'),
    updateGroup: db.prepare('UPDATE team_groups SET name = ?, color = ? WHERE id = ?'),
    removeGroup: db.prepare('DELETE FROM team_groups WHERE id = ?'),
    clearGroupMembers: db.prepare('DELETE FROM team_group_members WHERE group_id = ?'),
    addGroupMember: db.prepare('INSERT OR IGNORE INTO team_group_members (group_id, uid) VALUES (?, ?)'),
    groupCount: db.prepare('SELECT COUNT(*) AS n FROM team_groups WHERE team_id = ?'),

    tags: db.prepare('SELECT * FROM team_tags WHERE team_id = ? ORDER BY name COLLATE NOCASE, created_at'),
    tag: db.prepare('SELECT * FROM team_tags WHERE id = ?'),
    insertTag: db.prepare('INSERT INTO team_tags (id, team_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)'),
    updateTag: db.prepare('UPDATE team_tags SET name = ?, color = ? WHERE id = ?'),
    removeTag: db.prepare('DELETE FROM team_tags WHERE id = ?'),
    tagCount: db.prepare('SELECT COUNT(*) AS n FROM team_tags WHERE team_id = ?'),
    tasksWithTag: db.prepare(`SELECT id, team_tag_ids FROM tasks WHERE team_id = ? AND instr(team_tag_ids, ?) > 0`),

    templates: db.prepare('SELECT * FROM team_templates WHERE team_id = ? ORDER BY name COLLATE NOCASE'),
    template: db.prepare('SELECT * FROM team_templates WHERE id = ?'),
    insertTemplate: db.prepare('INSERT INTO team_templates (id, team_id, name, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    updateTemplate: db.prepare('UPDATE team_templates SET name = ?, data = ?, updated_at = ? WHERE id = ?'),
    removeTemplate: db.prepare('DELETE FROM team_templates WHERE id = ?'),
    templateCount: db.prepare('SELECT COUNT(*) AS n FROM team_templates WHERE team_id = ?'),

    recurringList: db.prepare('SELECT * FROM team_recurring WHERE team_id = ? ORDER BY created_at'),
    recurring: db.prepare('SELECT * FROM team_recurring WHERE id = ?'),
    recurringDue: db.prepare(`SELECT r.* FROM team_recurring r JOIN teams t ON t.id = r.team_id
      WHERE r.active = 1 AND r.next_date <= ? AND t.archived_at IS NULL`),
    insertRecurring: db.prepare(`INSERT INTO team_recurring (id, team_id, data, rule, next_date, active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateRecurring: db.prepare('UPDATE team_recurring SET data = ?, rule = ?, next_date = ?, active = ?, updated_at = ? WHERE id = ?'),
    advanceRecurring: db.prepare('UPDATE team_recurring SET next_date = ? WHERE id = ?'),
    removeRecurring: db.prepare('DELETE FROM team_recurring WHERE id = ?'),
    recurringCount: db.prepare('SELECT COUNT(*) AS n FROM team_recurring WHERE team_id = ?'),

    link: db.prepare('SELECT * FROM team_links WHERE team_id = ?'),
    linkByToken: db.prepare('SELECT l.*, t.name, t.color, t.logo, t.archived_at FROM team_links l JOIN teams t ON t.id = l.team_id WHERE l.token = ?'),
    putLink: db.prepare(`INSERT INTO team_links (team_id, token, created_by, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (team_id) DO UPDATE SET token = excluded.token, created_by = excluded.created_by, created_at = excluded.created_at`),
    removeLink: db.prepare('DELETE FROM team_links WHERE team_id = ?'),
    requests: db.prepare(`SELECT r.*, u.name, u.display_name, u.email, u.photo FROM team_requests r LEFT JOIN users u ON u.uid = r.uid
      WHERE r.team_id = ? ORDER BY r.created_at`),
    request: db.prepare('SELECT * FROM team_requests WHERE team_id = ? AND uid = ?'),
    addRequest: db.prepare('INSERT OR IGNORE INTO team_requests (team_id, uid, created_at) VALUES (?, ?, ?)'),
    removeRequest: db.prepare('DELETE FROM team_requests WHERE team_id = ? AND uid = ?'),
    requestCount: db.prepare('SELECT COUNT(*) AS n FROM team_requests WHERE team_id = ?'),

    addActivity: db.prepare('INSERT INTO team_activity (team_id, uid, action, task_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    activity: db.prepare(`SELECT a.*, u.name, u.display_name, u.email FROM team_activity a LEFT JOIN users u ON u.uid = a.uid
      WHERE a.team_id = ? AND a.id < ? ORDER BY a.id DESC LIMIT ?`),

    addNotification: db.prepare(`INSERT INTO notifications (uid, kind, team_id, task_id, actor, title, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    notifications: db.prepare('SELECT * FROM notifications WHERE uid = ? AND id > ? ORDER BY id DESC LIMIT ?'),
    unread: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE uid = ? AND read_at IS NULL'),
    readUpTo: db.prepare('UPDATE notifications SET read_at = ? WHERE uid = ? AND id <= ? AND read_at IS NULL'),
    readOne: db.prepare('UPDATE notifications SET read_at = ? WHERE uid = ? AND id = ? AND read_at IS NULL'),
    trimNotifications: db.prepare('DELETE FROM notifications WHERE created_at < ?'),
    lastNudge: db.prepare(`SELECT MAX(created_at) AS at FROM notifications WHERE kind = 'nudge' AND task_id = ?`),

    sweep: db.prepare('SELECT at FROM sweeps WHERE key = ?'),
    renameCloser: db.prepare('UPDATE tasks SET closed_by = ? WHERE group_id = ? AND closed_by = ?'),
    templatesWithTag: db.prepare(`SELECT id, data FROM team_templates WHERE team_id = ? AND instr(data, ?) > 0`),
    recurringWithTag: db.prepare(`SELECT id, data FROM team_recurring WHERE team_id = ? AND instr(data, ?) > 0`),
    setTemplateData: db.prepare('UPDATE team_templates SET data = ? WHERE id = ?'),
    setRecurringData: db.prepare('UPDATE team_recurring SET data = ? WHERE id = ?'),
    putSweep: db.prepare('INSERT INTO sweeps (key, at) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET at = excluded.at'),
    lateTeamTasks: db.prepare(`SELECT t.uid, t.team_id, COUNT(*) AS n FROM tasks t JOIN teams tm ON tm.id = t.team_id
      WHERE t.team_id IS NOT NULL AND t.status = 'pending' AND tm.archived_at IS NULL
        AND (t.date < ? OR (t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) < ?))
      GROUP BY t.uid, t.team_id`),
    teamsActive: db.prepare('SELECT id, name FROM teams WHERE archived_at IS NULL'),
    digest: db.prepare(`SELECT SUM(status = 'pending' AND (date = ? OR substr(due_at, 1, 10) = ?)) AS due,
        SUM(status = 'pending' AND (date < ? OR (due_at IS NOT NULL AND substr(due_at, 1, 10) < ?))) AS late,
        SUM(review = 'waiting') AS review
      FROM tasks WHERE team_id = ?`),
    weekStats: db.prepare(`SELECT uid, SUM(status = 'done') AS done, SUM(status = 'pending' AND date < ?) AS late, COUNT(*) AS total
      FROM tasks WHERE team_id = ? AND date BETWEEN ? AND ? GROUP BY uid`),

    attachmentAny: db.prepare(`SELECT a.*, t.team_id FROM attachments a JOIN tasks t ON t.id = a.task_id AND t.uid = a.uid
      WHERE a.id = ?`),
  };

  const displayName = (r) => r.display_name || r.name || (r.email ? r.email.split('@')[0] : 'Someone');
  const inviterName = (r) => r.inviter_display || r.inviter_name || (r.inviter_email ? r.inviter_email.split('@')[0] : 'Someone');

  const member = (r) => ({
    uid: r.uid,
    role: r.role,
    name: displayName(r),
    email: r.email ?? null,
    photo: r.photo ?? null,
    title: r.title ?? null,
    joinedAt: r.joined_at,
  });
  const person = (r) => ({ uid: r.uid, name: displayName(r), email: r.email ?? null, photo: r.photo ?? null });
  const parse = (text, fallback) => {
    try {
      return text ? JSON.parse(text) : fallback;
    } catch {
      return fallback;
    }
  };
  const settingsOf = (row) => ({ membersCanAssign: false, ...parse(row.settings, {}) });

  const repo = {
    tx,

    teamIdTaken(id) {
      return s.teamIdTaken.get(id) !== undefined;
    },

    get(id) {
      return s.team.get(id) ?? null;
    },

    role(teamId, uid) {
      return s.role.get(teamId, uid)?.role ?? null;
    },

    teamCount(uid) {
      return Number(s.myTeamCount.get(uid).n);
    },

    memberCount(teamId) {
      return Number(s.memberCount.get(teamId).n);
    },

    memberUids(teamId) {
      return s.memberUids.all(teamId).map((r) => r.uid);
    },

    adminUids(teamId) {
      return s.adminUids.all(teamId).map((r) => r.uid);
    },

    members(teamId) {
      return s.members.all(teamId).map(member);
    },

    /** The team as one member sees it: invites only for its admins. */
    view(teamRow, myRole) {
      const admin = myRole === 'owner' || myRole === 'admin';
      return {
        id: teamRow.id,
        name: teamRow.name,
        color: teamRow.color,
        logo: teamRow.logo ?? null,
        createdBy: teamRow.created_by,
        createdAt: teamRow.created_at,
        updatedAt: teamRow.updated_at,
        role: myRole,
        archived: teamRow.archived_at != null,
        archivedAt: teamRow.archived_at ?? null,
        settings: settingsOf(teamRow),
        members: this.members(teamRow.id),
        groups: this.groups(teamRow.id),
        tags: this.tags(teamRow.id),
        requests: admin ? s.requests.all(teamRow.id).map((r) => ({ ...person(r), createdAt: r.created_at })) : [],
        invites: admin
          ? s.invites.all(teamRow.id).map((i) => ({
            id: i.id, email: i.email, role: i.role, invitedBy: i.invited_by, invitedByName: inviterName(i), createdAt: i.created_at,
          }))
          : [],
      };
    },

    listFor(uid) {
      return s.myTeams.all(uid).map((t) => this.view(t, t.my_role));
    },

    viewFor(teamId, uid) {
      const t = this.get(teamId);
      const role = t && this.role(teamId, uid);
      return role ? this.view(t, role) : null;
    },

    create(uid, { id, name, color, logo = null }, now = Date.now()) {
      tx(() => {
        s.insertTeam.run(id, name, color, logo, uid, now, now);
        s.addMember.run(id, uid, 'owner', now);
      });
    },

    update(teamId, { name, color, logo = null }, now = Date.now()) {
      s.updateTeam.run(name, color, logo, now, teamId);
    },

    touch(teamId, now = Date.now()) {
      s.touchTeam.run(now, teamId);
    },

    /** Deletes the team; its tasks stay with their people as ordinary tasks. Returns { uid, date } of those. */
    remove(teamId, now = Date.now()) {
      return tx(() => {
        const owners = s.teamTaskOwners.all(teamId);
        s.detachAll.run(now, teamId);
        s.removeTeam.run(teamId);
        return owners;
      });
    },

    setRole(teamId, uid, role) {
      s.setRole.run(role, teamId, uid);
    },

    /** Hands the team over: `to` becomes the owner, the old owner an admin. */
    transfer(teamId, from, to, now = Date.now()) {
      tx(() => {
        s.setRole.run('admin', teamId, from);
        s.setRole.run('owner', teamId, to);
        s.touchTeam.run(now, teamId);
      });
    },

    /** Takes someone out of the team; their team tasks become their own. Returns the days touched. */
    removeMember(teamId, uid, now = Date.now()) {
      return tx(() => {
        const days = s.detachMemberRows.all(teamId, uid).map((r) => r.date);
        s.detachMember.run(now, teamId, uid);
        s.leaveGroups.run(uid, teamId);
        s.removeMember.run(teamId, uid);
        s.touchTeam.run(now, teamId);
        return days;
      });
    },

    isMemberEmail(teamId, email) {
      return s.memberByEmail.get(teamId, email) !== undefined;
    },

    inviteCount(teamId) {
      return Number(s.inviteCount.get(teamId).n);
    },

    invite(id) {
      return s.invite.get(id) ?? null;
    },

    addInvites(teamId, list, invitedBy, now = Date.now()) {
      tx(() => {
        for (const i of list) s.upsertInvite.run(i.id, teamId, i.email, i.role, invitedBy, now);
        s.touchTeam.run(now, teamId);
      });
    },

    removeInvite(id) {
      return Number(s.removeInvite.run(id).changes) > 0;
    },

    myInvites(email) {
      if (!email) return [];
      return s.myInvites.all(email).map((i) => ({
        id: i.id,
        teamId: i.team_id,
        teamName: i.team_name,
        teamColor: i.team_color,
        teamLogo: i.team_logo ?? null,
        role: i.role,
        email: i.email,
        invitedBy: i.invited_by,
        invitedByName: inviterName(i),
        memberCount: Number(i.member_count),
        createdAt: i.created_at,
      }));
    },

    uidsByEmail(email) {
      return s.uidsByEmail.all(email).map((r) => r.uid);
    },

    /** Joins the team from an invite (already a member: the invite just goes away). */
    accept(invite, uid, now = Date.now()) {
      tx(() => {
        s.addMember.run(invite.team_id, uid, invite.role, now);
        s.removeInvite.run(invite.id);
        s.touchTeam.run(now, invite.team_id);
      });
    },

    /** Team tasks on days from..to, plus every unfinished one (whatever its day). Tags are personal: left out. */
    tasks(teamId, from, to) {
      return s.teamTasks.all(teamId, from, to).map((r) => ({ ...toTask(r), tagIds: [] }));
    },

    task(teamId, id) {
      const r = s.teamTask.get(teamId, id);
      return r ? { ...toTask(r), tagIds: [] } : null;
    },

    /** Gives a team task to someone else: its images and history go along, its (personal) tags don't. */
    reassign(taskId, to, now = Date.now()) {
      tx(() => {
        s.moveTask.run(to, now, taskId);
        s.moveAttachments.run(to, taskId);
        s.moveFiles.run(to, taskId);
        s.moveMisses.run(to, taskId);
        s.clearTags.run(taskId);
      });
    },

    // ---- 2.0 ------------------------------------------------------------------

    settings(teamRow) {
      return settingsOf(teamRow);
    },

    setSettings(teamId, settings, now = Date.now()) {
      s.setSettings.run(JSON.stringify(settings), now, teamId);
    },

    setArchived(teamId, archived, now = Date.now()) {
      s.setArchived.run(archived ? now : null, now, teamId);
    },

    setTitle(teamId, uid, title) {
      s.setTitle.run(title, teamId, uid);
    },

    /** Any task by id, whoever has it (callers check access). Tags are personal: left out. */
    taskAny(id) {
      const r = s.taskAny.get(id);
      return r ? { ...toTask(r), owner: r.uid } : null;
    },

    groupTasks(groupId) {
      return s.groupTasks.all(groupId).map((r) => ({ ...toTask(r), tagIds: [], owner: r.uid }));
    },

    setReview(taskId, review, now = Date.now()) {
      s.setReview.run(review, now, taskId);
    },

    /** "First one to finish closes it": the others are marked closed (cancelled), or opened again. */
    setClosed(taskId, closedBy, now = Date.now()) {
      if (closedBy) s.setClosed.run('cancelled', closedBy, null, now, taskId);
      else s.setClosed.run('pending', null, null, now, taskId);
    },

    setTeamTags(taskId, ids, now = Date.now()) {
      s.setTeamTags.run(ids.length ? JSON.stringify(ids) : null, now, taskId);
    },

    setNeedsReview(taskId, on, now = Date.now()) {
      s.setNeedsReview.run(on ? 1 : 0, on ? 1 : 0, now, taskId);
    },

    // Files on tasks (any type; images have their own table with thumbnails).
    fileWithTeam(id) {
      return s.fileAny.get(id) ?? null;
    },
    fileIdTaken(id) {
      return s.fileIdTaken.get(id, id) !== undefined;
    },
    fileCount(taskId) {
      return Number(s.fileCount.get(taskId).n);
    },
    insertFile(f) {
      s.insertFile.run(f.id, f.uid, f.taskId, f.name, f.mime, f.size, f.addedBy ?? null, f.createdAt);
    },
    removeFile(id) {
      return Number(s.removeFile.run(id).changes) > 0;
    },

    // Comments: one thread per task, shared by the copies of a task given to several people.
    comments(teamId, thread) {
      return s.comments.all(teamId, thread).map((c) => ({ id: c.id, thread: c.thread, uid: c.uid, name: displayName(c), photo: c.photo ?? null, text: c.text, createdAt: c.created_at }));
    },
    comment(id) {
      return s.comment.get(id) ?? null;
    },
    addComment(c) {
      s.insertComment.run(c.id, c.thread, c.teamId, c.uid, c.text, c.createdAt);
    },
    removeComment(id) {
      return Number(s.removeComment.run(id).changes) > 0;
    },
    commentCounts(teamId) {
      return Object.fromEntries(s.commentCounts.all(teamId).map((r) => [r.thread, { count: Number(r.n), last: r.last }]));
    },

    // Sub-groups (Design, Dev, Sales…)
    groups(teamId) {
      const members = new Map();
      for (const r of s.groupMembers.all(teamId)) members.set(r.group_id, [...(members.get(r.group_id) ?? []), r.uid]);
      return s.groups.all(teamId).map((g) => ({ id: g.id, name: g.name, color: g.color, members: members.get(g.id) ?? [] }));
    },
    group(id) {
      return s.group.get(id) ?? null;
    },
    groupCount(teamId) {
      return Number(s.groupCount.get(teamId).n);
    },
    saveGroup(g, isNew, now = Date.now()) {
      tx(() => {
        if (isNew) s.insertGroup.run(g.id, g.teamId, g.name, g.color, now);
        else s.updateGroup.run(g.name, g.color, g.id);
        if (g.members) {
          s.clearGroupMembers.run(g.id);
          for (const uid of g.members) s.addGroupMember.run(g.id, uid);
        }
      });
    },
    removeGroup(id) {
      return Number(s.removeGroup.run(id).changes) > 0;
    },

    // Team tags (the same for everyone in the team)
    tags(teamId) {
      return s.tags.all(teamId).map((t) => ({ id: t.id, name: t.name, color: t.color }));
    },
    tag(id) {
      return s.tag.get(id) ?? null;
    },
    tagCount(teamId) {
      return Number(s.tagCount.get(teamId).n);
    },
    saveTag(t, isNew, now = Date.now()) {
      if (isNew) s.insertTag.run(t.id, t.teamId, t.name, t.color, now);
      else s.updateTag.run(t.name, t.color, t.id);
    },
    /** Deletes a team tag and takes it off the team's tasks. Returns the ids of tasks that had it. */
    removeTag(teamId, id, now = Date.now()) {
      return tx(() => {
        const touched = [];
        for (const r of s.tasksWithTag.all(teamId, `"${id}"`)) {
          const ids = parse(r.team_tag_ids, []).filter((x) => x !== id);
          s.setTeamTags.run(ids.length ? JSON.stringify(ids) : null, now, r.id);
          touched.push(r.id);
        }
        // Templates and repeating tasks drop it too.
        for (const [list, set] of [[s.templatesWithTag, s.setTemplateData], [s.recurringWithTag, s.setRecurringData]]) {
          for (const r of list.all(teamId, `"${id}"`)) {
            const data = parse(r.data, {});
            if (Array.isArray(data.teamTagIds)) data.teamTagIds = data.teamTagIds.filter((x) => x !== id);
            set.run(JSON.stringify(data), r.id);
          }
        }
        s.removeTag.run(id);
        return touched;
      });
    },

    // Templates
    templates(teamId) {
      return s.templates.all(teamId).map((t) => ({ id: t.id, name: t.name, ...parse(t.data, {}), createdBy: t.created_by, updatedAt: t.updated_at }));
    },
    template(id) {
      return s.template.get(id) ?? null;
    },
    templateCount(teamId) {
      return Number(s.templateCount.get(teamId).n);
    },
    saveTemplate(t, isNew, now = Date.now()) {
      if (isNew) s.insertTemplate.run(t.id, t.teamId, t.name, JSON.stringify(t.data), t.createdBy, now, now);
      else s.updateTemplate.run(t.name, JSON.stringify(t.data), now, t.id);
    },
    removeTemplate(id) {
      return Number(s.removeTemplate.run(id).changes) > 0;
    },

    // Repeating tasks
    recurringView(r) {
      return { id: r.id, ...parse(r.data, {}), rule: parse(r.rule, {}), nextDate: r.next_date, active: Boolean(r.active), createdBy: r.created_by, updatedAt: r.updated_at };
    },
    recurringList(teamId) {
      return s.recurringList.all(teamId).map((r) => this.recurringView(r));
    },
    recurring(id) {
      return s.recurring.get(id) ?? null;
    },
    recurringCount(teamId) {
      return Number(s.recurringCount.get(teamId).n);
    },
    recurringDue(today) {
      return s.recurringDue.all(today);
    },
    saveRecurring(r, isNew, now = Date.now()) {
      if (isNew) s.insertRecurring.run(r.id, r.teamId, JSON.stringify(r.data), JSON.stringify(r.rule), r.nextDate, r.active ? 1 : 0, r.createdBy, now, now);
      else s.updateRecurring.run(JSON.stringify(r.data), JSON.stringify(r.rule), r.nextDate, r.active ? 1 : 0, now, r.id);
    },
    advanceRecurring(id, nextDate) {
      s.advanceRecurring.run(nextDate, id);
    },
    removeRecurring(id) {
      return Number(s.removeRecurring.run(id).changes) > 0;
    },

    // Invite link and join requests
    link(teamId) {
      return s.link.get(teamId) ?? null;
    },
    linkByToken(token) {
      return s.linkByToken.get(token) ?? null;
    },
    putLink(teamId, token, by, now = Date.now()) {
      s.putLink.run(teamId, token, by, now);
    },
    removeLink(teamId) {
      s.removeLink.run(teamId);
    },
    request(teamId, uid) {
      return s.request.get(teamId, uid) ?? null;
    },
    requestCount(teamId) {
      return Number(s.requestCount.get(teamId).n);
    },
    addRequest(teamId, uid, now = Date.now()) {
      s.addRequest.run(teamId, uid, now);
    },
    removeRequest(teamId, uid) {
      return Number(s.removeRequest.run(teamId, uid).changes) > 0;
    },
    /** Lets someone in from a join request. */
    approveRequest(teamId, uid, now = Date.now()) {
      tx(() => {
        s.addMember.run(teamId, uid, 'member', now);
        s.removeRequest.run(teamId, uid);
        s.touchTeam.run(now, teamId);
      });
    },

    // Activity log
    log(teamId, uid, action, taskId = null, detail = null, now = Date.now()) {
      s.addActivity.run(teamId, uid, action, taskId, detail ? JSON.stringify(detail) : null, now);
    },
    activity(teamId, before = Number.MAX_SAFE_INTEGER, limit = 50) {
      return s.activity.all(teamId, before, limit).map((a) => ({
        id: Number(a.id), uid: a.uid, name: displayName(a), action: a.action, taskId: a.task_id, detail: parse(a.detail, null), createdAt: a.created_at,
      }));
    },

    // Notifications
    notify(uid, n, now = Date.now()) {
      s.addNotification.run(uid, n.kind, n.teamId ?? null, n.taskId ?? null, n.actor ?? null, n.title, n.body ?? null, now);
    },
    notifications(uid, after = 0, limit = 50) {
      return s.notifications.all(uid, after, limit).map((n) => ({
        id: Number(n.id), kind: n.kind, teamId: n.team_id, taskId: n.task_id, actor: n.actor, title: n.title, body: n.body,
        createdAt: n.created_at, read: n.read_at != null,
      }));
    },
    unread(uid) {
      return Number(s.unread.get(uid).n);
    },
    markRead(uid, upTo, now = Date.now()) {
      s.readUpTo.run(now, uid, upTo);
    },
    markOneRead(uid, id, now = Date.now()) {
      s.readOne.run(now, uid, id);
    },
    trimNotifications(before) {
      s.trimNotifications.run(before);
    },
    lastNudge(taskId) {
      return s.lastNudge.get(taskId)?.at ?? null;
    },

    // Background jobs bookkeeping
    swept(key) {
      return s.sweep.get(key) !== undefined;
    },
    sweptAt(key) {
      return s.sweep.get(key)?.at ?? 0;
    },
    renameCloser(groupId, from, to) {
      s.renameCloser.run(to, groupId, from);
    },
    markSwept(key, now = Date.now()) {
      s.putSweep.run(key, now);
    },
    lateTeamTasks(today) {
      return s.lateTeamTasks.all(today, today).map((r) => ({ uid: r.uid, teamId: r.team_id, count: Number(r.n) }));
    },
    teamsActive() {
      return s.teamsActive.all();
    },
    digest(teamId, today) {
      const r = s.digest.get(today, today, today, today, teamId);
      return { due: Number(r.due ?? 0), late: Number(r.late ?? 0), review: Number(r.review ?? 0) };
    },
    weekStats(teamId, from, to, today) {
      return s.weekStats.all(today, teamId, from, to).map((r) => ({ uid: r.uid, done: Number(r.done ?? 0), late: Number(r.late ?? 0), total: Number(r.total) }));
    },

    /** An image by id with the team of its task (for admins viewing a teammate's task). */
    attachmentWithTeam(id) {
      return s.attachmentAny.get(id) ?? null;
    },
  };
  return repo;
}
