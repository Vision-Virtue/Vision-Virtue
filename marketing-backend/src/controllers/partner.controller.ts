/* ============================================================
   Partner Customer Area — Controller
   Customer-facing endpoints (key auth, questionnaire submission,
   status). Admin (Raphael) endpoints will live in a follow-up
   commit alongside xlsx generation.
   ============================================================ */

import { Request, Response } from 'express';
import path from 'path';
import {
  customerKeyRepo, partnerSubmissionRepo, CustomerKeyRow,
  investorKeyRepo, InvestorKeyRow,
  marketplaceListingRepo, MarketplaceListingKpis,
  ndaSignatureRepo,
} from '../db/partner.repository';
import {
  storeDeckPdf, readDeckPdf, MAX_DECK_PDF_BYTES,
} from '../services/marketplace-deck.service';
import { generatePopulatedNdaPdf } from '../services/nda-pdf-generator.service';
import { extractMarketplaceTileData } from '../services/marketplace-extractor.service';
import { getOrBuildAutoDeckPdf, invalidateAutoDeckCache } from '../services/pptx-to-pdf.service';
import { runSystemCheck } from '../services/system-check.service';
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
  buildPptxFileName, resolveStoredPptx, readWorkbookAsText, storeUploadedPptx,
} from '../services/pptx-generator.service';
import { INVESTOR_DECK_FIELDS, SECTIONS, InvestorDeckField } from '../data/investor-deck-schema';
import { AIService } from '../services/ai.service';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import { z } from 'zod';

// Lazily instantiated singleton so we don't import-time crash when the API
// key isn't set (e.g. local dev). Anthropic SDK creates a fresh HTTP client
// per request internally so reusing one instance across requests is fine.
let _aiServiceSingleton: AIService | null = null;
function getAIService(): AIService {
  if (_aiServiceSingleton) return _aiServiceSingleton;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  _aiServiceSingleton = new AIService(new Anthropic({ apiKey }));
  return _aiServiceSingleton;
}

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

/** Same shape as resolveCustomerKey, but for the investor key (X-Investor-Key). */
function resolveInvestorKey(req: Request): InvestorKeyRow | null {
  const headerKey = req.header('x-investor-key');
  if (!headerKey) return null;
  return investorKeyRepo.findByKey(headerKey.trim());
}

function send401(res: Response, message: string): void {
  res.status(401).json({
    error: { code: 'CUSTOMER_KEY_INVALID', message },
  });
}

