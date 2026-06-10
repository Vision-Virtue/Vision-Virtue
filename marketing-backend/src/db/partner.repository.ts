/* ============================================================
   Partner Customer Area — DB Repository
   Tables: customer_keys, partner_submissions
   ============================================================ */

import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
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

/** Random {PREFIX}-XXXXXX key (6 chars, A-Z+0-9, unambiguous).
 *  Uses crypto.randomBytes for a cryptographically secure source.
 *  Default prefix 'VV' = customer key. 'IV' is used for investor keys. */
function generateKey(prefix: string = 'VV'): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip ambiguous chars (I,O,0,1)
  const len = alphabet.length; // 32
  let s = '';
  // Rejection-sampling: draw bytes until we fill 6 unbiased chars.
  while (s.length < 6) {
    const buf = randomBytes(12);
    for (let i = 0; i < buf.length && s.length < 6; i++) {
      // Only use bytes below the largest multiple of `len` that fits in a byte,
      // so each position in the alphabet is equally likely.
      const cutoff = 256 - (256 % len); // = 256 - (256 % 32) = 256 (no rejection needed for power-of-2)
      if (buf[i] < cutoff) s += alphabet[buf[i] % len];
    }
  }
  return `${prefix}-${s}`;
}

// ─── Investor Keys ────────────────────────────────────────────────────────────

export interface InvestorKeyRow {
  id: string;
  key: string;
  investor_name: string;
  created_at: string;
  created_by: string;
  revoked: number; // 0 | 1
}

export const investorKeyRepo = {
  findByKey(key: string): InvestorKeyRow | null {
    const row = getDb()
      .prepare('SELECT * FROM investor_keys WHERE key = ?')
      .get(key) as InvestorKeyRow | undefined;
    if (!row || row.revoked === 1) return null;
    return row;
  },

  findById(id: string): InvestorKeyRow | null {
    const row = getDb()
      .prepare('SELECT * FROM investor_keys WHERE id = ?')
      .get(id) as InvestorKeyRow | undefined;
    return row ?? null;
  },

  create(input: { investorName: string; createdBy?: string; key?: string }): InvestorKeyRow {
    const id = uuidv4();
    const key = input.key || generateKey('IV');
    const createdAt = new Date().toISOString();
    const createdBy = input.createdBy || 'admin';
    getDb()
      .prepare(
        `INSERT INTO investor_keys (id, key, investor_name, created_at, created_by, revoked)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .run(id, key, input.investorName, createdAt, createdBy);
    return this.findById(id) as InvestorKeyRow;
  },

  list(): InvestorKeyRow[] {
    return getDb()
      .prepare('SELECT * FROM investor_keys ORDER BY created_at DESC')
      .all() as InvestorKeyRow[];
  },

  revoke(id: string): void {
    getDb().prepare('UPDATE investor_keys SET revoked = 1 WHERE id = ?').run(id);
  },
};

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

  /** Set the generated xlsx file path on a submission (called on submit). */
  setXlsxPath(id: string, xlsxPath: string): PartnerSubmission | null {
    getDb()
      .prepare('UPDATE partner_submissions SET finalized_xlsx_path = ? WHERE id = ?')
      .run(xlsxPath, id);
    return this.getById(id);
  },

  /** Flip status to 'finalized' without re-generating the xlsx. */
  markFinalized(id: string, notes?: string | null): PartnerSubmission | null {
    getDb()
      .prepare(
        `UPDATE partner_submissions
           SET status = 'finalized', finalized_at = ?, notes = COALESCE(?, notes)
           WHERE id = ?`,
      )
      .run(new Date().toISOString(), notes ?? null, id);
    return this.getById(id);
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

  /**
   * Replace form_data on an existing submission and reset its workflow
   * status to 'review' so the admin re-finalizes (the old finalized
   * xlsx/pptx stay on disk for reference but are no longer customer-
   * downloadable because the customer-side gates check status). Used by
   * the customer Edit flow.
   */
  updateFormData(id: string, formData: unknown): PartnerSubmission | null {
    getDb()
      .prepare(
        `UPDATE partner_submissions
           SET form_data = ?, status = 'review', finalized_at = NULL
           WHERE id = ?`,
      )
      .run(JSON.stringify(formData), id);
    return this.getById(id);
  },

  /**
   * Flip a finalized submission back to 'review' without touching form_data
   * or the stored xlsx/pptx — used by the admin Finance AI Edit action so a
   * correction can be made before re-finalizing.
   */
  unfinalize(id: string): PartnerSubmission | null {
    getDb()
      .prepare(
        `UPDATE partner_submissions
           SET status = 'review', finalized_at = NULL
           WHERE id = ?`,
      )
      .run(id);
    return this.getById(id);
  },
};
