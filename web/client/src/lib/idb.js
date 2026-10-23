// A small IndexedDB layer for the offline copy: tasks, settings-like values, the queue of
// changes waiting to be sent, and images. Every call fails soft: if the browser refuses
// IndexedDB (some private windows), the app still works online and just keeps nothing.

const DB_NAME = 'tasks-offline';
const VERSION = 1;
export const STORES = ['tasks', 'meta', 'outbox', 'images'];

let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'key' });
          store.createIndex('uid', 'uid', { unique: false });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgraded the database: close so it can, and reopen next time.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
});

const result = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** Row key for a user's item: "<uid>|<id>". */
export const rowKey = (uid, id) => `${uid}|${id}`;

/** All rows of one user in a store (their `value`s). */
export async function getAll(store, uid) {
  try {
    const db = await open();
    const tx = db.transaction(store, 'readonly');
    const rows = await result(tx.objectStore(store).index('uid').getAll(uid));
    return rows.map((r) => r.value);
  } catch {
    return [];
  }
}

export async function get(store, uid, id) {
  try {
    const db = await open();
    const row = await result(db.transaction(store, 'readonly').objectStore(store).get(rowKey(uid, id)));
    return row ? row.value : undefined;
  } catch {
    return undefined;
  }
}

/** Writes and deletes in one transaction. `puts`: [[id, value]], `deletes`: [id]. Returns true on success. */
export async function write(store, uid, puts = [], deletes = []) {
  if (!puts.length && !deletes.length) return true;
  try {
    const db = await open();
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const id of deletes) os.delete(rowKey(uid, id));
    for (const [id, value] of puts) os.put({ key: rowKey(uid, id), uid, value });
    await done(tx);
    return true;
  } catch {
    return false;
  }
}

/** True when the row exists (used to skip a change another tab has already sent). */
export async function has(store, uid, id) {
  try {
    const db = await open();
    const n = await result(db.transaction(store, 'readonly').objectStore(store).count(rowKey(uid, id)));
    return n > 0;
  } catch {
    return true; // can't tell: send it (every change is safe to repeat)
  }
}

/** Removes everything saved for one user (sign-out), or for everyone when uid is omitted. */
export async function wipe(uid) {
  try {
    const db = await open();
    for (const name of STORES) {
      const keys = uid === undefined ? null : await result(db.transaction(name, 'readonly').objectStore(name).index('uid').getAllKeys(uid));
      const tx = db.transaction(name, 'readwrite');
      const os = tx.objectStore(name);
      if (keys === null) os.clear();
      else for (const k of keys) os.delete(k);
      await done(tx);
    }
  } catch {
    /* nothing saved, nothing to wipe */
  }
}
