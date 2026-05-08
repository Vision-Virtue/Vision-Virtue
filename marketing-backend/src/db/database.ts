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

    CREATE TABLE IF NOT EXISTS customer_keys (
      id              TEXT PRIMARY KEY,
      key             TEXT NOT NULL UNIQUE,
      customer_name   TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL,
      created_by      TEXT NOT NULL DEFAULT 'admin',
      revoked         INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_customer_keys_key ON customer_keys(key);

    CREATE TABLE IF NOT EXISTS partner_submissions (
      id                   TEXT PRIMARY KEY,
      customer_key_id      TEXT,
      customer_name        TEXT NOT NULL,
      form_data            TEXT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'review',
      submitted_at         TEXT NOT NULL,
      finalized_at         TEXT,
      finalized_xlsx_path  TEXT,
      notes                TEXT,
      FOREIGN KEY (customer_key_id) REFERENCES customer_keys(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_partner_subs_status     ON partner_submissions(status);
    CREATE INDEX IF NOT EXISTS idx_partner_subs_key_id     ON partner_submissions(customer_key_id);
    CREATE INDEX IF NOT EXISTS idx_partner_subs_submitted  ON partner_submissions(submitted_at);

    -- Visibility offering — Financial Structure (Phase 1).
    -- One row per GL line for a given customer key. budget_category may be
    -- one of the fixed dropdown options, or 'Your Budget Category' with a
    -- free-text override stored in budget_category_custom.
    CREATE TABLE IF NOT EXISTS gl_accounts (
      id                       TEXT PRIMARY KEY,
      customer_key_id          TEXT NOT NULL,
      gl_number                TEXT NOT NULL,
      gl_name                  TEXT NOT NULL,
      pl_section               TEXT,
      budget_category          TEXT,
      budget_category_custom   TEXT,
      order_index              INTEGER NOT NULL DEFAULT 0,
      orphan                   INTEGER NOT NULL DEFAULT 0,
      created_at               TEXT NOT NULL,
      updated_at               TEXT NOT NULL,
      FOREIGN KEY (customer_key_id) REFERENCES customer_keys(id) ON DELETE CASCADE,
      UNIQUE (customer_key_id, gl_number)
    );

    CREATE INDEX IF NOT EXISTS idx_gl_accounts_key_id ON gl_accounts(customer_key_id);

    -- Tracks Financial Structure status (editing | completed).
    CREATE TABLE IF NOT EXISTS financial_structure_state (
      customer_key_id  TEXT PRIMARY KEY,
      status           TEXT NOT NULL DEFAULT 'editing',
      updated_at       TEXT NOT NULL,
      FOREIGN KEY (customer_key_id) REFERENCES customer_keys(id) ON DELETE CASCADE
    );
  `);

  // Migrations — add new columns to existing tables
  try {
    database.exec(`ALTER TABLE content_items ADD COLUMN qa_history TEXT NOT NULL DEFAULT '[]'`);
  } catch { /* already exists */ }
  try {
    database.exec(`ALTER TABLE linkedin_accounts ADD COLUMN person_urn TEXT NOT NULL DEFAULT ''`);
  } catch { /* already exists */ }

  // Seed the VV-TEST123 customer key (idempotent)
  try {
    database
      .prepare(
        `INSERT OR IGNORE INTO customer_keys (id, key, customer_name, created_at, created_by, revoked)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .run('seed-test-key-001', 'VV-TEST123', 'Test Customer', new Date().toISOString(), 'seed');
  } catch (err) {
    console.warn('[DB] Failed to seed test customer key:', err);
  }

  console.log('[DB] Schema initialized successfully');
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
