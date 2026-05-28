"use strict";
/* ============================================================
   Partner Customer Area — DB Repository
   Tables: customer_keys, partner_submissions
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.partnerSubmissionRepo = exports.customerKeyRepo = void 0;
const uuid_1 = require("uuid");
const crypto_1 = require("crypto");
const database_1 = require("./database");
// ─── Customer Keys ────────────────────────────────────────────────────────────
exports.customerKeyRepo = {
    /** Look up an active (non-revoked) key. Returns null if missing or revoked. */
    findByKey(key) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM customer_keys WHERE key = ?')
            .get(key);
        if (!row || row.revoked === 1)
            return null;
        return row;
    },
    findById(id) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM customer_keys WHERE id = ?')
            .get(id);
        return row ?? null;
    },
    /** Create a new key with a generated VV-XXXX value. */
    create(input) {
        const id = (0, uuid_1.v4)();
        const key = input.key || generateKey();
        const createdAt = new Date().toISOString();
        const createdBy = input.createdBy || 'admin';
        (0, database_1.getDb)()
            .prepare(`INSERT INTO customer_keys (id, key, customer_name, created_at, created_by, revoked)
         VALUES (?, ?, ?, ?, ?, 0)`)
            .run(id, key, input.customerName, createdAt, createdBy);
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
};
/** Random VV-XXXXXX key (6 chars, A-Z+0-9, unambiguous).
 *  Uses crypto.randomBytes for a cryptographically secure source. */
function generateKey() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip ambiguous chars (I,O,0,1)
    const len = alphabet.length; // 32 — power of 2, so no rejection bias
    let s = '';
    while (s.length < 6) {
        const buf = (0, crypto_1.randomBytes)(12);
        for (let i = 0; i < buf.length && s.length < 6; i++) {
            // 256 % 32 === 0, so every byte maps to the alphabet without bias
            s += alphabet[buf[i] % len];
        }
    }
    return `VV-${s}`;
}
// ─── Partner Submissions ──────────────────────────────────────────────────────
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
exports.partnerSubmissionRepo = {
    create(input) {
        const id = (0, uuid_1.v4)();
        const submittedAt = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`INSERT INTO partner_submissions
           (id, customer_key_id, customer_name, form_data, status, submitted_at)
         VALUES (?, ?, ?, ?, 'review', ?)`)
            .run(id, input.customerKeyId, input.customerName, JSON.stringify(input.formData), submittedAt);
        return this.getById(id);
    },
    getById(id) {
        const row = (0, database_1.getDb)()
            .prepare('SELECT * FROM partner_submissions WHERE id = ?')
            .get(id);
        return row ? rowToSubmission(row) : null;
    },
    /** Submissions belonging to a specific customer key, newest first. */
    listByCustomerKeyId(customerKeyId) {
        const rows = (0, database_1.getDb)()
            .prepare('SELECT * FROM partner_submissions WHERE customer_key_id = ? ORDER BY submitted_at DESC')
            .all(customerKeyId);
        return rows.map(rowToSubmission);
    },
    /** Every submission, newest first (admin view). */
    listAll() {
        const rows = (0, database_1.getDb)()
            .prepare('SELECT * FROM partner_submissions ORDER BY submitted_at DESC')
            .all();
        return rows.map(rowToSubmission);
    },
    /** Count submissions in 'review' status (drives the notification badge). */
    countPending() {
        const row = (0, database_1.getDb)()
            .prepare("SELECT COUNT(*) as c FROM partner_submissions WHERE status = 'review'")
            .get();
        return row.c;
    },
    /** Set the generated xlsx file path on a submission (called on submit). */
    setXlsxPath(id, xlsxPath) {
        (0, database_1.getDb)()
            .prepare('UPDATE partner_submissions SET finalized_xlsx_path = ? WHERE id = ?')
            .run(xlsxPath, id);
        return this.getById(id);
    },
    /** Flip status to 'finalized' without re-generating the xlsx. */
    markFinalized(id, notes) {
        (0, database_1.getDb)()
            .prepare(`UPDATE partner_submissions
           SET status = 'finalized', finalized_at = ?, notes = COALESCE(?, notes)
           WHERE id = ?`)
            .run(new Date().toISOString(), notes ?? null, id);
        return this.getById(id);
    },
    finalize(id, xlsxPath, notes) {
        (0, database_1.getDb)()
            .prepare(`UPDATE partner_submissions
           SET status = 'finalized', finalized_at = ?, finalized_xlsx_path = ?, notes = COALESCE(?, notes)
           WHERE id = ?`)
            .run(new Date().toISOString(), xlsxPath, notes ?? null, id);
        return this.getById(id);
    },
};
