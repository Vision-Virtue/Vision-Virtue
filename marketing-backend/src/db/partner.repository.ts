/* ============================================================
   Partner Customer Area — DB Repository
   Tables: customer_keys, partner_submissions
   ============================================================ */

import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CustomerKeyRow {
  id: string;
  key: string;
  customer_name: string;
  created_at: string;
  created_by: string;
  revoked: number; // 0 | 1
}

export interface PartnerSubmissionRow {
  id: string;
  customer_key_id: string | null;
  customer_name: string;
  form_data: string; // JSON
  status: 'review' | 'finalized';
  submitted_at: string;
  finalized_at: string | null;
  finalized_xlsx_path: string | null;
  notes: string | null;
}

export interface PartnerSubmission {
  id: string;
  customerKeyId: string | null;
  customerName: string;
  formData: unknown;
  status: 'review' | 'finalized';
  submittedAt: string;
  finalizedAt: string | null;
  finalizedXlsxPath: string | null;
  notes: string | null;
}

// ─── Customer Keys ────────────────────────────────────────────────────────────

export const customerKeyRepo = {
  /** Look up an active (non-revoked) key. Returns null if missing or revoked. */
  findByKey(key: string): CustomerKeyRow | null {
    const row = getDb()
      .prepare('SELECT * FROM customer_keys WHERE key = ?')
      .get(key) as CustomerKeyRow | undefined;
    if (!row || row.revoked === 1) return null;
    return row;
  },

  findById(id: string): CustomerKeyRow | null {
    const row = getDb()
      .prepare('SELECT * FROM customer_keys WHERE id = ?')
      .get(id) as CustomerKeyRow | undefined;
    return row ?? null;
  },

  /** Create a new key with a generated VV-XXXX value. */
  create(input: { customerName: string; createdBy?: string; key?: string }): CustomerKeyRow {
    const id = uuidv4();
    const key = input.key || generateKey();
    const createdAt = new Date().toISOString();
    const createdBy = input.createdBy || 'admin';
    getDb()
      .prepare(
        `INSERT INTO customer_keys (id, key, customer_name, created_at, created_by, revoked)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .run(id, key, input.customerName, createdAt, createdBy);
    return this.findById(id) as CustomerKeyRow;
  },

  list(): CustomerKeyRow[] {
    return getDb()
      .prepare('SELECT * FROM customer_keys ORDER BY created_at DESC')
      .all() as CustomerKeyRow[];
  },

  revoke(id: string): void {
    getDb().prepare('UPDATE customer_keys SET revoked = 1 WHERE id = ?').run(id);
  },
};

/** Random VV-XXXXXX key (6 chars, A-Z+0-9, unambiguous). */
function generateKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip ambiguous chars (I,O,0,1)
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `VV-${s}`;
}

// ─── Partner Submissions ──────────────────────────────────────────────────────

function rowToSubmission(row: PartnerSubmissionRow): PartnerSubmission {
  return {
    id: row.id,
    customerKeyId: row.customer_key_id,
    customerName: row.customer_name,
    formData: safeJson(row.form_data),
    status: row.status,
    submittedAt: row.submitted_at,
    finalizedAt: row.finalized_at,
    finalizedXlsxPath: row.finalized_xlsx_path,
    notes: row.notes,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export const partnerSubmissionRepo = {
  create(input: {
    customerKeyId: string | null;
    customerName: string;
    formData: unknown;
  }): PartnerSubmission {
    const id = uuidv4();
    const submittedAt = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO partner_submissions
           (id, customer_key_id, customer_name, form_data, status, submitted_at)
         VALUES (?, ?, ?, ?, 'review', ?)`,
      )
      .run(id, input.customerKeyId, input.customerName, JSON.stringify(input.formData), submittedAt);
    return this.getById(id) as PartnerSubmission;
  },

  getById(id: string): PartnerSubmission | null {
    const row = getDb()
      .prepare('SELECT * FROM partner_submissions WHERE id = ?')
      .get(id) as PartnerSubmissionRow | undefined;
    return row ? rowToSubmission(row) : null;
  },

  /** Submissions belonging to a specific customer key, newest first. */
  listByCustomerKeyId(customerKeyId: string): PartnerSubmission[] {
    const rows = getDb()
      .prepare(
        'SELECT * FROM partner_submissions WHERE customer_key_id = ? ORDER BY submitted_at DESC',
      )
      .all(customerKeyId) as PartnerSubmissionRow[];
    return rows.map(rowToSubmission);
  },

  /** Every submission, newest first (admin view). */
  listAll(): PartnerSubmission[] {
    const rows = getDb()
      .prepare('SELECT * FROM partner_submissions ORDER BY submitted_at DESC')
      .all() as PartnerSubmissionRow[];
    return rows.map(rowToSubmission);
  },

  /** Count submissions in 'review' status (drives the notification badge). */
  countPending(): number {
    const row = getDb()
      .prepare("SELECT COUNT(*) as c FROM partner_submissions WHERE status = 'review'")
      .get() as { c: number };
    return row.c;
  },

  finalize(id: string, xlsxPath: string, notes?: string | null): PartnerSubmission | null {
    getDb()
      .prepare(
        `UPDATE partner_submissions
           SET status = 'finalized', finalized_at = ?, finalized_xlsx_path = ?, notes = COALESCE(?, notes)
           WHERE id = ?`,
      )
      .run(new Date().toISOString(), xlsxPath, notes ?? null, id);
    return this.getById(id);
  },
};
