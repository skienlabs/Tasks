import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Each entry upgrades the schema by one version. Never edit a shipped entry;
// append a new one instead.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    uid        TEXT PRIMARY KEY,
    email      TEXT,
    name       TEXT,
    photo      TEXT,
    created_at INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
  );

  CREATE TABLE tasks (
    id            TEXT PRIMARY KEY,
    uid           TEXT NOT NULL,
    title         TEXT NOT NULL,
    notes         TEXT NOT NULL DEFAULT '',
    priority      INTEGER NOT NULL DEFAULT 4 CHECK (priority BETWEEN 1 AND 4),
    date          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
    original_date TEXT NOT NULL,
    postponed     INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    completed_at  INTEGER
  );

  CREATE INDEX idx_tasks_uid_date ON tasks (uid, date);
  CREATE INDEX idx_tasks_uid_status_date ON tasks (uid, status, date);
  `,
  // v2: tags (e.g. one per company), many-to-many with tasks
  `
  CREATE TABLE tags (
    id         TEXT PRIMARY KEY,
    uid        TEXT NOT NULL,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT 'blue',
    logo       TEXT,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_tags_uid ON tags (uid);

  CREATE TABLE task_tags (
    task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    tag_id  TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
  );
  CREATE INDEX idx_task_tags_tag ON task_tags (tag_id);
  `,
  // v3: profile chosen in the app (separate from the name Google/Firebase sends)
  `
  ALTER TABLE users ADD COLUMN display_name TEXT;
  ALTER TABLE users ADD COLUMN onboarded_at INTEGER;
  `,
  // v4: steps (sub-tasks, a JSON tree on the task) and image attachments (files on disk).
  // Attachments outlive a deleted task for a day (orphaned_at) so "Undo" can bring them back.
  `
  ALTER TABLE tasks ADD COLUMN subtasks TEXT NOT NULL DEFAULT '[]';

  CREATE TABLE attachments (
    id          TEXT PRIMARY KEY,
    uid         TEXT NOT NULL,
    task_id     TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('jpeg', 'png', 'webp')),
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    size        INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    orphaned_at INTEGER
  );
  CREATE INDEX idx_attachments_task ON attachments (uid, task_id);
  CREATE INDEX idx_attachments_orphaned ON attachments (orphaned_at) WHERE orphaned_at IS NOT NULL;
  `,
  // v5: unfinished tasks move to today on their own; carried_from keeps the day they were first due.
  `
  ALTER TABLE tasks ADD COLUMN carried_from TEXT;
  CREATE INDEX idx_tasks_pending ON tasks (uid, date) WHERE status = 'pending';
  `,
];

export function openDb(file) {
  if (file !== ':memory:') {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error(
        `Data directory ${dir} is not writable by uid ${process.getuid?.()}. ` +
          'Use a named Docker volume, or run: sudo chown -R 1000:1000 <host folder>',
      );
    }
  }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
  `);
  migrate(db);
  return db;
}

function migrate(db) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get();
  if (current > MIGRATIONS.length) {
    throw new Error(
      `Database schema v${current} is newer than this app (v${MIGRATIONS.length}). ` +
        'Deploy the newer image again, or restore a backup made for this version.',
    );
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* keep the original error */
      }
      throw err;
    }
  }
}

const COLUMNS = `id, title, notes, priority, date, status, original_date, postponed,
  created_at, updated_at, completed_at, subtasks, carried_from,
  (SELECT json_group_array(tag_id) FROM task_tags WHERE task_id = tasks.id) AS tag_ids,
  (SELECT json_group_array(json_object('id', a.id, 'type', a.type, 'width', a.width, 'height', a.height,
      'size', a.size, 'createdAt', a.created_at))
    FROM (SELECT * FROM attachments WHERE uid = tasks.uid AND task_id = tasks.id ORDER BY created_at, id) a) AS attachments`;

export function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    priority: row.priority,
    date: row.date,
    status: row.status,
    originalDate: row.original_date,
    postponed: row.postponed,
    carriedFrom: row.carried_from ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
    tagIds: row.tag_ids ? JSON.parse(row.tag_ids).sort() : [],
    subtasks: row.subtasks ? JSON.parse(row.subtasks) : [],
    attachments: row.attachments ? JSON.parse(row.attachments) : [],
  };
}



