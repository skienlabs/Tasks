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
    insertTeam: db.prepare('INSERT INTO teams (id, name, color, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    updateTeam: db.prepare('UPDATE teams SET name = ?, color = ?, updated_at = ? WHERE id = ?'),
    touchTeam: db.prepare('UPDATE teams SET updated_at = ? WHERE id = ?'),
    removeTeam: db.prepare('DELETE FROM teams WHERE id = ?'),
    myTeams: db.prepare(`SELECT t.*, m.role AS my_role FROM team_members m JOIN teams t ON t.id = m.team_id
      WHERE m.uid = ? ORDER BY t.name COLLATE NOCASE, t.created_at`),
    myTeamCount: db.prepare('SELECT COUNT(*) AS n FROM team_members WHERE uid = ?'),
    role: db.prepare('SELECT role FROM team_members WHERE team_id = ? AND uid = ?'),
    members: db.prepare(`SELECT m.uid, m.role, m.joined_at, u.email, u.name, u.display_name, u.photo
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
    myInvites: db.prepare(`SELECT i.*, t.name AS team_name, t.color AS team_color,
        u.name AS inviter_name, u.display_name AS inviter_display, u.email AS inviter_email,
        (SELECT COUNT(*) FROM team_members m WHERE m.team_id = i.team_id) AS member_count
      FROM team_invites i JOIN teams t ON t.id = i.team_id LEFT JOIN users u ON u.uid = i.invited_by
      WHERE i.email = ? ORDER BY i.created_at`),
    uidsByEmail: db.prepare('SELECT uid FROM users WHERE email = ?'),

    // Team tasks
    teamTasks: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE team_id = ?
      AND (date BETWEEN ? AND ? OR status = 'pending') ORDER BY date, priority, created_at`),
    teamTask: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE team_id = ? AND id = ?`),
    detachAll: db.prepare('UPDATE tasks SET team_id = NULL, assigned_by = NULL, updated_at = ? WHERE team_id = ?'),
    detachMemberRows: db.prepare('SELECT DISTINCT date FROM tasks WHERE team_id = ? AND uid = ?'),
    detachMember: db.prepare('UPDATE tasks SET team_id = NULL, assigned_by = NULL, updated_at = ? WHERE team_id = ? AND uid = ?'),
    teamTaskOwners: db.prepare('SELECT uid, date FROM tasks WHERE team_id = ?'),
    moveTask: db.prepare('UPDATE tasks SET uid = ?, updated_at = ? WHERE id = ?'),
    moveAttachments: db.prepare('UPDATE attachments SET uid = ? WHERE task_id = ?'),
    moveMisses: db.prepare('UPDATE task_misses SET uid = ? WHERE task_id = ?'),
    clearTags: db.prepare('DELETE FROM task_tags WHERE task_id = ?'),
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
    joinedAt: r.joined_at,
  });

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
        createdBy: teamRow.created_by,
        createdAt: teamRow.created_at,
        updatedAt: teamRow.updated_at,
        role: myRole,
        members: this.members(teamRow.id),
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

    create(uid, { id, name, color }, now = Date.now()) {
      tx(() => {
        s.insertTeam.run(id, name, color, uid, now, now);
        s.addMember.run(id, uid, 'owner', now);
      });
    },

    update(teamId, { name, color }, now = Date.now()) {
      s.updateTeam.run(name, color, now, teamId);
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
        s.moveMisses.run(to, taskId);
        s.clearTags.run(taskId);
      });
    },

    /** An image by id with the team of its task (for admins viewing a teammate's task). */
    attachmentWithTeam(id) {
      return s.attachmentAny.get(id) ?? null;
    },
  };
  return repo;
}
