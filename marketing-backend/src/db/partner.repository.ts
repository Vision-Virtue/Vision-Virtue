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

  /** Hard-delete a customer key and cascade through every dependent table
   *  (submissions, listings, NDAs, GL accounts, budgets, etc.) via FK
   *  ON DELETE CASCADE. Used by the Finance AI trash-row action. */
  delete(id: string): void {
    getDb().prepare('DELETE FROM customer_keys WHERE id = ?').run(id);
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

  /** Hard-delete an investor key. Cascades to nda_signatures via the FK. */
  delete(id: string): void {
    getDb().prepare('DELETE FROM investor_keys WHERE id = ?').run(id);
  },
};

// ─── Investors Marketplace — Listings ─────────────────────────────────────────

export interface MarketplaceListingKpis {
  gmPctY1?: number | string;
  gmPctY5?: number | string;
  arrY1?: number | string;
  arrY5?: number | string;
  topLineY1?: number | string;
  topLineY5?: number | string;
  ebitdaY5?: number | string;
  nrr?: number | string;
}

export interface MarketplaceListingRow {
  id: string;
  submission_id: string;
  customer_key_id: string;
  customer_name: string;
  logo_path: string | null;
  description: string;
  sector: string;
  ask_amount_text: string;
  kpis: string; // JSON
  deck_pdf_path: string | null;
  published_at: string;
  withdrawn_at: string | null;
  status: 'active' | 'withdrawn';
}

export interface MarketplaceListing {
  id: string;
  submissionId: string;
  customerKeyId: string;
  customerName: string;
  logoPath: string | null;
  description: string;
  sector: string;
  askAmountText: string;
  kpis: MarketplaceListingKpis;
  deckPdfPath: string | null;
  publishedAt: string;
  withdrawnAt: string | null;
  status: 'active' | 'withdrawn';
}

function rowToListing(row: MarketplaceListingRow): MarketplaceListing {
  let kpis: MarketplaceListingKpis = {};
  try { kpis = JSON.parse(row.kpis); } catch { kpis = {}; }
  return {
    id: row.id,
    submissionId: row.submission_id,
    customerKeyId: row.customer_key_id,
    customerName: row.customer_name,
    logoPath: row.logo_path,
    description: row.description,
    sector: row.sector,
    askAmountText: row.ask_amount_text,
    kpis,
    deckPdfPath: row.deck_pdf_path,
    publishedAt: row.published_at,
    withdrawnAt: row.withdrawn_at,
    status: row.status,
  };
}

export interface UpsertListingInput {
  submissionId: string;
  customerKeyId: string;
  customerName: string;
  logoPath?: string | null;
  description?: string;
  sector?: string;
  askAmountText?: string;
  kpis?: MarketplaceListingKpis;
}

export const marketplaceListingRepo = {
  findById(id: string): MarketplaceListing | null {
    const row = getDb()
      .prepare('SELECT * FROM marketplace_listings WHERE id = ?')
      .get(id) as MarketplaceListingRow | undefined;
    return row ? rowToListing(row) : null;
  },

  findBySubmissionId(submissionId: string): MarketplaceListing | null {
    const row = getDb()
      .prepare('SELECT * FROM marketplace_listings WHERE submission_id = ?')
      .get(submissionId) as MarketplaceListingRow | undefined;
    return row ? rowToListing(row) : null;
  },

  /**
   * Publish (insert) or republish (update + reactivate) a listing for the
   * given submission. One submission can only ever have one listing row.
   */
  upsert(input: UpsertListingInput): MarketplaceListing {
    const now = new Date().toISOString();
    const kpisJson = JSON.stringify(input.kpis ?? {});
    const existing = this.findBySubmissionId(input.submissionId);
    if (existing) {
      getDb()
        .prepare(
          `UPDATE marketplace_listings
             SET customer_name = ?, logo_path = ?, description = ?, sector = ?,
                 ask_amount_text = ?, kpis = ?,
                 published_at = ?, withdrawn_at = NULL, status = 'active'
             WHERE id = ?`,
        )
        .run(
          input.customerName,
          input.logoPath ?? null,
          input.description ?? '',
          input.sector ?? 'Other',
          input.askAmountText ?? '',
          kpisJson,
          now,
          existing.id,
        );
      return this.findById(existing.id) as MarketplaceListing;
    }
    const id = uuidv4();
    getDb()
      .prepare(
        `INSERT INTO marketplace_listings
           (id, submission_id, customer_key_id, customer_name, logo_path, description,
            sector, ask_amount_text, kpis, published_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      )
      .run(
        id,
        input.submissionId,
        input.customerKeyId,
        input.customerName,
        input.logoPath ?? null,
        input.description ?? '',
        input.sector ?? 'Other',
        input.askAmountText ?? '',
        kpisJson,
        now,
      );
    return this.findById(id) as MarketplaceListing;
  },

  /** Mark a listing as withdrawn (Pull submission). Reversible by re-publishing. */
  withdraw(id: string): MarketplaceListing | null {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE marketplace_listings
           SET status = 'withdrawn', withdrawn_at = ?
           WHERE id = ?`,
      )
      .run(now, id);
    return this.findById(id);
  },

  /** All active listings, newest first (investor-facing view). */
  listActive(): MarketplaceListing[] {
    const rows = getDb()
      .prepare(
        "SELECT * FROM marketplace_listings WHERE status = 'active' ORDER BY published_at DESC",
      )
      .all() as MarketplaceListingRow[];
    return rows.map(rowToListing);
  },

  /** All listings (active + withdrawn) for a given customer key. */
  listByCustomerKey(customerKeyId: string): MarketplaceListing[] {
    const rows = getDb()
      .prepare(
        'SELECT * FROM marketplace_listings WHERE customer_key_id = ? ORDER BY published_at DESC',
      )
      .all(customerKeyId) as MarketplaceListingRow[];
    return rows.map(rowToListing);
  },

  /** Attach the customer's uploaded view-only deck PDF to a listing. */
  setDeckPdfPath(id: string, pdfPath: string | null): MarketplaceListing | null {
    getDb()
      .prepare('UPDATE marketplace_listings SET deck_pdf_path = ? WHERE id = ?')
      .run(pdfPath, id);
    return this.findById(id);
  },
};

