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
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

const COLUMNS = `id, title, notes, priority, date, status, original_date, postponed,
  created_at, updated_at, completed_at`;

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
  };
}

const ORDER = `ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
  priority ASC, created_at ASC`;

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
       created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    update: db.prepare(`UPDATE tasks SET
      title = ?, notes = ?, priority = ?, date = ?, status = ?, postponed = ?,
      updated_at = ?, completed_at = ?
      WHERE uid = ? AND id = ?`),
    remove: db.prepare('DELETE FROM tasks WHERE uid = ? AND id = ?'),
    summary: db.prepare(`SELECT date,
        SUM(status = 'pending')   AS pending,
        SUM(status = 'done')      AS done,
        SUM(status = 'cancelled') AS cancelled
      FROM tasks WHERE uid = ? AND date BETWEEN ? AND ?
      GROUP BY date ORDER BY date`),
  };

  return {
    upsertUser(user, now = Date.now()) {
      stmts.upsertUser.run(user.uid, user.email ?? null, user.name ?? null, user.photo ?? null, now, now);
    },

    listByDate(uid, date) {
      return stmts.byDate.all(uid, date).map(toTask);
    },

    listOverdue(uid, today) {
      return stmts.overdue.all(uid, today).map(toTask);
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
      stmts.insert.run(
        t.id, uid, t.title, t.notes, t.priority, t.date, t.status, t.originalDate,
        t.postponed, t.createdAt, t.updatedAt, t.completedAt ?? null,
      );
      return this.get(uid, t.id);
    },

    update(uid, t) {
      stmts.update.run(
        t.title, t.notes, t.priority, t.date, t.status, t.postponed,
        t.updatedAt, t.completedAt ?? null, uid, t.id,
      );
      return this.get(uid, t.id);
    },

    remove(uid, id) {
      return Number(stmts.remove.run(uid, id).changes) > 0;
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
