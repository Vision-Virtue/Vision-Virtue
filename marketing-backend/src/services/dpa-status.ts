/* ============================================================
   DPA status tracking — both the Anthropic-side DPA (sub-processor)
   and per-customer DPAs.

   Why this exists: the only two security items that cannot be
   automated are (a) Raphael submitting the request to Anthropic
   and (b) Raphael sending the customer DPA. We can't *do* them
   for him — but we can make them impossible to forget by
   surfacing the outstanding-status in the security self-test
   and admin dashboard.

   No external dependencies. Plain SQLite row.
   ============================================================ */

import { getDb } from '../db/database';
import { randomBytes } from 'crypto';

let _tableEnsured = false;
function ensureTable(): void {
  if (_tableEnsured) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS dpa_status (
      id              TEXT PRIMARY KEY,
      kind            TEXT NOT NULL,        -- 'anthropic' | 'customer'
      customer_name   TEXT,                  -- null for 'anthropic'
      status          TEXT NOT NULL,        -- 'pending' | 'submitted' | 'signed' | 'zdr_enabled'
      submitted_at    TEXT,
      signed_at       TEXT,
      notes           TEXT,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dpa_kind ON dpa_status(kind);
  `);
  // Seed the Anthropic row if missing
  const existing = db.prepare(`SELECT id FROM dpa_status WHERE kind = 'anthropic' LIMIT 1`).get() as { id?: string } | undefined;
  if (!existing) {
    db.prepare(`INSERT INTO dpa_status (id, kind, status, updated_at) VALUES (?, 'anthropic', 'pending', ?)`)
      .run(randomBytes(8).toString('hex'), new Date().toISOString());
  }
  _tableEnsured = true;
}

export interface DpaRow {
  id: string;
  kind: 'anthropic' | 'customer';
  customer_name: string | null;
  status: 'pending' | 'submitted' | 'signed' | 'zdr_enabled';
  submitted_at: string | null;
  signed_at: string | null;
  notes: string | null;
  updated_at: string;
}

/** Returns the Anthropic-side DPA status (singleton row). */
export function getAnthropicStatus(): DpaRow {
  ensureTable();
  return getDb().prepare(`SELECT * FROM dpa_status WHERE kind = 'anthropic'`).get() as DpaRow;
}

/** Returns all customer DPAs (sorted by most recently updated). */
export function listCustomerDpas(): DpaRow[] {
  ensureTable();
  return getDb()
    .prepare(`SELECT * FROM dpa_status WHERE kind = 'customer' ORDER BY updated_at DESC`)
    .all() as DpaRow[];
}

/** Update an Anthropic DPA milestone. */
export function setAnthropicStatus(input: {
  status: 'pending' | 'submitted' | 'signed' | 'zdr_enabled';
  submittedAt?: string;
  signedAt?: string;
  notes?: string;
}): DpaRow {
  ensureTable();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE dpa_status
       SET status = ?, submitted_at = COALESCE(?, submitted_at), signed_at = COALESCE(?, signed_at),
           notes = COALESCE(?, notes), updated_at = ?
     WHERE kind = 'anthropic'
  `).run(input.status, input.submittedAt ?? null, input.signedAt ?? null, input.notes ?? null, now);
  return getAnthropicStatus();
}

/** Upsert a per-customer DPA row. */
export function upsertCustomerDpa(input: {
  customer: string;
  status: 'pending' | 'submitted' | 'signed';
  submittedAt?: string;
  signedAt?: string;
  notes?: string;
}): DpaRow {
  ensureTable();
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT id FROM dpa_status WHERE kind = 'customer' AND customer_name = ?`)
    .get(input.customer) as { id?: string } | undefined;
  if (existing?.id) {
    db.prepare(`
      UPDATE dpa_status
         SET status = ?, submitted_at = COALESCE(?, submitted_at), signed_at = COALESCE(?, signed_at),
             notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?
    `).run(input.status, input.submittedAt ?? null, input.signedAt ?? null, input.notes ?? null, now, existing.id);
    return db.prepare(`SELECT * FROM dpa_status WHERE id = ?`).get(existing.id) as DpaRow;
  } else {
    const id = randomBytes(8).toString('hex');
    db.prepare(`
      INSERT INTO dpa_status (id, kind, customer_name, status, submitted_at, signed_at, notes, updated_at)
      VALUES (?, 'customer', ?, ?, ?, ?, ?, ?)
    `).run(id, input.customer, input.status, input.submittedAt ?? null, input.signedAt ?? null, input.notes ?? null, now);
    return db.prepare(`SELECT * FROM dpa_status WHERE id = ?`).get(id) as DpaRow;
  }
}

/** Convenience for the self-test: summary of outstanding (human-action-required) DPAs. */
export function listOutstandingDpas(): { anthropic: DpaRow; customers: DpaRow[] } {
  ensureTable();
  const anthropic = getAnthropicStatus();
  const customers = listCustomerDpas().filter(r => r.status !== 'signed');
  return { anthropic, customers };
}
