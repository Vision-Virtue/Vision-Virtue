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
import {
  storeAsset, resolveAsset, contentTypeForFilename, MAX_ASSET_BYTES,
} from '../services/deck-asset.service';
import {
  storeUpload, listUploads, resolveUpload, readMeta, deleteUpload,
  getOrExtractText, MAX_UPLOAD_BYTES,
} from '../services/deck-upload.service';
import {
  generatePopulatedPptx, pptxTemplatePath, customerPptxDir,
  buildPptxFileName, resolveStoredPptx,
} from '../services/pptx-generator.service';
import { INVESTOR_DECK_FIELDS, SECTIONS, InvestorDeckField } from '../data/investor-deck-schema';
import fs from 'fs';
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
      // Best-effort pptx populate. Values pulled from Investor_Deck_Calculations
      // will be "MISSING INPUT" until an admin opens + saves the xlsx in Excel,
      // so on submit we generate a draft and the admin can regenerate later.
      // We pass the customerKeyId so AI extraction also runs against any
      // files the customer dropped into Section 10.
      try {
        await generateDeckForSubmission(sub.id, sub.customerName, result.filePath, keyRow.id);
      } catch (pptxErr) {
        console.error('[partner] pptx generation on submit failed:', pptxErr);
      }
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
   * GET /api/customer/deck-schema
   * Returns the investor-deck questionnaire schema so the frontend can
   * render the form sections from a single source of truth. Public —
   * the schema itself isn't sensitive and the actual answers are still
   * gated by the customer key on submission.
   */
  deckSchema(_req: Request, res: Response): void {
    res.json({
      sections: SECTIONS,
      fields: INVESTOR_DECK_FIELDS,
      total: INVESTOR_DECK_FIELDS.length,
    });
  },

  /**
   * POST /api/customer/deck-asset?placeholder=<NAME>
   * Header: X-Customer-Key, Content-Type: image/<type>
   * Body:   raw image bytes
   *
   * Stores the file under <data>/customer-assets/<customerKeyId>/ and
   * returns the URL the questionnaire stores in formData.investorDeck.
   */
  deckAssetUpload(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }

    const placeholder = String(req.query.placeholder || '').trim();
    if (!placeholder) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'placeholder query param required.' } });
      return;
    }

    // Express's raw-body middleware (registered with a per-route mime list)
    // delivers a Buffer here. Reject anything else to be explicit.
    const buf = req.body;
    if (!Buffer.isBuffer(buf)) {
      res.status(400).json({ error: { code: 'BAD_BODY', message: 'Body must be raw image bytes.' } });
      return;
    }
    const contentType = req.header('content-type') || 'application/octet-stream';

    try {
      const stored = storeAsset({
        customerKeyId:   keyRow.id,
        placeholderName: placeholder,
        contentType,
        buffer:          buf,
      });
      res.status(201).json({
        url:      stored.url,
        fileName: stored.fileName,
        sizeBytes: buf.length,
      });
    } catch (err) {
      res.status(400).json({
        error: {
          code: 'ASSET_REJECTED',
          message: err instanceof Error ? err.message : 'Asset rejected.',
        },
      });
    }
  },

  /**
   * GET /api/customer/deck-asset/:fileName
   * Header: X-Customer-Key
   * Streams the customer's own asset back. The customer key in the header
   * picks which customer-assets/<customerKeyId>/ directory to read from —
   * customers can only see their own files.
   */
  deckAssetServe(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }

    const fileName = req.params.fileName || '';
    const abs = resolveAsset(keyRow.id, fileName);
    if (!abs) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Asset not found.' } });
      return;
    }
    res.setHeader('Content-Type', contentTypeForFilename(fileName));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(abs);
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Drag-and-drop deck-upload endpoints (PDF / DOCX / PPTX / XLSX)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/customer/deck-upload?filename=<encoded>
   * Header: X-Customer-Key, Content-Type: <mime>
   * Body:   raw file bytes (matches the existing deck-asset pattern —
   *         simpler than multipart, no extra deps).
   *
   * Returns the upload's metadata. Text extraction happens lazily on the
   * first read (admin clicks "Extract" or generation kicks off).
   */
  deckUploadCreate(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }

    const originalName = String(req.query.filename || '').trim() || 'upload';
    const buf = req.body;
    if (!Buffer.isBuffer(buf)) {
      res.status(400).json({ error: { code: 'BAD_BODY', message: 'Body must be raw file bytes.' } });
      return;
    }
    try {
      const meta = storeUpload({
        customerKeyId: keyRow.id,
        originalName,
        mimeType: req.header('content-type') || 'application/octet-stream',
        buffer:   buf,
      });
      res.status(201).json(meta);
    } catch (err) {
      res.status(400).json({
        error: {
          code: 'UPLOAD_REJECTED',
          message: err instanceof Error ? err.message : 'Upload rejected.',
        },
      });
    }
  },

  /**
   * GET /api/customer/deck-upload
   * Header: X-Customer-Key
   * List the customer's uploads (newest first).
   */
  deckUploadList(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }
    res.json({ uploads: listUploads(keyRow.id) });
  },

  /**
   * GET /api/customer/deck-upload/:fileId
   * Header: X-Customer-Key
   * Streams the file back to the customer.
   */
  deckUploadDownload(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }
    const abs = resolveUpload(keyRow.id, req.params.fileId);
    if (!abs) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Upload not found.' } }); return; }
    const meta = readMeta(keyRow.id, req.params.fileId);
    const downloadName = (meta?.originalName as string) || 'download';
    res.setHeader('Content-Type', (meta?.mimeType as string) || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${String(downloadName).replace(/"/g, '')}"`);
    res.sendFile(abs);
  },

  /**
   * DELETE /api/customer/deck-upload/:fileId
   * Header: X-Customer-Key
   */
  deckUploadDelete(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }
    const ok = deleteUpload(keyRow.id, req.params.fileId);
    if (!ok) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Upload not found.' } }); return; }
    res.json({ ok: true });
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Admin-side views of customer uploads (per submission)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/submissions/:id/uploads
   * Lists the uploads belonging to the customer key that owns this submission.
   */
  adminListUploads(req: Request, res: Response): void {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    res.json({ uploads: listUploads(sub.customerKeyId) });
  },

  /**
   * GET /api/admin/submissions/:id/uploads/:fileId
   * Streams one customer upload to the admin.
   */
  adminDownloadUpload(req: Request, res: Response): void {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } }); return; }
    const abs = resolveUpload(sub.customerKeyId, req.params.fileId);
    if (!abs) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Upload not found.' } }); return; }
    const meta = readMeta(sub.customerKeyId, req.params.fileId);
    const downloadName = (meta?.originalName as string) || 'download';
    res.setHeader('Content-Type', (meta?.mimeType as string) || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${String(downloadName).replace(/"/g, '')}"`);
    res.sendFile(abs);
  },

  /**
   * POST /api/admin/submissions/:id/uploads/:fileId/extract
   * Runs (or re-runs) text extraction on the file and returns a short
   * preview + flags. Used by AI Finance to confirm a file is readable
   * before generating the deck.
   */
  async adminExtractUpload(req: Request, res: Response): Promise<void> {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } }); return; }
    try {
      const text = await getOrExtractText(sub.customerKeyId, req.params.fileId);
      res.json({
        ok:           true,
        chars:        text.length,
        preview:      text.slice(0, 600),
        truncated:    text.length > 600,
      });
    } catch (err) {
      res.status(400).json({
        error: {
          code: 'EXTRACTION_FAILED',
          message: err instanceof Error ? err.message : 'Extraction failed.',
        },
      });
    }
  },

  /**
   * GET /api/customer/me/submissions/:id/deck-validation
   * Header: X-Customer-Key
   *
   * Walks the investor-deck schema and reports:
   *   - missingRequired: required placeholders without an answer
   *   - missingImages:   image placeholders that the customer left blank
   *                      (even if optional — UI may want to nag)
   *   - filled:          count of placeholders with a non-empty answer
   *   - complete:        true ⇔ no missingRequired entries
   */
  deckValidation(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }

    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub || sub.customerKeyId !== keyRow.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }

    const fd = (sub.formData || {}) as { investorDeck?: Record<string, unknown> };
    const answers = fd.investorDeck || {};

    const missingRequired: Array<{ placeholder: string; section: string; slideNumbers: number[]; question: string }> = [];
    const missingImages:   Array<{ placeholder: string; section: string; required: boolean; question: string }> = [];
    let filled = 0;

    for (const f of INVESTOR_DECK_FIELDS as InvestorDeckField[]) {
      const v = answers[f.fieldKey];
      const hasValue = v !== undefined && v !== null && String(v).trim() !== '';
      if (hasValue) filled += 1;
      if (f.required && !hasValue) {
        missingRequired.push({
          placeholder:  f.placeholder,
          section:      f.section,
          slideNumbers: f.slideNumbers,
          question:     f.question,
        });
      }
      if (f.inputType === 'image' && !hasValue) {
        missingImages.push({
          placeholder: f.placeholder,
          section:     f.section,
          required:    f.required,
          question:    f.question,
        });
      }
    }

    res.json({
      submissionId:  sub.id,
      customerName:  sub.customerName,
      total:         INVESTOR_DECK_FIELDS.length,
      filled,
      complete:      missingRequired.length === 0,
      missingRequired,
      missingImages,
      // Reminder: Investor_Deck_Calculations is built by a separate Part-1
      // pipeline. We only check that the questionnaire side is complete.
      note: 'Calculated placeholders are validated separately against Investor_Deck_Calculations.',
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
   *
   * `hasPptx` reflects on-disk presence: filename is derived from
   * customerName + submissionId via buildPptxFileName(), and we look
   * it up in customer-pptx/ on the persistent disk.
   */
  adminListSubmissions(_req: Request, res: Response): void {
    const subs = partnerSubmissionRepo.listAll();
    // Resolve each submission's owning customer-key row so the admin UI
    // can display the VV-XXXXXX value (useful for sharing with the
    // customer if they lose their copy). Memoised per request to avoid
    // repeated DB hits when several submissions share one key.
    const keyCache = new Map<string, ReturnType<typeof customerKeyRepo.findById>>();
    res.json({
      submissions: subs.map(s => {
        let keyRow = null;
        if (s.customerKeyId) {
          if (keyCache.has(s.customerKeyId)) {
            keyRow = keyCache.get(s.customerKeyId) || null;
          } else {
            keyRow = customerKeyRepo.findById(s.customerKeyId);
            keyCache.set(s.customerKeyId, keyRow);
          }
        }
        return {
          id:                  s.id,
          customerKeyId:       s.customerKeyId,
          customerName:        s.customerName,
          // The owning key row — useful for "give the customer back their
          // forgotten key" workflows. Null if the row was deleted.
          customerKey:         keyRow?.key       ?? null,
          customerKeyOwner:    keyRow?.customer_name ?? null,
          customerKeyRevoked:  keyRow?.revoked === 1,
          status:              s.status,
          submittedAt:         s.submittedAt,
          finalizedAt:         s.finalizedAt,
          hasXlsx:             !!s.finalizedXlsxPath,
          hasPptx:             !!resolveStoredPptx(buildPptxFileName(s.customerName, s.id)),
          formData:            s.formData,
        };
      }),
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

  // ────────────────────────────────────────────────────────────────────────────
  // Investor Deck PPTX endpoints
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/admin/submissions/:id/generate-pptx
   * Regenerates the investor-deck pptx for this submission by re-reading the
   * customer's xlsx (which the admin may have edited in Excel to refresh
   * the calculations sheet) and replacing every {{PLACEHOLDER}} in the
   * template.
   */
  async adminGeneratePptx(req: Request, res: Response): Promise<void> {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    if (!sub.finalizedXlsxPath) {
      res.status(409).json({
        error: { code: 'NO_XLSX', message: 'The xlsx has not been generated yet.' },
      });
      return;
    }
    const xlsxAbs = resolveStoredXlsx(sub.finalizedXlsxPath);
    if (!xlsxAbs) {
      res.status(410).json({ error: { code: 'XLSX_GONE', message: 'Stored xlsx file is missing on disk.' } });
      return;
    }
    try {
      const stats = await generateDeckForSubmission(sub.id, sub.customerName, xlsxAbs, sub.customerKeyId);
      res.json({
        submissionId:      sub.id,
        replaced:          stats.replaced,
        slidesProcessed:   stats.slidesProcessed,
        slidesDeleted:     stats.slidesDeleted ?? 0,
        emptyRunsStripped: stats.emptyRunsStripped ?? 0,
        unmatchedCount:    stats.unmatched.length,
        unmatched:         stats.unmatched.slice(0, 25),
        ai:                stats.ai,
        aiRewrite:         stats.aiRewrite,
      });
    } catch (err) {
      console.error('[partner] adminGeneratePptx failed:', err);
      res.status(500).json({
        error: {
          code: 'PPTX_GENERATION_FAILED',
          message: err instanceof Error ? err.message : 'pptx generation failed.',
        },
      });
    }
  },

  /**
   * GET /api/admin/submissions/:id/pptx
   * Streams the populated investor-deck pptx (admin view).
   */
  adminDownloadPptx(req: Request, res: Response): void {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    const fileName = buildPptxFileName(sub.customerName, sub.id);
    const abs = resolveStoredPptx(fileName);
    if (!abs) {
      res.status(409).json({
        error: { code: 'PPTX_NOT_READY', message: 'pptx has not been generated yet — call POST /api/admin/submissions/:id/generate-pptx first.' },
      });
      return;
    }
    const downloadName = `${sub.customerName || 'Customer'} - Investor Deck.pptx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName.replace(/"/g, '')}"`);
    res.sendFile(abs);
  },

  /**
   * GET /api/customer/me/submissions/:id/pptx
   * Header: X-Customer-Key
   * Customer downloads their populated deck. Only available once the
   * submission is finalized (mirrors the xlsx flow).
   */
  downloadMyPptx(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub || sub.customerKeyId !== keyRow.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    if (sub.status !== 'finalized') {
      res.status(409).json({ error: { code: 'NOT_FINALIZED', message: 'Submission has not been finalized yet.' } });
      return;
    }
    const fileName = buildPptxFileName(sub.customerName, sub.id);
    const abs = resolveStoredPptx(fileName);
    if (!abs) {
      res.status(410).json({ error: { code: 'PPTX_GONE', message: 'The populated pptx is not available on disk.' } });
      return;
    }
    const downloadName = `${sub.customerName || 'Customer'} - Investor Deck.pptx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName.replace(/"/g, '')}"`);
    res.sendFile(abs);
  },
};

// ─── Helpers used by multiple controller methods ──────────────────────────────

/**
 * Generate (or regenerate) the populated pptx for a submission. Returns
 * the stats from the replacer. Throws if the template or xlsx is missing.
 *
 * When customerKeyId is supplied AND the customer has at least one
 * extracted upload, the function also calls Claude to fill the
 * questionnaire-style placeholders from the uploaded source text and
 * merges the results into the replacer's value map (xlsx values win
 * on collisions).
 *
 * AI extraction is best-effort — a failure does NOT block the xlsx-only
 * path, the error is logged and the deck is still produced.
 */
async function generateDeckForSubmission(
  submissionId: string,
  customerName: string,
  xlsxAbsPath: string,
  customerKeyId?: string,
) {
  const outDir = customerPptxDir();
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = `${outDir}/${buildPptxFileName(customerName, submissionId)}`.replace(/\\/g, '/');

  // The new Claude-driven extractor inside generatePopulatedPptx reads the
  // entire workbook + every upload's extracted text in one call and returns
  // a ready-to-replace value map. The old runDeckExtraction (uploads-only) is
  // no longer needed in this code path; we just pass the customerKeyId so the
  // generator can pull the upload text itself.
  const pptxStats = await generatePopulatedPptx({
    templatePptxPath: pptxTemplatePath(),
    customerXlsxPath: xlsxAbsPath,
    outputPptxPath:   outFile,
    customerKeyId,
  });
  return { ...pptxStats, ai: null };
}

// Silence unused-import warning when path lib isn't used anywhere else.
void path;