function send401Investor(res: Response, message: string): void {
  res.status(401).json({
    error: { code: 'INVESTOR_KEY_INVALID', message },
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
      const result = await generateFinalizedXlsx(sub.id, sub.customerName, sub.formData as never, keyRow.id);
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
    // hasFinalizedPptx is gated on BOTH status === finalized AND a populated
    // pptx existing on disk — matches the customer Download Presentation flow.
    const safe = subs.map(s => {
      const pptxOnDisk = !!resolveStoredPptx(buildPptxFileName(s.customerName, s.id));
      return {
        id:                s.id,
        customerName:      s.customerName,
        status:            s.status,
        submittedAt:       s.submittedAt,
        finalizedAt:       s.finalizedAt,
        hasFinalizedXlsx:  !!s.finalizedXlsxPath,
        hasFinalizedPptx:  s.status === 'finalized' && pptxOnDisk,
      };
    });
    res.json({ submissions: safe });
  },

  /**
   * GET /api/customer/me/submissions/:id
   * Header: X-Customer-Key
   * Returns one submission (incl. its formData) so the customer can
   * pre-populate the Edit-flow questionnaire.
   */
  getMySubmission(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub || sub.customerKeyId !== keyRow.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    res.json({
      submission: {
        id:           sub.id,
        customerName: sub.customerName,
        status:       sub.status,
        submittedAt:  sub.submittedAt,
        finalizedAt:  sub.finalizedAt,
        formData:     sub.formData,
      },
    });
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
        const result = await generateFinalizedXlsx(sub.id, sub.customerName, sub.formData as never, sub.customerKeyId ?? undefined);
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
      const result  = await generateFinalizedXlsx(sub.id, sub.customerName, sub.formData as never, sub.customerKeyId ?? undefined);
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
   * POST /api/admin/submissions/:id/upload-pptx
   * Replaces the stored populated investor-deck with a manually-edited
   * pptx uploaded by the admin. Raw bytes in body (we validate zip magic).
   */
  adminUploadPptx(req: Request, res: Response): void {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: { code: 'EMPTY_BODY', message: 'Upload body is empty or not binary.' } });
      return;
    }
    try {
      storeUploadedPptx(sub.id, sub.customerName, buf);
      // Reupload is also "re-open for editing" — flip a finalized
      // submission back to 'review' so the admin can Finalize again.
      if (sub.status === 'finalized') partnerSubmissionRepo.unfinalize(sub.id);
      const after = partnerSubmissionRepo.getById(sub.id);
      res.json({ success: true, submission: { id: after?.id, status: after?.status, hasPptx: true } });
    } catch (err) {
      console.error('[partner] pptx upload failed:', err);
      res.status(400).json({
        error: { code: 'INVALID_PPTX', message: err instanceof Error ? err.message : 'Upload failed.' },
      });
    }
  },

  /**
   * POST /api/admin/submissions/:id/unfinalize
   * Flip a finalized submission back to 'review' so a correction can be
   * made and re-finalized. The stored xlsx/pptx stay in place — the next
   * Reupload or Regenerate overwrites them in the normal way.
   */
  adminUnfinalize(req: Request, res: Response): void {
    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    if (sub.status !== 'finalized') {
      res.status(409).json({ error: { code: 'NOT_FINALIZED', message: 'Submission is not finalized.' } });
      return;
    }
    const updated = partnerSubmissionRepo.unfinalize(sub.id);
    res.json({ success: true, submission: { id: updated?.id, status: updated?.status } });
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
      const result = storeUploadedXlsx(sub.id, sub.customerName, buf);
      partnerSubmissionRepo.setXlsxPath(sub.id, result.fileName);
      // Reupload is also the "re-open for editing" action — if the
      // submission was finalized, flip it back to 'review' so the
      // admin can Finalize again after the correction lands.
      if (sub.status === 'finalized') partnerSubmissionRepo.unfinalize(sub.id);
      const after = partnerSubmissionRepo.getById(sub.id);
      res.json({
        submission: {
          id:      after?.id,
          status:  after?.status,
          hasXlsx: !!after?.finalizedXlsxPath,
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
  // Investor Marketplace — Keys & Gate (Phase 1)
  // VC/PE/Investor accesses the Investors Marketplace area via an IV-XXXXXX
  // key minted from Finance AI. Same shape as the Customer Key flow, but a
  // distinct table + prefix so the two audiences never cross over.
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/investor/auth
   * Body: { key }
   * Validates an investor key (IV-XXXXXX). Mirrors customer auth.
   */
  investorAuth(req: Request, res: Response): void {
    const parsed = AuthBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ valid: false, error: { code: 'BAD_REQUEST', message: 'Key is required.' } });
      return;
    }
    const row = investorKeyRepo.findByKey(parsed.data.key.trim());
    if (!row) {
      res.status(401).json({ valid: false });
      return;
    }
    res.json({
      valid: true,
      investorKeyId: row.id,
      investorName: row.investor_name,
    });
  },

  /**
   * POST /api/admin/investor-keys
   * Body: { investorName }   →  generates a new IV-XXXXXX key.
   */
  adminCreateInvestorKey(req: Request, res: Response): void {
    const parsed = z.object({ investorName: z.string().trim().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'investorName is required.' } });
      return;
    }
    const row = investorKeyRepo.create({ investorName: parsed.data.investorName });
    res.status(201).json({
      id:           row.id,
      key:          row.key,
      investorName: row.investor_name,
      createdAt:    row.created_at,
    });
  },

  /**
   * GET /api/admin/investor-keys
   */
  adminListInvestorKeys(_req: Request, res: Response): void {
    const rows = investorKeyRepo.list();
    res.json({
      keys: rows.map(r => ({
        id:           r.id,
        key:          r.key,
        investorName: r.investor_name,
        createdAt:    r.created_at,
        revoked:      r.revoked === 1,
      })),
    });
  },

  /**
   * POST /api/admin/investor-keys/:id/revoke
   */
  adminRevokeInvestorKey(req: Request, res: Response): void {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'id is required.' } });
      return;
    }
    if (!investorKeyRepo.findById(id)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Investor key not found.' } });
      return;
    }
    investorKeyRepo.revoke(id);
    res.json({ ok: true });
  },

  /** DELETE /api/admin/investor-keys/:id — hard delete + cascade. */
  adminDeleteInvestorKey(req: Request, res: Response): void {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'id is required.' } });
      return;
    }
    if (!investorKeyRepo.findById(id)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Investor key not found.' } });
      return;
    }
    investorKeyRepo.delete(id);
    res.json({ ok: true });
  },

  /** DELETE /api/admin/customer-keys/:id — hard delete + cascade. Wipes the
   *  customer's submissions, listings, NDAs and every dependent table. Used
   *  by the trash-row action in Customer Submissions. */
  adminDeleteCustomerKey(req: Request, res: Response): void {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'id is required.' } });
      return;
    }
    if (!customerKeyRepo.findById(id)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer key not found.' } });
      return;
    }
    customerKeyRepo.delete(id);
    res.json({ ok: true });
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Investors Marketplace — Listings (Phase 2)
  // Customer side: publish / withdraw their submission to the marketplace.
  // Investor side: list active tiles, fetch a tile detail.
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/customer/me/marketplace-listings
   * Header: X-Customer-Key
   * Body: { submissionId }
   *
   * Publishes (or republishes) the customer's submission to the Investors
   * Marketplace. ALL tile fields (sector, description, ask, KPIs) are auto-
   * extracted from the customer's questionnaire + finalized Financial Model
   * xlsx — the customer doesn't supply them. The submission must belong to
   * this customer key. One listing per submission.
   */
  async customerPublishListing(req: Request, res: Response): Promise<void> {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }
    const Body = z.object({ submissionId: z.string().trim().min(1) });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'submissionId is required.' } });
      return;
    }
    const sub = partnerSubmissionRepo.getById(parsed.data.submissionId);
    if (!sub || sub.customerKeyId !== keyRow.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    let extracted;
    try {
      extracted = await extractMarketplaceTileData(sub);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Auto-extraction failed.';
      res.status(500).json({ error: { code: 'EXTRACT_FAILED', message: msg } });
      return;
    }
    const listing = marketplaceListingRepo.upsert({
      submissionId:   sub.id,
      customerKeyId:  keyRow.id,
      customerName:   sub.customerName,
      logoPath:       null,
      description:    extracted.description,
      sector:         extracted.sector,
      askAmountText:  extracted.askAmountText,
      kpis:           extracted.kpis,
    });
    // Drop any cached auto-deck PDF — re-publish may mean the source PPTX has
    // changed (admin regenerated after edits), so the next investor view re-
    // converts from the freshest PPTX on disk.
    try { invalidateAutoDeckCache(listing.id); } catch { /* best-effort */ }
    res.status(201).json({ listing });
  },

  /**
   * GET /api/customer/me/marketplace-preview?submissionId=...
   * Header: X-Customer-Key
   * Returns the would-be tile fields without publishing — drives the
   * preview shown in the Partner area before the customer clicks Publish.
   */
  async customerPreviewListing(req: Request, res: Response): Promise<void> {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }
    const submissionId = String(req.query.submissionId || '').trim();
    if (!submissionId) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'submissionId is required.' } });
      return;
    }
    const sub = partnerSubmissionRepo.getById(submissionId);
    if (!sub || sub.customerKeyId !== keyRow.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }
    try {
      const extract = await extractMarketplaceTileData(sub);
      res.json({ extract });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Auto-extraction failed.';
      res.status(500).json({ error: { code: 'EXTRACT_FAILED', message: msg } });
    }
  },

  /**
   * GET /api/customer/me/marketplace-listings
   * Header: X-Customer-Key
   * Returns the customer's own listings (active + withdrawn) so the Partner
   * area can show current status + offer Pull submission.
   */
  customerListMyListings(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }
    const listings = marketplaceListingRepo.listByCustomerKey(keyRow.id);
    res.json({ listings });
  },

  /**
   * POST /api/customer/me/marketplace-listings/:id/withdraw
   * Header: X-Customer-Key
   * Pull-submission (item 9 of the spec). Marks the listing as withdrawn so
   * it disappears from the investor view. Re-publishable later.
   */
  customerWithdrawListing(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }
    const id = String(req.params.id || '').trim();
    const listing = marketplaceListingRepo.findById(id);
    if (!listing || listing.customerKeyId !== keyRow.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Listing not found.' } });
      return;
    }
    const updated = marketplaceListingRepo.withdraw(id);
    res.json({ listing: updated });
  },

  /**
   * GET /api/investor/marketplace/listings
   * Header: X-Investor-Key
   * Returns every active tile for the marketplace grid.
   */
  investorListListings(req: Request, res: Response): void {
    const keyRow = resolveInvestorKey(req);
    if (!keyRow) { send401Investor(res, 'Missing or invalid investor key.'); return; }
    const listings = marketplaceListingRepo.listActive();
    res.json({ listings });
  },

  /**
   * GET /api/investor/marketplace/listings/:id
   * Header: X-Investor-Key
   * Returns a single active tile's full detail (KPIs, etc.) for the popover.
   * Also reports whether this investor has signed the NDA for this listing
   * and whether a view-only deck PDF is available.
   */
  investorGetListing(req: Request, res: Response): void {
    const keyRow = resolveInvestorKey(req);
    if (!keyRow) { send401Investor(res, 'Missing or invalid investor key.'); return; }
    const id = String(req.params.id || '').trim();
    const listing = marketplaceListingRepo.findById(id);
    if (!listing || listing.status !== 'active') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Listing not available.' } });
      return;
    }
    const nda = ndaSignatureRepo.findByInvestorAndListing(keyRow.id, listing.id);
    // A deck is "available" when either:
    //   • the customer's populated investor-deck PPTX exists on disk (the
    //     normal post-Phase-6 path — we auto-convert it on demand), OR
    //   • the listing has a legacy customer-uploaded PDF attached.
    let pptxOnDisk = false;
    const sub = partnerSubmissionRepo.getById(listing.submissionId);
    if (sub) {
      pptxOnDisk = !!resolveStoredPptx(buildPptxFileName(sub.customerName, sub.id));
    }
    res.json({
      listing,
      ndaSigned: !!nda,
      deckAvailable: pptxOnDisk || !!listing.deckPdfPath,
    });
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Phase 3 — NDA flow + Deck PDF
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/customer/me/marketplace-listings/:id/deck-pdf
   * Header: X-Customer-Key
   * Body: raw application/pdf bytes (≤ 30 MB)
   *
   * Customer attaches a view-only PDF of their investor deck to their listing.
   * Investors only see it after signing the NDA. Replaces any previous PDF.
   */
  customerUploadDeckPdf(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }
    const id = String(req.params.id || '').trim();
    const listing = marketplaceListingRepo.findById(id);
    if (!listing || listing.customerKeyId !== keyRow.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Listing not found.' } });
      return;
    }
    const body = req.body as Buffer | undefined;
    if (!body || !Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Empty PDF body.' } });
      return;
    }
    if (body.length > MAX_DECK_PDF_BYTES) {
      res.status(413).json({ error: { code: 'PDF_TOO_LARGE', message: 'PDF exceeds 30 MB.' } });
      return;
    }
    try {
      const ref = storeDeckPdf(listing.id, body);
      const updated = marketplaceListingRepo.setDeckPdfPath(listing.id, ref);
      res.status(201).json({ listing: updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: msg } });
    }
  },

  /**
   * POST /api/investor/nda/sign
   * Header: X-Investor-Key
   * Body: { listingId, fullName, fundName, title, businessEmail, signDate,
   *         signatureType: 'typed' | 'drawn', signatureValue }
   *
   * Persists the investor's NDA acceptance for a specific listing. The next
   * deck-view request from this investor for this listing will pass the
   * NDA gate. Re-signing overwrites the previous record (rare; e.g. company
   * updates their fund name).
   */
  investorSignNda(req: Request, res: Response): void {
    const keyRow = resolveInvestorKey(req);
    if (!keyRow) { send401Investor(res, 'Missing or invalid investor key.'); return; }
    const Body = z.object({
      listingId:      z.string().trim().min(1),
      fullName:       z.string().trim().min(2).max(200),
      fundName:       z.string().trim().min(1).max(200),
      title:          z.string().trim().min(1).max(120),
      businessEmail:  z.string().trim().email().max(200),
      signDate:       z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
      signatureType:  z.enum(['typed', 'drawn']),
      signatureValue: z.string().trim().min(1).max(500_000), // data-URL PNG can be large
      confirmed:      z.literal(true).optional(),            // checkbox state, advisory
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid NDA fields.', details: parsed.error.flatten() } });
      return;
    }
    const listing = marketplaceListingRepo.findById(parsed.data.listingId);
    if (!listing || listing.status !== 'active') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Listing not available.' } });
      return;
    }
    const ip = (req.ip || req.headers['x-forwarded-for'] as string || '').toString().slice(0, 60);
    const ua = (req.headers['user-agent'] || '').toString().slice(0, 400);
    const nda = ndaSignatureRepo.create({
      investorKeyId:  keyRow.id,
      investorName:   keyRow.investor_name,
      listingId:      listing.id,
      customerName:   listing.customerName,
      fullName:       parsed.data.fullName,
      fundName:       parsed.data.fundName,
      title:          parsed.data.title,
      businessEmail:  parsed.data.businessEmail,
      signDate:       parsed.data.signDate,
      signatureType:  parsed.data.signatureType,
      signatureValue: parsed.data.signatureValue,
      ipAddress:      ip || null,
      userAgent:      ua || null,
    });
    res.status(201).json({ ndaId: nda.id, signedAt: nda.signedAt });
  },

  /**
   * GET /api/investor/nda/status?listingId=...
   * Header: X-Investor-Key
   * Quick check the marketplace UI calls before opening a tile.
   */
  investorNdaStatus(req: Request, res: Response): void {
    const keyRow = resolveInvestorKey(req);
    if (!keyRow) { send401Investor(res, 'Missing or invalid investor key.'); return; }
    const listingId = String(req.query.listingId || '').trim();
    if (!listingId) { res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'listingId required.' } }); return; }
    const nda = ndaSignatureRepo.findByInvestorAndListing(keyRow.id, listingId);
    res.json({
      signed:   !!nda,
      signedAt: nda?.signedAt ?? null,
      ndaId:    nda?.id       ?? null,
    });
  },

  /**
   * GET /api/investor/marketplace/listings/:id/deck
   * Header: X-Investor-Key
   * Streams the customer's view-only deck PDF inline. Gated by:
   *   1. Active listing
   *   2. NDA signed by this investor for this listing
   *   3. Deck PDF actually uploaded
   * Sends X-Content-Type-Options: nosniff and Content-Disposition: inline.
   */
  async investorViewDeck(req: Request, res: Response): Promise<void> {
    const keyRow = resolveInvestorKey(req);
    if (!keyRow) { send401Investor(res, 'Missing or invalid investor key.'); return; }
    const id = String(req.params.id || '').trim();
    const listing = marketplaceListingRepo.findById(id);
    if (!listing || listing.status !== 'active') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Listing not available.' } });
      return;
    }
    const nda = ndaSignatureRepo.findByInvestorAndListing(keyRow.id, listing.id);
    if (!nda) {
      res.status(403).json({ error: { code: 'NDA_REQUIRED', message: 'Sign the NDA before viewing the deck.' } });
      return;
    }

    const filename = listing.customerName.replace(/[^A-Za-z0-9_-]+/g, '_') + '_deck.pdf';

    // Diagnostic state we accumulate so the 404 response can tell us WHY the
    // deck is missing (no PPTX vs conversion failed vs no fallback PDF).
    let pptxAbsPath: string | null = null;
    let pptxConversionError: string | null = null;

    const sub = partnerSubmissionRepo.getById(listing.submissionId);
    if (sub) {
      pptxAbsPath = resolveStoredPptx(buildPptxFileName(sub.customerName, sub.id));
      if (pptxAbsPath) {
        try {
          const buf = await getOrBuildAutoDeckPdf({ listingId: listing.id, pptxAbsPath });
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Cache-Control', 'private, max-age=300');
          res.end(buf);
          return;
        } catch (err) {
          pptxConversionError = err instanceof Error ? err.message : String(err);
          console.warn('[deck-view] auto-PPTX→PDF failed for listing ' + listing.id + ':', pptxConversionError);
        }
      }
    }

    // Fallback: customer-uploaded PDF (legacy path / safety net).
    if (listing.deckPdfPath) {
      const buf = readDeckPdf(listing.id);
      if (buf) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.end(buf);
        return;
      }
    }

    // Build the most diagnostic error message we can manage based on what
    // we observed above. The frontend surfaces this verbatim to the admin
    // (and to the investor in a friendly form).
    let detail: string;
    if (!sub) {
      detail = 'Submission record not found.';
    } else if (!pptxAbsPath) {
      detail = 'The customer\'s investor-deck PPTX has not been generated yet — admin needs to run Generate PPTX in Finance AI.';
    } else if (pptxConversionError) {
      detail = 'libreoffice conversion failed: ' + pptxConversionError.slice(0, 240);
    } else {
      detail = 'Deck PDF file not found.';
    }
    res.status(404).json({
      error: {
        code:   'DECK_MISSING',
        message: detail,
        diagnostics: {
          pptxOnDisk: !!pptxAbsPath,
          pptxConversionError,
          hasUploadedPdf: !!listing.deckPdfPath,
        },
      },
    });
  },

  /** GET /api/admin/system-check — reports presence of optional system deps
   *  (libreoffice) so we can confirm the Render image actually has what we
   *  need for PPTX → PDF auto-conversion. */
  adminSystemCheck(_req: Request, res: Response): void {
    res.json(runSystemCheck());
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Phase 4 — Agreements (admin view of signed NDAs)
  // Wired to the 'Agreements' tile under Authorized Personnel. Lists every
  // signed NDA with download + delete actions.
  // ────────────────────────────────────────────────────────────────────────────

  /** GET /api/admin/nda-signatures — list all signed NDAs (admin PIN required). */
  adminListNdaSignatures(_req: Request, res: Response): void {
    const rows = ndaSignatureRepo.listAll();
    res.json({
      signatures: rows.map(r => ({
        id:             r.id,
        investorKeyId:  r.investorKeyId,
        investorName:   r.investorName,
        listingId:      r.listingId,
        customerName:   r.customerName,
        fullName:       r.fullName,
        fundName:       r.fundName,
        title:          r.title,
        businessEmail:  r.businessEmail,
        signDate:       r.signDate,
        signedAt:       r.signedAt,
        signatureType:  r.signatureType,
        // Note: signatureValue (large base64 PNG for drawn) intentionally
        // omitted from the list payload — fetched only on the download path.
      })),
    });
  },

  /** GET /api/admin/nda-signatures/:id/pdf — populated NDA PDF download. */
  async adminDownloadNdaPdf(req: Request, res: Response): Promise<void> {
    const id = String(req.params.id || '').trim();
    const nda = ndaSignatureRepo.findById(id);
    if (!nda) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'NDA not found.' } });
      return;
    }
    try {
      const buf = await generatePopulatedNdaPdf(nda);
      const filename = ('VV_NDA_' + nda.fundName + '_' + nda.signDate)
        .replace(/[^A-Za-z0-9_-]+/g, '_') + '.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(buf);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF generation failed';
      res.status(500).json({ error: { code: 'PDF_FAILED', message: msg } });
    }
  },

  /** DELETE /api/admin/nda-signatures/:id — purge a signed NDA from the record. */
  adminDeleteNda(req: Request, res: Response): void {
    const id = String(req.params.id || '').trim();
    const nda = ndaSignatureRepo.findById(id);
    if (!nda) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'NDA not found.' } });
      return;
    }
    ndaSignatureRepo.delete(id);
    res.json({ ok: true });
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

  /**
   * PATCH /api/customer/me/submissions/:id
   * Header: X-Customer-Key
   * Body: { customerName?, formData }
   *
   * Customer-side edit of a previously-submitted Customer's Questionnaire.
   * Updates form_data and resets status to 'review' so Raphael re-finalizes
   * with the corrected inputs. Allowed regardless of current status (the
   * user explicitly wanted to be able to fix a finalized submission).
   */
  updateMySubmission(req: Request, res: Response): void {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }

    const sub = partnerSubmissionRepo.getById(req.params.id);
    if (!sub || sub.customerKeyId !== keyRow.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
      return;
    }

    const parsed = SubmissionBody.partial({ customerName: true }).safeParse(req.body);
    if (!parsed.success || typeof parsed.data.formData === 'undefined') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'formData is required.' } });
      return;
    }

    const updated = partnerSubmissionRepo.updateFormData(sub.id, parsed.data.formData);
    res.json({ success: true, submission: updated });
  },

  /**
   * POST /api/admin/chat/:agent
   * Header: X-Admin-Pin / ?pin=
   * Body: { message, history, submissionId? }
   *
   * Authorized-personnel chat where the chosen agent (any of the 5 finance
   * personas) is wired to all customer submissions. The system prompt
   * always includes a brief catalogue of every submission (id + name +
   * status); when submissionId is provided, the full xlsx dump + form
   * data are spliced in so the agent can speak to actual numbers when
   * Raphael consults on a specific customer.
   */
  async adminChat(req: Request, res: Response): Promise<void> {
    const agent = String(req.params.agent || '');
    const { message, history = [], submissionId } = (req.body || {}) as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      submissionId?: string;
    };
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'message is required.' } });
      return;
    }
    if (!Array.isArray(history)) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'history must be an array.' } });
      return;
    }

    // Always-on catalogue of all submissions so the agent knows what
    // customers Raphael can ask about, even before a specific one is
    // selected. Kept short — id, name, status, finalized timestamp.
    const allSubs = partnerSubmissionRepo.listAll();
    const catalogue = allSubs.length === 0
      ? '(No customer submissions on file yet.)'
      : allSubs.map(s => `- ${s.customerName || '(unnamed)'} — id=${s.id} · status=${s.status}${s.finalizedAt ? ` · finalized ${s.finalizedAt}` : ''}`).join('\n');

    let focusBlock = '';
    if (submissionId) {
      const sub = partnerSubmissionRepo.getById(submissionId);
      if (!sub) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Selected submission not found.' } });
        return;
      }
      const formDataDump = (() => {
        try { return JSON.stringify(sub.formData, null, 2); }
        catch { return '[unparseable form data]'; }
      })();
      let workbookDump = '[Finalized xlsx not on disk for this submission.]';
      if (sub.finalizedXlsxPath) {
        const abs = resolveStoredXlsx(sub.finalizedXlsxPath);
        if (abs && fs.existsSync(abs)) {
          try {
            workbookDump = readWorkbookAsText(abs).slice(0, 60_000);
          } catch (err) {
            workbookDump = `[Workbook read failed: ${(err as Error).message}]`;
          }
        }
      }
      focusBlock = [
        '',
        '=== FOCUSED CUSTOMER ===',
        `Customer: ${sub.customerName || '(unnamed)'} (id=${sub.id})`,
        `Status: ${sub.status}${sub.finalizedAt ? ` · finalized ${sub.finalizedAt}` : ''}`,
        '',
        '--- Questionnaire (formData) ---',
        formDataDump,
        '',
        '--- Financial Model workbook dump ---',
        workbookDump,
      ].join('\n');
    }

    const contextBlock = [
      'You are the Finance AI agent team for Vision & Virtue. You are speaking with Raphael (authorized personnel). Reference the submissions and numbers below when relevant.',
      '',
      '=== ALL CUSTOMER SUBMISSIONS ===',
      catalogue,
      focusBlock,
    ].join('\n');

    try {
      const reply = await getAIService().agentChatWithContext(
        agent,
        contextBlock,
        message.trim(),
        history,
      );
      res.json({ success: true, data: { reply, agent } });
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err && typeof (err as { status?: number }).status === 'number'
        ? (err as { status: number }).status
        : 502;
      res.status(status).json({
        error: { code: 'AI_ERROR', message: err instanceof Error ? err.message : String(err) },
      });
    }
  },

  /**
   * POST /api/customer/me/consult
   * Header: X-Customer-Key
   * Body: { message, history?, agent? = 'vc_expert' }
   *
   * Customer-facing consultation with Ethan Caldwell (or another configured
   * agent). The agent receives the customer's name + form data + finalized
   * workbook dump as system-prompt context so it can speak to actual
   * numbers — sector, growth, unit economics, margins, ARR, use of proceeds.
   *
   * Gated on a finalized submission: pre-finalize, customers shouldn't be
   * critiquing draft numbers with an AI VC.
   */
  async consultEthan(req: Request, res: Response): Promise<void> {
    const keyRow = resolveCustomerKey(req);
    if (!keyRow) { send401(res, 'Missing or invalid customer key.'); return; }

    const { message, history = [], agent = 'vc_expert' } = (req.body || {}) as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      agent?: string;
    };
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'message is required.' } });
      return;
    }
    if (message.trim().length > 4000) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'message must be 4000 characters or fewer.' } });
      return;
    }
    if (!Array.isArray(history)) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'history must be an array.' } });
      return;
    }

    const subs = partnerSubmissionRepo.listByCustomerKeyId(keyRow.id);
    const sub = subs[0] || null;
    if (!sub || sub.status !== 'finalized') {
      res.status(409).json({
        error: {
          code: 'NOT_FINALIZED',
          message: 'Consultation is available once Vision & Virtue finalizes your model and presentation.',
        },
      });
      return;
    }

    const customerName = sub.customerName || keyRow.customer_name || 'the customer';
    const formDataDump = (() => {
      try { return JSON.stringify(sub.formData, null, 2); }
      catch { return '[unparseable form data]'; }
    })();

    // Pull a workbook dump if the finalized xlsx is still on disk. Capped
    // so a giant model doesn't blow past the Claude tier window; the dump
    // is for context, not exhaustive citation.
    let workbookDump = '[Finalized xlsx not available on disk.]';
    if (sub.finalizedXlsxPath) {
      const abs = resolveStoredXlsx(sub.finalizedXlsxPath);
      if (abs && fs.existsSync(abs)) {
        try {
          workbookDump = readWorkbookAsText(abs).slice(0, 60_000);
        } catch (err) {
          workbookDump = `[Workbook read failed: ${(err as Error).message}]`;
        }
      }
    }

    const contextBlock = [
      `Customer name: ${customerName}`,
      `Submission id: ${sub.id}`,
      `Finalized at: ${sub.finalizedAt || 'unknown'}`,
      '',
      '--- Questionnaire (formData) ---',
      formDataDump,
      '',
      '--- Finalized Financial Model (workbook dump) ---',
      workbookDump,
    ].join('\n');

    try {
      const reply = await getAIService().agentChatWithContext(agent, contextBlock, message.trim(), history);
      res.json({ success: true, data: { reply, agent } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: { code: 'AI_ERROR', message: msg } });
    }
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
  // a ready-to-replace value map -- so it does the job Phase 4 (slide rewrite)
  // used to do for partially-filled slides. We disable Phase 4 here so each
  // PPTX generate makes just one Claude call instead of two. That keeps us
  // comfortably under the 30K-input-tokens/minute Anthropic tier limit.
  const pptxStats = await generatePopulatedPptx({
    templatePptxPath: pptxTemplatePath(),
    customerXlsxPath: xlsxAbsPath,
    outputPptxPath:   outFile,
    customerKeyId,
    aiRewrite:        false,
  });
  return { ...pptxStats, ai: null };
}

// Silence unused-import warning when path lib isn't used anywhere else.
void path;
