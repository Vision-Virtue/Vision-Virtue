"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.closeDb = closeDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
let db = null;
function getDb() {
    if (db)
        return db;
    const dbPath = process.env.DB_PATH || './data/marketing.db';
    const resolvedPath = path_1.default.resolve(dbPath);
    const dir = path_1.default.dirname(resolvedPath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    db = new better_sqlite3_1.default(resolvedPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    return db;
}
function initializeSchema(database) {
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
    }
    catch { /* already exists */ }
    try {
        database.exec(`ALTER TABLE linkedin_accounts ADD COLUMN person_urn TEXT NOT NULL DEFAULT ''`);
    }
    catch { /* already exists */ }
    console.log('[DB] Schema initialized successfully');
}
function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}
