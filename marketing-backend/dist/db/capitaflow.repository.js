"use strict";
/* ============================================================
   CapitaFlow Customer Area — DB Repository
   Tables: customer_keys, capitaflow_submissions
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.capitaflowSubmissionRepo = exports.ndaSignatureRepo = exports.marketplaceListingRepo = exports.investorKeyRepo = exports.customerKeyRepo = void 0;
const uuid_1 = require("uuid");
const crypto_1 = require("crypto");
const database_1 = require("./database");
// ─── Customer Keys ────────────────────────────────────────────────────────────
exports.customerKeyRepo = {
    /** Look up an active (non-revoked) key. Returns null if missing or revoked.
     *  Pass `offering` to require the key was minted for that specific offering;
     *  omit it for endpoints that need to accept either (legacy / admin paths). */
    findByKey(key, offering) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM customer_keys WHERE key = ?')
            .get(key);
        if (!row || row.revoked === 1)
            return null;
        if (offering && row.offering !== offering)
            return null;
        return row;
    },
    findById(id) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM customer_keys WHERE id = ?')
            .get(id);
        return row ?? null;
    },
    /** Create a new key with a generated VV-XXXX value, scoped to one offering. */
    create(input) {
        const id = (0, uuid_1.v4)();
        const key = input.key || generateKey();
        const createdAt = new Date().toISOString();
        const createdBy = input.createdBy || 'admin';
        (0, database_1.getDb)()
            .prepare(`INSERT INTO customer_keys (id, key, customer_name, offering, created_at, created_by, revoked)
         VALUES (?, ?, ?, ?, ?, ?, 0)`)
            .run(id, key, input.customerName, input.offering, createdAt, createdBy);
        return this.findById(id);
    },
    list() {
        return (0, database_1.getDb)()
            .prepare('SELECT * FROM customer_keys ORDER BY created_at DESC')
            .all();
    },
    revoke(id) {
        (0, database_1.getDb)().prepare('UPDATE customer_keys SET revoked = 1 WHERE id = ?').run(id);
    },
    /** Hard-delete a customer key and cascade through every dependent table
     *  (submissions, listings, NDAs, GL accounts, budgets, etc.) via FK
     *  ON DELETE CASCADE. Used by the Finance AI trash-row action. */
    delete(id) {
        (0, database_1.getDb)().prepare('DELETE FROM customer_keys WHERE id = ?').run(id);
    },
};
/** Random {PREFIX}-XXXXXX key (6 chars, A-Z+0-9, unambiguous).
 *  Uses crypto.randomBytes for a cryptographically secure source.
 *  Default prefix 'VV' = customer key. 'IV' is used for investor keys. */
