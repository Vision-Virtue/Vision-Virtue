/* ============================================================
   Partner Customer Area — Controller
   Customer-facing endpoints (key auth, questionnaire submission,
   status). Admin (Raphael) endpoints will live in a follow-up
   commit alongside xlsx generation.
   ============================================================ */

import { Request, Response } from 'express';
import { customerKeyRepo, partnerSubmissionRepo, CustomerKeyRow } from '../db/partner.repository';
import { z } from 'zod';

// ─── Request validation schemas ──────────────────────────────────────────────

const AuthBody = z.object({
  key: z.string().trim().min(1).max(64),
});

const SubmissionBody = z.object({
  customerName: z.string().trim().min(1).max(200),
  formData: z.unknown(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the customer key from the X-Customer-Key header. Returns the row
 * if valid, or null if missing/invalid/revoked.
 */
function resolveCustomerKey(req: Request): CustomerKeyRow | null {
  const headerKey = req.header('x-customer-key');
  if (!headerKey) return null;
  return customerKeyRepo.findByKey(headerKey.trim());
}

function send401(res: Response, message: string): void {
  res.status(401).json({
    error: { code: 'CUSTOMER_KEY_INVALID', message },
  });
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const partnerController = {
  /**
   * POST /api/customer/auth
   * Body: { key }
   * Validates the customer key. Does NOT create a session — clients keep
   * using the key in an X-Customer-Key header for follow-up requests.
   */
  auth(req: Request, res: Response): void {
    const parsed = AuthBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ valid: false, error: { code: 'BAD_REQUEST', message: 'Key is required.' } });
      return;
    }
    const row = customerKeyRepo.findByKey(parsed.data.key.trim());
    if (!row) {
      res.status(401).json({ valid: false });
      return;
    }
    res.json({
      valid: true,
      customerKeyId: row.id,
      customerName: row.customer_name,
    });
  },

  /**
   * POST /api/submissions
   * Header: X-Customer-Key
   * Body: { customerName, formData }
   */
  createSubmission(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }

    const parsed = SubmissionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'customerName and formData are required.' },
      });
      return;
    }

    const sub = partnerSubmissionRepo.create({
      customerKeyId: keyRow.id,
      customerName:  parsed.data.customerName.trim(),
      formData:      parsed.data.formData,
    });

    res.status(201).json({
      id:           sub.id,
      status:       sub.status,
      submittedAt:  sub.submittedAt,
      customerName: sub.customerName,
    });
  },

  /**
   * GET /api/customer/me/submissions
   * Header: X-Customer-Key
   * Lists submissions for the authenticated customer (newest first).
   */
  listMySubmissions(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }

    const subs = partnerSubmissionRepo.listByCustomerKeyId(keyRow.id);
    // Hide the absolute server path; expose a download URL only when finalized.
    const safe = subs.map(s => ({
      id:                s.id,
      customerName:      s.customerName,
      status:            s.status,
      submittedAt:       s.submittedAt,
      finalizedAt:       s.finalizedAt,
      hasFinalizedXlsx:  !!s.finalizedXlsxPath,
    }));
    res.json({ submissions: safe });
  },
};
