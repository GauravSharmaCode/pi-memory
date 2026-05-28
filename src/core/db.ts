import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, ensureWorkspaceDirs } from '../config.js';

export type DB = DatabaseSync;

const SCHEMA = `
-- ── Chunks: indexed content from all markdown files ───────────────────────────
CREATE TABLE IF NOT EXISTS chunks (
  id           TEXT PRIMARY KEY,
  path         TEXT NOT NULL,
  source       TEXT NOT NULL,
  start_line   INTEGER NOT NULL DEFAULT 0,
  end_line     INTEGER NOT NULL DEFAULT 0,
  text         TEXT NOT NULL,
  embedding    TEXT,
  model        TEXT,
  indexed_at   INTEGER NOT NULL,
  file_mtime   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chunks_path      ON chunks(path);
CREATE INDEX IF NOT EXISTS idx_chunks_source    ON chunks(source);
CREATE INDEX IF NOT EXISTS idx_chunks_indexed   ON chunks(indexed_at);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  id UNINDEXED,
  path,
  source,
  text,
  tokenize='unicode61 remove_diacritics 1'
);

-- ── Work log: structured entries ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worklog (
  id          TEXT PRIMARY KEY,
  ts          TEXT NOT NULL,
  type        TEXT NOT NULL,
  ticket_id   TEXT,
  summary     TEXT NOT NULL,
  resolution  TEXT,
  ctx         TEXT,
  tags        TEXT,
  time_spent  TEXT,
  recurring   INTEGER DEFAULT 0,
  embedding   TEXT,
  model       TEXT
);

CREATE INDEX IF NOT EXISTS idx_worklog_ts   ON worklog(ts);
CREATE INDEX IF NOT EXISTS idx_worklog_type ON worklog(type);

CREATE VIRTUAL TABLE IF NOT EXISTS worklog_fts USING fts5(
  id UNINDEXED,
  summary,
  resolution,
  tags,
  type,
  tokenize='unicode61 remove_diacritics 1'
);

-- ── Recall log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recall_log (
  id          TEXT PRIMARY KEY,
  chunk_id    TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  query       TEXT NOT NULL,
  recalled_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recall_chunk   ON recall_log(chunk_id);
CREATE INDEX IF NOT EXISTS idx_recall_session ON recall_log(session_id);
CREATE INDEX IF NOT EXISTS idx_recall_at      ON recall_log(recalled_at);

-- ── Meta ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  ensureWorkspaceDirs();
  const dbPath = path.join(config.workspace.indexDir, 'memory.db');

  _db = new DatabaseSync(dbPath);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA busy_timeout = 5000');
  _db.exec('PRAGMA synchronous = NORMAL');
  _db.exec(SCHEMA);

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function dbGet<T>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...(params as any[])) as T | undefined;
}

export function dbAll<T>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...(params as any[])) as T[];
}

export function dbRun(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).run(...(params as any[]));
}

export function dbTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