function generateKey(prefix = 'VV') {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip ambiguous chars (I,O,0,1)
    const len = alphabet.length; // 32
    let s = '';
    // Rejection-sampling: draw bytes until we fill 6 unbiased chars.
    while (s.length < 6) {
        const buf = (0, crypto_1.randomBytes)(12);
        for (let i = 0; i < buf.length && s.length < 6; i++) {
            // Only use bytes below the largest multiple of `len` that fits in a byte,
            // so each position in the alphabet is equally likely.
            const cutoff = 256 - (256 % len); // = 256 - (256 % 32) = 256 (no rejection needed for power-of-2)
            if (buf[i] < cutoff)
                s += alphabet[buf[i] % len];
        }
    }
    return `${prefix}-${s}`;
}
exports.investorKeyRepo = {
    findByKey(key) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM investor_keys WHERE key = ?')
            .get(key);
        if (!row || row.revoked === 1)
            return null;
        return row;
    },
    findById(id) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM investor_keys WHERE id = ?')
            .get(id);
        return row ?? null;
    },
    create(input) {
        const id = (0, uuid_1.v4)();
        const key = input.key || generateKey('IV');
        const createdAt = new Date().toISOString();
        const createdBy = input.createdBy || 'admin';
        (0, database_1.getDb)()
            .prepare(`INSERT INTO investor_keys (id, key, investor_name, created_at, created_by, revoked)
         VALUES (?, ?, ?, ?, ?, 0)`)
            .run(id, key, input.investorName, createdAt, createdBy);
        return this.findById(id);
    },
    list() {
        return (0, database_1.getDb)()
            .prepare('SELECT * FROM investor_keys ORDER BY created_at DESC')
            .all();
    },
    revoke(id) {
        (0, database_1.getDb)().prepare('UPDATE investor_keys SET revoked = 1 WHERE id = ?').run(id);
    },
    /** Hard-delete an investor key. Cascades to nda_signatures via the FK. */
    delete(id) {
        (0, database_1.getDb)().prepare('DELETE FROM investor_keys WHERE id = ?').run(id);
    },
};
function rowToListing(row) {
    let kpis = {};
    try {
        kpis = JSON.parse(row.kpis);
    }
    catch {
        kpis = {};
    }
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
exports.marketplaceListingRepo = {
    findById(id) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM marketplace_listings WHERE id = ?')
            .get(id);
        return row ? rowToListing(row) : null;
    },
    findBySubmissionId(submissionId) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM marketplace_listings WHERE submission_id = ?')
            .get(submissionId);
        return row ? rowToListing(row) : null;
    },
    /**
     * Publish (insert) or republish (update + reactivate) a listing for the
     * given submission. One submission can only ever have one listing row.
     */
    upsert(input) {
        const now = new Date().toISOString();
        const kpisJson = JSON.stringify(input.kpis ?? {});
        const existing = this.findBySubmissionId(input.submissionId);
        if (existing) {
            (0, database_1.getDb)()
                .prepare(`UPDATE marketplace_listings
             SET customer_name = ?, logo_path = ?, description = ?, sector = ?,
                 ask_amount_text = ?, kpis = ?,
                 published_at = ?, withdrawn_at = NULL, status = 'active'
             WHERE id = ?`)
                .run(input.customerName, input.logoPath ?? null, input.description ?? '', input.sector ?? 'Other', input.askAmountText ?? '', kpisJson, now, existing.id);
            return this.findById(existing.id);
        }
        const id = (0, uuid_1.v4)();
        (0, database_1.getDb)()
            .prepare(`INSERT INTO marketplace_listings
           (id, submission_id, customer_key_id, customer_name, logo_path, description,
            sector, ask_amount_text, kpis, published_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`)
            .run(id, input.submissionId, input.customerKeyId, input.customerName, input.logoPath ?? null, input.description ?? '', input.sector ?? 'Other', input.askAmountText ?? '', kpisJson, now);
        return this.findById(id);
    },
    /** Mark a listing as withdrawn (Pull submission). Reversible by re-publishing. */
    withdraw(id) {
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`UPDATE marketplace_listings
           SET status = 'withdrawn', withdrawn_at = ?
           WHERE id = ?`)
            .run(now, id);
        return this.findById(id);
    },
    /** All active listings, newest first (investor-facing view). */
    listActive() {
        const rows = (0, database_1.getDb)()
            .prepare("SELECT * FROM marketplace_listings WHERE status = 'active' ORDER BY published_at DESC")
            .all();
        return rows.map(rowToListing);
    },
    /** All listings (active + withdrawn) for a given customer key. */
    listByCustomerKey(customerKeyId) {
        const rows = (0, database_1.getDb)()
            .prepare('SELECT * FROM marketplace_listings WHERE customer_key_id = ? ORDER BY published_at DESC')
            .all(customerKeyId);
        return rows.map(rowToListing);
    },
    /** Attach the customer's uploaded view-only deck PDF to a listing. */
    setDeckPdfPath(id, pdfPath) {
        (0, database_1.getDb)()
            .prepare('UPDATE marketplace_listings SET deck_pdf_path = ? WHERE id = ?')
            .run(pdfPath, id);
        return this.findById(id);
    },
};
function rowToNda(row) {
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
exports.ndaSignatureRepo = {
    findById(id) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM nda_signatures WHERE id = ?')
            .get(id);
        return row ? rowToNda(row) : null;
    },
    findByInvestorAndListing(investorKeyId, listingId) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM nda_signatures WHERE investor_key_id = ? AND listing_id = ?')
            .get(investorKeyId, listingId);
        return row ? rowToNda(row) : null;
    },
    /** Upsert — a (investor, listing) pair has at most one signature. */
    create(input) {
        const existing = this.findByInvestorAndListing(input.investorKeyId, input.listingId);
        const signedAt = new Date().toISOString();
        if (existing) {
            (0, database_1.getDb)()
                .prepare(`UPDATE nda_signatures
             SET investor_name = ?, customer_name = ?, full_name = ?, fund_name = ?,
                 title = ?, business_email = ?, sign_date = ?,
                 signature_type = ?, signature_value = ?, signed_at = ?,
                 ip_address = ?, user_agent = ?
             WHERE id = ?`)
                .run(input.investorName, input.customerName, input.fullName, input.fundName, input.title, input.businessEmail, input.signDate, input.signatureType, input.signatureValue, signedAt, input.ipAddress ?? null, input.userAgent ?? null, existing.id);
            return this.findById(existing.id);
        }
        const id = (0, uuid_1.v4)();
        (0, database_1.getDb)()
            .prepare(`INSERT INTO nda_signatures
           (id, investor_key_id, investor_name, listing_id, customer_name,
            full_name, fund_name, title, business_email, sign_date,
            signature_type, signature_value, signed_at, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, input.investorKeyId, input.investorName, input.listingId, input.customerName, input.fullName, input.fundName, input.title, input.businessEmail, input.signDate, input.signatureType, input.signatureValue, signedAt, input.ipAddress ?? null, input.userAgent ?? null);
        return this.findById(id);
    },
    /** All signatures (newest first) — admin view drives the Agreements tile. */
    listAll() {
        const rows = (0, database_1.getDb)()
            .prepare('SELECT * FROM nda_signatures ORDER BY signed_at DESC')
            .all();
        return rows.map(rowToNda);
    },
    delete(id) {
        (0, database_1.getDb)().prepare('DELETE FROM nda_signatures WHERE id = ?').run(id);
    },
};
// ─── CapitaFlow Submissions ──────────────────────────────────────────────────────
function rowToSubmission(row) {
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
function safeJson(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return null;
    }
}
exports.capitaflowSubmissionRepo = {
    create(input) {
        const id = (0, uuid_1.v4)();
        const submittedAt = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`INSERT INTO capitaflow_submissions
           (id, customer_key_id, customer_name, form_data, status, submitted_at)
         VALUES (?, ?, ?, ?, 'review', ?)`)
            .run(id, input.customerKeyId, input.customerName, JSON.stringify(input.formData), submittedAt);
        return this.getById(id);
    },
    getById(id) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM capitaflow_submissions WHERE id = ?')
            .get(id);
        return row ? rowToSubmission(row) : null;
    },
    /** Submissions belonging to a specific customer key, newest first. */
    listByCustomerKeyId(customerKeyId) {
        const rows = (0, database_1.getDb)()
            .prepare('SELECT * FROM capitaflow_submissions WHERE customer_key_id = ? ORDER BY submitted_at DESC')
            .all(customerKeyId);
        return rows.map(rowToSubmission);
    },
    /** Every submission, newest first (admin view). */
    listAll() {
        const rows = (0, database_1.getDb)()
            .prepare('SELECT * FROM capitaflow_submissions ORDER BY submitted_at DESC')
            .all();
        return rows.map(rowToSubmission);
    },
    /** Count submissions in 'review' status (drives the notification badge). */
    countPending() {
        const row = (0, database_1.getDb)()
            .prepare("SELECT COUNT(*) as c FROM capitaflow_submissions WHERE status = 'review'")
            .get();
        return row.c;
    },
    /** Set the generated xlsx file path on a submission (called on submit). */
    setXlsxPath(id, xlsxPath) {
        (0, database_1.getDb)()
            .prepare('UPDATE capitaflow_submissions SET finalized_xlsx_path = ? WHERE id = ?')
            .run(xlsxPath, id);
        return this.getById(id);
    },
    /** Flip status to 'finalized' without re-generating the xlsx. */
    markFinalized(id, notes) {
        (0, database_1.getDb)()
            .prepare(`UPDATE capitaflow_submissions
           SET status = 'finalized', finalized_at = ?, notes = COALESCE(?, notes)
           WHERE id = ?`)
            .run(new Date().toISOString(), notes ?? null, id);
        return this.getById(id);
    },
    finalize(id, xlsxPath, notes) {
        (0, database_1.getDb)()
            .prepare(`UPDATE capitaflow_submissions
           SET status = 'finalized', finalized_at = ?, finalized_xlsx_path = ?, notes = COALESCE(?, notes)
           WHERE id = ?`)
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
    updateFormData(id, formData) {
        (0, database_1.getDb)()
            .prepare(`UPDATE capitaflow_submissions
           SET form_data = ?, status = 'review', finalized_at = NULL
           WHERE id = ?`)
            .run(JSON.stringify(formData), id);
        return this.getById(id);
    },
    /**
     * Flip a finalized submission back to 'review' without touching form_data
     * or the stored xlsx/pptx — used by the admin Finance AI Edit action so a
     * correction can be made before re-finalizing.
     */
    unfinalize(id) {
        (0, database_1.getDb)()
            .prepare(`UPDATE capitaflow_submissions
           SET status = 'review', finalized_at = NULL
           WHERE id = ?`)
            .run(id);
        return this.getById(id);
    },
};
