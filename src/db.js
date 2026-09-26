import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE bins (
        id             TEXT PRIMARY KEY,
        token          TEXT NOT NULL UNIQUE,
        name           TEXT NOT NULL,
        secret         TEXT,
        is_paused      INTEGER NOT NULL DEFAULT 0,
        retention_days INTEGER NOT NULL DEFAULT 7,
        created_at     INTEGER NOT NULL
      );

      CREATE TABLE requests (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        bin_id          TEXT NOT NULL REFERENCES bins(id) ON DELETE CASCADE,
        received_at     INTEGER NOT NULL,
        method          TEXT NOT NULL,
        path            TEXT NOT NULL,
        query           TEXT NOT NULL DEFAULT '{}',
        headers         TEXT NOT NULL DEFAULT '{}',
        body            BLOB,
        body_encoding   TEXT NOT NULL DEFAULT 'utf8',
        content_type    TEXT,
        remote_addr     TEXT,
        response_status INTEGER NOT NULL,
        response_ms     INTEGER,
        response_note   TEXT,
        replay_of       INTEGER REFERENCES requests(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_requests_bin_time ON requests (bin_id, received_at DESC);
      CREATE INDEX idx_requests_bin_method ON requests (bin_id, method);

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

/**
 * Opens (and creates if needed) the SQLite database, then brings the schema up
 * to date. Everything HookLine stores lives in this single file.
 */
export function openDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function closeDatabase(db) {
  try {
    db.close();
  } catch {
    /* already closed */
  }
}
