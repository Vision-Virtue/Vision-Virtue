import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DB_PATH || './data/marketing.db';
  const resolvedPath = path.resolve(dbPath);
  const dir = path.dirname(resolvedPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);

  return db;
}

function initializeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS content_items (
      id               TEXT PRIMARY KEY,
      topic            TEXT NOT NULL,
      state            TEXT NOT NULL DEFAULT 'IDEA_IDENTIFIED',
      economist_brief  TEXT,
      marketing_draft  TEXT,
      vp_review        TEXT,
      approval         TEXT,
      metadata         TEXT NOT NULL DEFAULT '{"revision_count":0}',
      publish_result   TEXT,
      revision_history TEXT NOT NULL DEFAULT '[]',
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id             TEXT PRIMARY KEY,
      content_id     TEXT NOT NULL,
      action         TEXT NOT NULL,
      actor          TEXT NOT NULL,
      previous_state TEXT,
      new_state      TEXT,
      details        TEXT NOT NULL DEFAULT '{}',
      created_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_content_id ON audit_logs(content_id);
    CREATE INDEX IF NOT EXISTS idx_content_items_state ON content_items(state);
    CREATE INDEX IF NOT EXISTS idx_content_items_created ON content_items(created_at);

    CREATE TABLE IF NOT EXISTS linkedin_accounts (
      id              TEXT PRIMARY KEY,
      access_token    TEXT NOT NULL,
      refresh_token   TEXT NOT NULL DEFAULT '',
      expires_at      INTEGER NOT NULL,
      organization_id TEXT NOT NULL DEFAULT '',
      person_urn      TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS linkedin_profile_cache (
      id         TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migrations — add new columns to existing tables
  try {
    database.exec(`ALTER TABLE content_items ADD COLUMN qa_history TEXT NOT NULL DEFAULT '[]'`);
  } catch { /* already exists */ }
  try {
    database.exec(`ALTER TABLE linkedin_accounts ADD COLUMN person_urn TEXT NOT NULL DEFAULT ''`);
  } catch { /* already exists */ }

  console.log('[DB] Schema initialized successfully');
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