export function toTag(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    logo: row.logo ?? null,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TAG_COLUMNS = 'id, name, color, logo, position, created_at, updated_at';

// Close to the apps' order (they also group by company and compare numbers by value).
const ORDER = `ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
  priority ASC, title COLLATE NOCASE ASC, created_at ASC`;

export function createRepo(db) {
  const stmts = {
    upsertUser: db.prepare(`
      INSERT INTO users (uid, email, name, photo, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (uid) DO UPDATE SET
        email = excluded.email, name = excluded.name,
        photo = excluded.photo, last_seen = excluded.last_seen`),
    byDate: db.prepare(`SELECT ${COLUMNS} FROM tasks WHERE uid = ? AND date = ? ${ORDER}`),
    overdue: db.prepare(`SELECT ${COLUMNS} FROM tasks
      WHERE uid = ? AND status = 'pending' AND date < ?
      ORDER BY date ASC, priority ASC, created_at ASC`),
    get: db.prepare(`SELECT ${COLUMNS} FROM tasks WHERE uid = ? AND id = ?`),
    exists: db.prepare('SELECT uid FROM tasks WHERE id = ?'),
    insert: db.prepare(`INSERT INTO tasks
      (id, uid, title, notes, priority, date, status, original_date, postponed,
       created_at, updated_at, completed_at, subtasks, carried_from)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    update: db.prepare(`UPDATE tasks SET
      title = ?, notes = ?, priority = ?, date = ?, status = ?, postponed = ?,
      updated_at = ?, completed_at = ?, subtasks = ?, carried_from = ?
      WHERE uid = ? AND id = ?`),
    carryDates: db.prepare(`SELECT DISTINCT date FROM tasks WHERE uid = ? AND status = 'pending' AND date < ?`),
    carry: db.prepare(`UPDATE tasks SET carried_from = COALESCE(carried_from, date), date = ?, updated_at = ?
      WHERE uid = ? AND status = 'pending' AND date < ?`),
    remove: db.prepare('DELETE FROM tasks WHERE uid = ? AND id = ?'),

    // attachments
    attachment: db.prepare('SELECT * FROM attachments WHERE uid = ? AND id = ?'),
    attachmentIdTaken: db.prepare('SELECT uid FROM attachments WHERE id = ?'),
    attachmentCount: db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE uid = ? AND task_id = ?'),
    insertAttachment: db.prepare(`INSERT INTO attachments (id, uid, task_id, type, width, height, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    removeAttachment: db.prepare('DELETE FROM attachments WHERE uid = ? AND id = ?'),
    orphanAttachments: db.prepare('UPDATE attachments SET orphaned_at = ? WHERE uid = ? AND task_id = ?'),
    adoptAttachments: db.prepare('UPDATE attachments SET orphaned_at = NULL WHERE uid = ? AND task_id = ?'),
    expiredAttachments: db.prepare('SELECT id, type FROM attachments WHERE orphaned_at IS NOT NULL AND orphaned_at < ?'),
    removeAttachmentById: db.prepare('DELETE FROM attachments WHERE id = ?'),
    summary: db.prepare(`SELECT date,
        SUM(status = 'pending')   AS pending,
        SUM(status = 'done')      AS done,
        SUM(status = 'cancelled') AS cancelled
      FROM tasks WHERE uid = ? AND date BETWEEN ? AND ?
      GROUP BY date ORDER BY date`),

    profile: db.prepare('SELECT uid, email, name, display_name, photo, created_at, onboarded_at FROM users WHERE uid = ?'),
    setDisplayName: db.prepare('UPDATE users SET display_name = ? WHERE uid = ?'),
    setOnboarded: db.prepare('UPDATE users SET onboarded_at = COALESCE(onboarded_at, ?) WHERE uid = ?'),

    // tags
    tags: db.prepare(`SELECT ${TAG_COLUMNS} FROM tags WHERE uid = ? ORDER BY position, created_at`),
    tag: db.prepare(`SELECT ${TAG_COLUMNS} FROM tags WHERE uid = ? AND id = ?`),
    tagExists: db.prepare('SELECT uid FROM tags WHERE id = ?'),
    tagCount: db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS maxpos FROM tags WHERE uid = ?'),
    insertTag: db.prepare(`INSERT INTO tags (id, uid, name, color, logo, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    updateTag: db.prepare(`UPDATE tags SET name = ?, color = ?, logo = ?, position = ?, updated_at = ?
      WHERE uid = ? AND id = ?`),
    removeTag: db.prepare('DELETE FROM tags WHERE uid = ? AND id = ?'),
    ownedTags: db.prepare(`SELECT id FROM tags WHERE uid = ? AND id IN (SELECT value FROM json_each(?))`),
    clearTaskTags: db.prepare('DELETE FROM task_tags WHERE task_id = ?'),
    addTaskTag: db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)'),

    // stats
    statsByTag: db.prepare(`SELECT tt.tag_id AS tag,
        SUM(t.status = 'pending')   AS pending,
        SUM(t.status = 'done')      AS done,
        SUM(t.status = 'cancelled') AS cancelled
      FROM tasks t LEFT JOIN task_tags tt ON tt.task_id = t.id
      WHERE t.uid = ? AND t.date BETWEEN ? AND ?
      GROUP BY tt.tag_id`),
    statsByPriority: db.prepare(`SELECT priority,
        SUM(status = 'pending')   AS pending,
        SUM(status = 'done')      AS done,
        SUM(status = 'cancelled') AS cancelled
      FROM tasks WHERE uid = ? AND date BETWEEN ? AND ?
      GROUP BY priority ORDER BY priority`),
    statsExtra: db.prepare(`SELECT
        SUM(carried_from IS NOT NULL OR (status = 'pending' AND date < ?)) AS overdue,
        SUM(postponed > 0)                   AS postponed
      FROM tasks WHERE uid = ? AND date BETWEEN ? AND ?`),
  };

  const counts = (r) => ({ pending: Number(r.pending), done: Number(r.done), cancelled: Number(r.cancelled) });

  function tx(fn) {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function writeTaskTags(taskId, tagIds) {
    stmts.clearTaskTags.run(taskId);
    for (const tagId of tagIds) stmts.addTaskTag.run(taskId, tagId);
  }

  return {
    upsertUser(user, now = Date.now()) {
      stmts.upsertUser.run(user.uid, user.email ?? null, user.name ?? null, user.photo ?? null, now, now);
    },

    getProfile(uid) {
      const r = stmts.profile.get(uid);
      if (!r) return null;
      return {
        uid: r.uid,
        email: r.email,
        name: r.display_name || r.name || (r.email ? r.email.split('@')[0] : 'there'),
        photo: r.photo,
        createdAt: r.created_at,
        onboarded: r.onboarded_at != null,
      };
    },

    setDisplayName(uid, name) {
      stmts.setDisplayName.run(name, uid);
    },

    setOnboarded(uid, now = Date.now()) {
      stmts.setOnboarded.run(now, uid);
    },

    listByDate(uid, date) {
      return stmts.byDate.all(uid, date).map(toTask);
    },

    listOverdue(uid, today) {
      return stmts.overdue.all(uid, today).map(toTask);
    },

    /**
     * Moves every unfinished task from an earlier day to `today`. Returns the days it
     * took tasks from (empty when nothing moved). The first missed day is kept in carried_from.
     */
    carryOver(uid, today, now = Date.now()) {
      return tx(() => {
        const dates = stmts.carryDates.all(uid, today).map((r) => r.date);
        if (dates.length) stmts.carry.run(today, now, uid, today);
        return dates;
      });
    },

    get(uid, id) {
      const row = stmts.get.get(uid, id);
      return row ? toTask(row) : null;
    },

    /** True when the id is taken by any user (ids are global primary keys). */
    idTaken(id) {
      return stmts.exists.get(id) !== undefined;
    },

    insert(uid, t) {
      tx(() => {
        stmts.insert.run(
          t.id, uid, t.title, t.notes, t.priority, t.date, t.status, t.originalDate,
          t.postponed, t.createdAt, t.updatedAt, t.completedAt ?? null, JSON.stringify(t.subtasks ?? []),
          t.carriedFrom ?? null,
        );
        writeTaskTags(t.id, t.tagIds ?? []);
        stmts.adoptAttachments.run(uid, t.id); // re-created by "Undo": its images come back
      });
      return this.get(uid, t.id);
    },

    /** `t.tagIds` undefined leaves tags unchanged. */
    update(uid, t) {
      tx(() => {
        stmts.update.run(
          t.title, t.notes, t.priority, t.date, t.status, t.postponed,
          t.updatedAt, t.completedAt ?? null, JSON.stringify(t.subtasks ?? []), t.carriedFrom ?? null, uid, t.id,
        );
        if (t.tagIds !== undefined) writeTaskTags(t.id, t.tagIds);
      });
      return this.get(uid, t.id);
    },

    /** Returns true when every id is a tag owned by this user. */
    ownsTags(uid, ids) {
      if (!ids.length) return true;
      return stmts.ownedTags.all(uid, JSON.stringify(ids)).length === ids.length;
    },

    listTags(uid) {
      return stmts.tags.all(uid).map(toTag);
    },

    getTag(uid, id) {
      const row = stmts.tag.get(uid, id);
      return row ? toTag(row) : null;
    },

    tagIdTaken(id) {
      return stmts.tagExists.get(id) !== undefined;
    },

    /** Case-insensitive for every language (SQLite's lower() only folds A-Z). */
    tagNameTaken(uid, name, exceptId = null) {
      const key = name.normalize('NFC').toLocaleLowerCase();
      return stmts.tags.all(uid).some((t) => t.id !== exceptId && t.name.normalize('NFC').toLocaleLowerCase() === key);
    },

    tagStats(uid) {
      const r = stmts.tagCount.get(uid);
      return { count: Number(r.n), maxPosition: Number(r.maxpos) };
    },

    insertTag(uid, t) {
      stmts.insertTag.run(t.id, uid, t.name, t.color, t.logo ?? null, t.position, t.createdAt, t.updatedAt);
      return this.getTag(uid, t.id);
    },

    updateTag(uid, t) {
      stmts.updateTag.run(t.name, t.color, t.logo ?? null, t.position, t.updatedAt, uid, t.id);
      return this.getTag(uid, t.id);
    },

    removeTag(uid, id) {
      return Number(stmts.removeTag.run(uid, id).changes) > 0;
    },

    stats(uid, from, to, today) {
      const extra = stmts.statsExtra.get(today, uid, from, to);
      return {
        days: this.summary(uid, from, to),
        byTag: stmts.statsByTag.all(uid, from, to).map((r) => ({ tagId: r.tag ?? null, ...counts(r) })),
        byPriority: stmts.statsByPriority.all(uid, from, to).map((r) => ({ priority: r.priority, ...counts(r) })),
        overdue: Number(extra.overdue ?? 0),
        postponed: Number(extra.postponed ?? 0),
      };
    },

    remove(uid, id, now = Date.now()) {
      return tx(() => {
        const removed = Number(stmts.remove.run(uid, id).changes) > 0;
        if (removed) stmts.orphanAttachments.run(now, uid, id);
        return removed;
      });
    },

    getAttachment(uid, id) {
      return stmts.attachment.get(uid, id) ?? null;
    },

    attachmentIdTaken(id) {
      return stmts.attachmentIdTaken.get(id) !== undefined;
    },

    attachmentCount(uid, taskId) {
      return Number(stmts.attachmentCount.get(uid, taskId).n);
    },

    insertAttachment(uid, a) {
      stmts.insertAttachment.run(a.id, uid, a.taskId, a.type, a.width, a.height, a.size, a.createdAt);
    },

    removeAttachment(uid, id) {
      return Number(stmts.removeAttachment.run(uid, id).changes) > 0;
    },

    /** Attachments of tasks deleted before `cutoff` (removed for good by the caller). */
    expiredAttachments(cutoff) {
      return stmts.expiredAttachments.all(cutoff);
    },

    dropAttachment(id) {
      stmts.removeAttachmentById.run(id);
    },

    summary(uid, from, to) {
      return stmts.summary.all(uid, from, to).map((r) => ({
        date: r.date,
        pending: Number(r.pending),
        done: Number(r.done),
        cancelled: Number(r.cancelled),
      }));
    },
  };
}