// ─── NDA Signatures ───────────────────────────────────────────────────────────

export interface NdaSignatureRow {
  id: string;
  investor_key_id: string;
  investor_name: string;
  listing_id: string;
  customer_name: string;
  full_name: string;
  fund_name: string;
  title: string;
  business_email: string;
  sign_date: string;
  signature_type: 'typed' | 'drawn';
  signature_value: string;
  signed_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface NdaSignature {
  id: string;
  investorKeyId: string;
  investorName: string;
  listingId: string;
  customerName: string;
  fullName: string;
  fundName: string;
  title: string;
  businessEmail: string;
  signDate: string;
  signatureType: 'typed' | 'drawn';
  signatureValue: string;
  signedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

function rowToNda(row: NdaSignatureRow): NdaSignature {
  return {
    id: row.id,
    investorKeyId: row.investor_key_id,
    investorName: row.investor_name,
    listingId: row.listing_id,
    customerName: row.customer_name,
    fullName: row.full_name,
    fundName: row.fund_name,
    title: row.title,
    businessEmail: row.business_email,
    signDate: row.sign_date,
    signatureType: row.signature_type,
    signatureValue: row.signature_value,
    signedAt: row.signed_at,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
  };
}

export interface CreateNdaInput {
  investorKeyId: string;
  investorName: string;
  listingId: string;
  customerName: string;
  fullName: string;
  fundName: string;
  title: string;
  businessEmail: string;
  signDate: string;
  signatureType: 'typed' | 'drawn';
  signatureValue: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const ndaSignatureRepo = {
  findById(id: string): NdaSignature | null {
    const row = getDb()
      .prepare('SELECT * FROM nda_signatures WHERE id = ?')
      .get(id) as NdaSignatureRow | undefined;
    return row ? rowToNda(row) : null;
  },

  findByInvestorAndListing(investorKeyId: string, listingId: string): NdaSignature | null {
    const row = getDb()
      .prepare('SELECT * FROM nda_signatures WHERE investor_key_id = ? AND listing_id = ?')
      .get(investorKeyId, listingId) as NdaSignatureRow | undefined;
    return row ? rowToNda(row) : null;
  },

  /** Upsert — a (investor, listing) pair has at most one signature. */
  create(input: CreateNdaInput): NdaSignature {
    const existing = this.findByInvestorAndListing(input.investorKeyId, input.listingId);
    const signedAt = new Date().toISOString();
    if (existing) {
      getDb()
        .prepare(
          `UPDATE nda_signatures
             SET investor_name = ?, customer_name = ?, full_name = ?, fund_name = ?,
                 title = ?, business_email = ?, sign_date = ?,
                 signature_type = ?, signature_value = ?, signed_at = ?,
                 ip_address = ?, user_agent = ?
             WHERE id = ?`,
        )
        .run(
          input.investorName, input.customerName, input.fullName, input.fundName,
          input.title, input.businessEmail, input.signDate,
          input.signatureType, input.signatureValue, signedAt,
          input.ipAddress ?? null, input.userAgent ?? null,
          existing.id,
        );
      return this.findById(existing.id) as NdaSignature;
    }
    const id = uuidv4();
    getDb()
      .prepare(
        `INSERT INTO nda_signatures
           (id, investor_key_id, investor_name, listing_id, customer_name,
            full_name, fund_name, title, business_email, sign_date,
            signature_type, signature_value, signed_at, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, input.investorKeyId, input.investorName, input.listingId, input.customerName,
        input.fullName, input.fundName, input.title, input.businessEmail, input.signDate,
        input.signatureType, input.signatureValue, signedAt,
        input.ipAddress ?? null, input.userAgent ?? null,
      );
    return this.findById(id) as NdaSignature;
  },

  /** All signatures (newest first) — admin view drives the Agreements tile. */
  listAll(): NdaSignature[] {
    const rows = getDb()
      .prepare('SELECT * FROM nda_signatures ORDER BY signed_at DESC')
      .all() as NdaSignatureRow[];
    return rows.map(rowToNda);
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM nda_signatures WHERE id = ?').run(id);
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
