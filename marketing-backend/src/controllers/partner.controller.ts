/* ============================================================
   Partner Customer Area — Controller
   Customer-facing endpoints (key auth, questionnaire submission,
   status). Admin (Raphael) endpoints will live in a follow-up
   commit alongside xlsx generation.
   ============================================================ */

import { Request, Response } from 'express';
import path from 'path';
import { customerKeyRepo, partnerSubmissionRepo, CustomerKeyRow } from '../db/partner.repository';
import { generateFinalizedXlsx, resolveStoredXlsx, storeUploadedXlsx } from '../services/partner-xlsx.service';
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
   *
   * Stores the submission AND immediately populates the personalized
   * Customer's Questionnaire xlsx so Raphael can review the actual file.
   * If xlsx generation fails (template issue, etc.), the submission still
   * succeeds — the file can be regenerated later by re-running finalize.
   */
  async createSubmission(req: Request, res: Response): Promise<void> {
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

    // Generate the personalized xlsx. Non-fatal — log but still 201.
    try {
      const result = await generateFinalizedXlsx(sub.id, sub.customerName, sub.formData as never);
      partnerSubmissionRepo.setXlsxPath(sub.id, result.fileName);
    } catch (err) {
      console.error('[partner] xlsx generation on submit failed:', err);
    }

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

  /**
   * GET /api/customer/me/submissions/:id/xlsx
   * Header: X-Customer-Key
   * Streams the finalized xlsx for one of the customer's own submissions.
   */
  downloadMyXlsx(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }

    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub || sub.customerKeyId !== keyRow.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    if (sub.status !== 'finalized' || !sub.finalizedXlsxPath) {
      res.status(409).json({ error: { code: 'NOT_FINALIZED', message: 'Submission has not been finalized yet.' } });
      return;
    }
    const abs = resolveStoredXlsx(sub.finalizedXlsxPath);
    if (!abs) {
      res.status(410).json({ error: { code: 'FILE_GONE', message: 'The finalized file is no longer available on disk.' } });
      return;
    }
    const downloadName = `${sub.customerName || 'Customer'} - Financial Model.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName.replace(/"/g, '')}"`);
    res.sendFile(abs);
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Admin (Raphael) endpoints — protected by requireAdminPin middleware.
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/submissions
   * List every submission with its full form data (newest first).
   */
  adminListSubmissions(_req: Request, res: Response): void {
    const subs = partnerSubmissionRepo.listAll();
    res.json({
      submissions: subs.map(s => ({
        id:            s.id,
        customerKeyId: s.customerKeyId,
        customerName:  s.customerName,
        status:        s.status,
        submittedAt:   s.submittedAt,
        finalizedAt:   s.finalizedAt,
        hasXlsx:       !!s.finalizedXlsxPath,
        formData:      s.formData,
      })),
    });
  },

  /**
   * GET /api/admin/submissions/:id
   * Single submission with full form data.
   */
  adminGetSubmission(req: Request, res: Response): void {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    res.json({
      submission: {
        id:            sub.id,
        customerKeyId: sub.customerKeyId,
        customerName:  sub.customerName,
        status:        sub.status,
        submittedAt:   sub.submittedAt,
        finalizedAt:   sub.finalizedAt,
        hasXlsx:       !!sub.finalizedXlsxPath,
        formData:      sub.formData,
      },
    });
  },

  /**
   * POST /api/admin/submissions/:id/finalize
   * Flips status to 'finalized'. The xlsx was generated on submit, so this
   * is purely a status change. If the xlsx is missing for any reason
   * (e.g. earlier generation failed), we regenerate it before finalizing.
   */
  async adminFinalize(req: Request, res: Response): Promise<void> {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }

    // Self-heal: if there is no xlsx on disk yet, generate one now.
    if (!sub.finalizedXlsxPath || !resolveStoredXlsx(sub.finalizedXlsxPath)) {
      try {
        const result = await generateFinalizedXlsx(sub.id, sub.customerName, sub.formData as never);
        partnerSubmissionRepo.setXlsxPath(sub.id, result.fileName);
      } catch (err) {
        console.error('[partner] xlsx regeneration on finalize failed:', err);
        res.status(500).json({
          error: {
            code: 'XLSX_GENERATION_FAILED',
            message: err instanceof Error ? err.message : 'xlsx generation failed.',
          },
        });
        return;
      }
    }

    const updated = partnerSubmissionRepo.markFinalized(sub.id, null);
    res.json({
      submission: {
        id:          updated?.id,
        status:      updated?.status,
        finalizedAt: updated?.finalizedAt,
        hasXlsx:     !!updated?.finalizedXlsxPath,
      },
    });
  },

  /**
   * POST /api/admin/submissions/:id/generate-xlsx
   * Manually (re)generates the personalized xlsx without changing status.
   * Useful for older submissions whose xlsx wasn't created at submit time,
   * or to refresh after a template/cell-mapping fix.
   */
  async adminGenerateXlsx(req: Request, res: Response): Promise<void> {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    try {
      const result  = await generateFinalizedXlsx(sub.id, sub.customerName, sub.formData as never);
      const updated = partnerSubmissionRepo.setXlsxPath(sub.id, result.fileName);
      res.json({
        submission: {
          id:      updated?.id,
          status:  updated?.status,
          hasXlsx: !!updated?.finalizedXlsxPath,
        },
      });
    } catch (err) {
      console.error('[partner] xlsx generation failed:', err);
      res.status(500).json({
        error: {
          code: 'XLSX_GENERATION_FAILED',
          message: err instanceof Error ? err.message : 'xlsx generation failed.',
        },
      });
    }
  },

  /**
   * POST /api/admin/submissions/:id/upload-xlsx
   * Replaces the stored xlsx with a manually-edited file uploaded by the
   * admin. The body is the raw .xlsx bytes (Content-Type doesn't matter,
   * we validate the zip magic bytes). Used after Raphael edits the
   * generated model in Excel and wants the customer to download that
   * version on Finalize.
   */
  adminUploadXlsx(req: Request, res: Response): void {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({
        error: { code: 'EMPTY_BODY', message: 'Upload body is empty or not binary.' },
      });
      return;
    }
    try {
      const result  = storeUploadedXlsx(sub.id, sub.customerName, buf);
      const updated = partnerSubmissionRepo.setXlsxPath(sub.id, result.fileName);
      res.json({
        submission: {
          id:      updated?.id,
          status:  updated?.status,
          hasXlsx: !!updated?.finalizedXlsxPath,
        },
      });
    } catch (err) {
      console.error('[partner] xlsx upload failed:', err);
      res.status(400).json({
        error: {
          code: 'INVALID_XLSX',
          message: err instanceof Error ? err.message : 'Upload failed.',
        },
      });
    }
  },

  /**
   * GET /api/admin/submissions/:id/xlsx
   * Streams the generated xlsx for any submission (admin / Raphael view).
   * Available regardless of status because the xlsx is created on submit.
   */
  adminDownloadXlsx(req: Request, res: Response): void {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    if (!sub.finalizedXlsxPath) {
      res.status(409).json({
        error: { code: 'XLSX_NOT_READY', message: 'xlsx has not been generated yet.' },
      });
      return;
    }
    const abs = resolveStoredXlsx(sub.finalizedXlsxPath);
    if (!abs) {
      res.status(410).json({
        error: { code: 'FILE_GONE', message: 'The xlsx file is no longer available on disk.' },
      });
      return;
    }
    const downloadName = `${sub.customerName || 'Customer'} - Financial Model.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName.replace(/"/g, '')}"`);
    res.sendFile(abs);
  },

  /**
   * GET /api/admin/notifications/count
   * Used by the homepage badge — returns count of pending submissions.
   */
  adminPendingCount(_req: Request, res: Response): void {
    res.json({ pending: partnerSubmissionRepo.countPending() });
  },

  /**
   * POST /api/admin/customer-keys
   * Body: { customerName }   →  generates a new VV-XXXXXX key.
   */
  adminCreateKey(req: Request, res: Response): void {
    const parsed = z.object({ customerName: z.string().trim().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'customerName is required.' } });
      return;
    }
    const row = customerKeyRepo.create({ customerName: parsed.data.customerName });
    res.status(201).json({
      id:           row.id,
      key:          row.key,
      customerName: row.customer_name,
      createdAt:    row.created_at,
    });
  },

  /**
   * GET /api/admin/customer-keys
   */
  adminListKeys(_req: Request, res: Response): void {
    const rows = customerKeyRepo.list();
    res.json({
      keys: rows.map(r => ({
        id:           r.id,
        key:          r.key,
        customerName: r.customer_name,
        createdAt:    r.created_at,
        revoked:      r.revoked === 1,
      })),
    });
  },
};

// Silence unused-import warning when path lib isn't used anywhere else.
void path;
