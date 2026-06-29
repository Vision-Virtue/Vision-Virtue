import { Router, Request, Response, NextFunction, raw } from 'express';
import { contentController } from '../controllers/content.controller';
import { linkedInController } from '../controllers/linkedin.controller';
import { authController, verifyPin } from '../controllers/auth.controller';
import { chatController } from '../controllers/chat.controller';
import { capitaflowController } from '../controllers/capitaflow.controller';
import { visibilityController, budgetsController, salariesController, rcController, cashFlowController, cfPayablesController, cfReceivablesController, cfInventoryController, cfSalariesController, cfManualController, cfForecastController, cfoChatController } from '../controllers/visibility.controller';
import { requireRaphael, requireLinkedIn, requireAdminPin } from '../middleware/auth.middleware';

const router = Router();

// ─── Helper: wrap async route handlers to forward errors ─────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── Health Check ─────────────────────────────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'vv-marketing-backend',
    version: '1.0.0',
  });
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────

router.get('/auth/status', (_req: Request, res: Response) => authController.getStatus(_req, res));

router.post('/auth/verify-pin', asyncHandler(async (req, res) => { verifyPin(req, res); }));

router.get('/auth/linkedin', (req: Request, res: Response) =>
  authController.startLinkedInAuth(req, res),
);

router.get(
  '/auth/linkedin/callback',
  asyncHandler((req, res) => authController.linkedInCallback(req, res)),
);

router.delete('/auth/linkedin', (_req: Request, res: Response) =>
  authController.disconnectLinkedIn(_req, res),
);

// ─── Content Routes ───────────────────────────────────────────────────────────

// List all content items
router.get('/content', asyncHandler((req, res) => contentController.getAll(req, res)));

// Create a new topic
router.post('/content', asyncHandler((req, res) => contentController.createTopic(req, res)));

// Get a specific content item (with audit history)
router.get('/content/:id', asyncHandler((req, res) => contentController.getById(req, res)));

// Generate economist brief
router.post(
  '/content/:id/economist-brief',
  asyncHandler((req, res) => contentController.generateEconomistBrief(req, res)),
);

// Generate marketing draft
router.post(
  '/content/:id/marketing-draft',
  asyncHandler((req, res) => contentController.createMarketingDraft(req, res)),
);

// Submit for VP review
router.post(
  '/content/:id/vp-review',
  asyncHandler((req, res) => contentController.requestVpReview(req, res)),
);

// VP self-edit after 3 revision cycles
router.post(
  '/content/:id/vp-self-edit',
  asyncHandler((req, res) => contentController.vpSelfEdit(req, res)),
);

// Request Raphael approval (after VP approves)
router.post(
  '/content/:id/request-approval',
  asyncHandler((req, res) => contentController.requestApproval(req, res)),
);

// Raphael approves — requireRaphael checks passcode
router.post(
  '/content/:id/approve',
  requireRaphael,
  asyncHandler((req, res) => contentController.approve(req, res)),
);

// Raphael rejects — requireRaphael checks passcode
router.post(
  '/content/:id/reject',
  requireRaphael,
  asyncHandler((req, res) => contentController.reject(req, res)),
);

// Ask the Economist a question (Raphael only — requires passcode)
router.post(
  '/content/:id/ask-economist',
  requireRaphael,
  asyncHandler((req, res) => contentController.askEconomist(req, res)),
);

// Raphael returns annotated posts to VP for corrections (requires passcode)
router.post(
  '/content/:id/return-to-vp',
  requireRaphael,
  asyncHandler((req, res) => contentController.returnToVp(req, res)),
);

// VP applies AI corrections and sends back to Raphael
router.post(
  '/content/:id/vp-correct',
  asyncHandler((req, res) => contentController.vpCorrect(req, res)),
);

// Publish to LinkedIn
router.post(
  '/content/:id/publish',
  asyncHandler((req, res) => contentController.publish(req, res)),
);

// Reset PUBLISHED → APPROVED_FOR_PUBLISHING so publish can be retried
router.post(
  '/content/:id/reset-for-publish',
  asyncHandler((req, res) => contentController.resetForPublish(req, res)),
);

// ─── Direct Agent Chat ────────────────────────────────────────────────────────

router.post(
  '/chat/:agent',
  asyncHandler((req, res) => chatController.directChat(req, res)),
);

// ─── CapitaFlow Customer Area (Phase 2A) ────────────────────────────────────────

// Validate a customer key and return basic info
router.post('/customer/auth', (req, res) => capitaflowController.auth(req, res));

// Validate an investor key (Investors Marketplace gate). Same shape as
// /customer/auth but checked against the investor_keys table.
router.post('/investor/auth', (req, res) => capitaflowController.investorAuth(req, res));

// Investors Marketplace — listings (investor-facing, gated by X-Investor-Key)
router.get('/investor/marketplace/listings',     (req, res) => capitaflowController.investorListListings(req, res));
router.get('/investor/marketplace/listings/:id', (req, res) => capitaflowController.investorGetListing(req, res));

// Investors Marketplace — customer publish / withdraw (gated by X-Customer-Key)
router.post(
  '/customer/me/marketplace-listings',
  asyncHandler(async (req, res) => { await capitaflowController.customerPublishListing(req, res); }),
);
router.get('/customer/me/marketplace-listings', (req, res) => capitaflowController.customerListMyListings(req, res));
router.post(
  '/customer/me/marketplace-listings/:id/withdraw',
  (req, res) => capitaflowController.customerWithdrawListing(req, res),
);

// Investors Marketplace — preview the auto-extracted tile fields without
// publishing. Drives the CapitaFlow-area preview before the customer clicks Publish.
router.get(
  '/customer/me/marketplace-preview',
  asyncHandler(async (req, res) => { await capitaflowController.customerPreviewListing(req, res); }),
);

// Investors Marketplace — Customer uploads the view-only investor deck PDF
// (raw body, application/pdf only). Gated by X-Customer-Key.
router.post(
  '/customer/me/marketplace-listings/:id/deck-pdf',
  raw({ type: 'application/pdf', limit: '30mb' }),
  (req, res) => capitaflowController.customerUploadDeckPdf(req, res),
);

// Investors Marketplace — NDA flow (gated by X-Investor-Key)
router.post('/investor/nda/sign',    (req, res) => capitaflowController.investorSignNda(req, res));
router.get( '/investor/nda/status',  (req, res) => capitaflowController.investorNdaStatus(req, res));
// Returns the Office Online Viewer iframe URL for the customer's PPTX.
router.get(
  '/investor/marketplace/listings/:id/deck-info',
  (req, res) => capitaflowController.investorGetDeckInfo(req, res),
);

// Public PPTX serving endpoint — gated by an HMAC-signed token, NOT a
// header. Microsoft Office Online fetches this URL once when loading the
// iframe; outside the token's TTL (10 min) the URL is dead.
router.get(
  '/marketplace/deck-pptx/:token',
  (req, res) => capitaflowController.marketplaceServeDeckPptx(req, res),
);

// Public logo for a marketplace tile. Listing must be active. The image
// itself was uploaded by the customer via the deck-upload (drag&drop) flow
// and selected by the publish handler. No auth header required — logos are
// the public-facing identifier of the listing.
router.get(
  '/marketplace/listings/:id/logo',
  (req, res) => capitaflowController.marketplaceServeLogo(req, res),
);

// Investor-deck placeholder schema — used by the customer questionnaire UI
// to render the deck-specific sections. Single source of truth shared with
// the xlsx writer.
router.get('/customer/deck-schema', (req, res) => capitaflowController.deckSchema(req, res));

// Investor-deck asset upload — raw image bytes. Each image MIME we accept
// is registered with the raw-body parser; multipart isn't used here.
const DECK_ASSET_MIMES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif',
];
router.post(
  '/customer/deck-asset',
  raw({ type: DECK_ASSET_MIMES, limit: '10mb' }),
  (req, res) => capitaflowController.deckAssetUpload(req, res),
);
router.get('/customer/deck-asset/:fileName', (req, res) => capitaflowController.deckAssetServe(req, res));

// Investor-deck validation — checks the customer's questionnaire side
// (required fields, image uploads). Calculations side validated separately.
router.get(
  '/customer/me/submissions/:id/deck-validation',
  (req, res) => capitaflowController.deckValidation(req, res),
);

// ─── Customer drag-and-drop uploads (PDF/DOCX/PPTX/XLSX) ──────────────────
// Raw-body uploads — same pattern as deck-asset, no multer needed.
const DECK_UPLOAD_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // browsers sometimes send this for less-common MIMEs
  // Images — used as logos on the marketplace tile (and, where the customer
  // has not otherwise set companyLogo, on the investor-deck cover).
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];
router.post(
  '/customer/deck-upload',
  raw({ type: DECK_UPLOAD_MIMES, limit: '30mb' }),
  (req, res) => capitaflowController.deckUploadCreate(req, res),
);
router.get('/customer/deck-upload',                  (req, res) => capitaflowController.deckUploadList(req, res));
router.get('/customer/deck-upload/:fileId',          (req, res) => capitaflowController.deckUploadDownload(req, res));
router.delete('/customer/deck-upload/:fileId',       (req, res) => capitaflowController.deckUploadDelete(req, res));

// Admin views of a submission's uploads
router.get(
  '/admin/submissions/:id/uploads',
  requireAdminPin,
  (req, res) => capitaflowController.adminListUploads(req, res),
);
router.get(
  '/admin/submissions/:id/uploads/:fileId',
  requireAdminPin,
  (req, res) => capitaflowController.adminDownloadUpload(req, res),
);
router.post(
  '/admin/submissions/:id/uploads/:fileId/extract',
  requireAdminPin,
  asyncHandler(async (req, res) => { await capitaflowController.adminExtractUpload(req, res); }),
);

// Submit a Customer's Questionnaire (header X-Customer-Key required)
router.post('/submissions', asyncHandler(async (req, res) => { await capitaflowController.createSubmission(req, res); }));

// List the authenticated customer's submissions
router.get('/customer/me/submissions', (req, res) => capitaflowController.listMySubmissions(req, res));

// Customer fetches one of their own submissions in full (incl. formData).
router.get('/customer/me/submissions/:id', (req, res) => capitaflowController.getMySubmission(req, res));

// Customer downloads their own finalized xlsx
router.get('/customer/me/submissions/:id/xlsx', (req, res) => capitaflowController.downloadMyXlsx(req, res));

// Customer downloads their own populated investor-deck pptx
router.get('/customer/me/submissions/:id/pptx', (req, res) => capitaflowController.downloadMyPptx(req, res));

// Customer-side edit of their own submission (resets status to 'review').
router.patch('/customer/me/submissions/:id', (req, res) => capitaflowController.updateMySubmission(req, res));

// Customer-facing consultation with Ethan Caldwell (live to finalized data).
router.post('/customer/me/consult', asyncHandler(async (req, res) => { await capitaflowController.consultEthan(req, res); }));

// Public count of pending submissions — used by the homepage notification
// badge on the Authorized Personnel button. Returns just `{ pending: N }`,
// no PII, so it doesn't need auth.
router.get('/notifications/pending-count', (req, res) => capitaflowController.adminPendingCount(req, res));

// ─── Visibility offering — Phase 1: Financial Structure ────────────────────

router.get(
  '/visibility/dropdowns',
  (req, res) => visibilityController.dropdowns(req, res),
);
router.get(
  '/visibility/financial-structure',
  (req, res) => visibilityController.getFinancialStructure(req, res),
);
// Raw upload for the GL file. Customer key arrives via ?key= so we don't
// trigger a CORS preflight on a binary POST.
router.post(
  '/visibility/gl/upload',
  raw({ type: '*/*', limit: '5mb' }),
  asyncHandler(async (req, res) => { await visibilityController.uploadGL(req, res); }),
);
router.patch(
  '/visibility/gl/:id',
  (req, res) => visibilityController.updateGL(req, res),
);
router.delete(
  '/visibility/gl/:id',
  (req, res) => visibilityController.deleteGL(req, res),
);
router.post(
  '/visibility/financial-structure/complete',
  (req, res) => visibilityController.completeFinancialStructure(req, res),
);
router.post(
  '/visibility/financial-structure/edit',
  (req, res) => visibilityController.editFinancialStructure(req, res),
);

// Phase 2 — Organizational Structure.
router.get(
  '/visibility/org-structure',
  (req, res) => visibilityController.getOrgStructure(req, res),
);
router.post(
  '/visibility/org-structure/entities',
  (req, res) => visibilityController.createOrgEntity(req, res),
);
router.patch(
  '/visibility/org-structure/entities/:id',
  (req, res) => visibilityController.renameOrgEntity(req, res),
);
router.delete(
  '/visibility/org-structure/entities/:id',
  (req, res) => visibilityController.deleteOrgEntity(req, res),
);
router.get(
  '/visibility/org-structure/entities/:id/references',
  (req, res) => visibilityController.getOrgEntityReferences(req, res),
);
router.post(
  '/visibility/org-structure/complete',
  (req, res) => visibilityController.completeOrgStructure(req, res),
);
router.post(
  '/visibility/org-structure/edit',
  (req, res) => visibilityController.editOrgStructure(req, res),
);

// Phase 3a — Budgets.
router.get(   '/visibility/budgets',                          (req, res) => budgetsController.list(req, res));
router.post(  '/visibility/budgets',                          (req, res) => budgetsController.create(req, res));
router.get(   '/visibility/budgets/:id',                      (req, res) => budgetsController.get(req, res));
router.patch( '/visibility/budgets/:id',                      (req, res) => budgetsController.patch(req, res));
router.delete('/visibility/budgets/:id',                      (req, res) => budgetsController.remove(req, res));
router.post(  '/visibility/budgets/:id/finalize',             (req, res) => budgetsController.finalize(req, res));
router.post(  '/visibility/budgets/:id/lines',                (req, res) => budgetsController.createLine(req, res));
router.patch( '/visibility/budgets/:id/lines/:lineId',        (req, res) => budgetsController.patchLine(req, res));
router.delete('/visibility/budgets/:id/lines/:lineId',        (req, res) => budgetsController.removeLine(req, res));

// Phase 3c — Personal area: P&L Pivot view + Export to Excel.
router.get(
  '/visibility/budgets/:id/pivot',
  (req, res) => budgetsController.getPivot(req, res),
);
router.get(
  '/visibility/budgets/:id/export',
  asyncHandler(async (req, res) => { await budgetsController.exportXlsx(req, res); }),
);

// Phase 3b — Salaries & Benefits (per budget).
router.get(   '/visibility/budgets/:id/salaries',                  (req, res) => salariesController.list(req, res));
router.post(  '/visibility/budgets/:id/salaries',                  (req, res) => salariesController.createRow(req, res));
router.patch( '/visibility/budgets/:id/salaries/:rowId',           (req, res) => salariesController.patchRow(req, res));
router.delete('/visibility/budgets/:id/salaries/:rowId',           (req, res) => salariesController.removeRow(req, res));
router.post(
  '/visibility/budgets/:id/salaries/upload',
  raw({ type: '*/*', limit: '5mb' }),
  asyncHandler(async (req, res) => { await salariesController.upload(req, res); }),
);
router.post(  '/visibility/budgets/:id/salaries/finalize',         (req, res) => salariesController.finalize(req, res));
router.post(  '/visibility/budgets/:id/salaries/edit',             (req, res) => salariesController.edit(req, res));

// Phase 3c — Revenues & COGS (per budget).
router.get(   '/visibility/budgets/:id/rc',                        (req, res) => rcController.list(req, res));
router.post(  '/visibility/budgets/:id/rc',                        (req, res) => rcController.createRow(req, res));
router.patch( '/visibility/budgets/:id/rc/:rowId',                 (req, res) => rcController.patchRow(req, res));
router.delete('/visibility/budgets/:id/rc/:rowId',                 (req, res) => rcController.removeRow(req, res));
router.post(  '/visibility/budgets/:id/rc/finalize',               (req, res) => rcController.finalize(req, res));
router.post(  '/visibility/budgets/:id/rc/edit',                   (req, res) => rcController.edit(req, res));

// ─── CF (Cash Flow) — spec §15 ──────────────────────────────────────────────
router.get(   '/visibility/budgets/:id/cf',                        (req, res) => cashFlowController.getOrCreate(req, res));
router.patch( '/visibility/budgets/:id/cf',                        (req, res) => cashFlowController.patch(req, res));

// CF — Payables (spec §3)
router.get(    '/visibility/budgets/:id/cf/payables',                 (req, res) => cfPayablesController.get(req, res));
router.patch(  '/visibility/budgets/:id/cf/payables',                 (req, res) => cfPayablesController.patchSection(req, res));
router.patch(  '/visibility/budgets/:id/cf/payables/rows/:rowId',     (req, res) => cfPayablesController.patchRow(req, res));
router.delete( '/visibility/budgets/:id/cf/payables/rows/:rowId',     (req, res) => cfPayablesController.deleteRow(req, res));

// CF — Receivables (spec §4)
router.get(    '/visibility/budgets/:id/cf/receivables',              (req, res) => cfReceivablesController.get(req, res));
router.patch(  '/visibility/budgets/:id/cf/receivables',              (req, res) => cfReceivablesController.patchSection(req, res));
router.patch(  '/visibility/budgets/:id/cf/receivables/rows/:rowId',  (req, res) => cfReceivablesController.patchRow(req, res));
router.delete( '/visibility/budgets/:id/cf/receivables/rows/:rowId',  (req, res) => cfReceivablesController.deleteRow(req, res));

// CF — Inventory (spec §5)
router.get(   '/visibility/budgets/:id/cf/inventory',                 (req, res) => cfInventoryController.get(req, res));
router.patch( '/visibility/budgets/:id/cf/inventory',                 (req, res) => cfInventoryController.patch(req, res));

// CF — Salaries & Benefits (spec §6)
router.get(   '/visibility/budgets/:id/cf/salaries',                  (req, res) => cfSalariesController.get(req, res));
router.patch( '/visibility/budgets/:id/cf/salaries',                  (req, res) => cfSalariesController.patch(req, res));

// CF — Manual sections: Other Adjustments / Financing / Capex (spec §7 / §8 / §9)
router.get(    '/visibility/budgets/:id/cf/manual/:kind',                  (req, res) => cfManualController.get(req, res));
router.post(   '/visibility/budgets/:id/cf/manual/:kind',                  (req, res) => cfManualController.create(req, res));
router.patch(  '/visibility/budgets/:id/cf/manual/:kind/rows/:rowId',      (req, res) => cfManualController.patchRow(req, res));
router.delete( '/visibility/budgets/:id/cf/manual/:kind/rows/:rowId',      (req, res) => cfManualController.deleteRow(req, res));

// CF — Forecast (spec §11 + §12)
router.get( '/visibility/budgets/:id/cf/forecast',                         (req, res) => cfForecastController.get(req, res));

// CFO Visibility Chat
router.post(
  '/visibility/cfo/chat',
  asyncHandler(async (req, res) => { await cfoChatController.chat(req, res); }),
);

// ─── Admin (Raphael) — CapitaFlow Submissions ──────────────────────────────────
// All admin endpoints require X-Admin-Pin header OR ?pin= query (matching
// ACCESS_CODE). Query-param form lets the frontend send simple CORS
// requests with no preflight.

// Self-test: a tiny endpoint that just confirms the admin PIN is good.
// Used by the frontend / for manual diagnosis.
router.get(
  '/admin/me',
  requireAdminPin,
  (_req, res) => res.json({ ok: true, role: 'admin' }),
);

router.get(
  '/admin/submissions',
  requireAdminPin,
  (req, res) => capitaflowController.adminListSubmissions(req, res),
);
router.get(
  '/admin/submissions/:id',
  requireAdminPin,
  (req, res) => capitaflowController.adminGetSubmission(req, res),
);
router.post(
  '/admin/submissions/:id/finalize',
  requireAdminPin,
  asyncHandler(async (req, res) => { await capitaflowController.adminFinalize(req, res); }),
);
router.post(
  '/admin/submissions/:id/generate-xlsx',
  requireAdminPin,
  asyncHandler(async (req, res) => { await capitaflowController.adminGenerateXlsx(req, res); }),
);
// (Re)generate the populated investor-deck pptx from the current xlsx.
router.post(
  '/admin/submissions/:id/generate-pptx',
  requireAdminPin,
  asyncHandler(async (req, res) => { await capitaflowController.adminGeneratePptx(req, res); }),
);
router.get(
  '/admin/submissions/:id/pptx',
  requireAdminPin,
  (req, res) => capitaflowController.adminDownloadPptx(req, res),
);
// Reupload — admin overwrites the stored xlsx with a manually-edited file.
// raw() takes the place of express.json() for this one route so we can
// receive the binary body. Cap at 15 MB to leave headroom over the ~3 MB
// template size while still rejecting absurdly large uploads.
router.post(
  '/admin/submissions/:id/upload-xlsx',
  requireAdminPin,
  raw({ type: '*/*', limit: '15mb' }),
  (req, res) => capitaflowController.adminUploadXlsx(req, res),
);
// Reupload — admin overwrites the stored pptx with a manually-edited deck.
router.post(
  '/admin/submissions/:id/upload-pptx',
  requireAdminPin,
  raw({ type: '*/*', limit: '25mb' }),
  (req, res) => capitaflowController.adminUploadPptx(req, res),
);
// Edit — flip a finalized submission back to 'review' for corrections.
router.post(
  '/admin/submissions/:id/unfinalize',
  requireAdminPin,
  (req, res) => capitaflowController.adminUnfinalize(req, res),
);
// Admin chat — finance agents wired to all submitted customer data.
router.post(
  '/admin/chat/:agent',
  requireAdminPin,
  asyncHandler(async (req, res) => { await capitaflowController.adminChat(req, res); }),
);
router.get(
  '/admin/submissions/:id/xlsx',
  requireAdminPin,
  (req, res) => capitaflowController.adminDownloadXlsx(req, res),
);
router.get(
  '/admin/notifications/count',
  requireAdminPin,
  (req, res) => capitaflowController.adminPendingCount(req, res),
);
router.post(
  '/admin/customer-keys',
  requireAdminPin,
  (req, res) => capitaflowController.adminCreateKey(req, res),
);
router.get(
  '/admin/customer-keys',
  requireAdminPin,
  (req, res) => capitaflowController.adminListKeys(req, res),
);
router.patch(
  '/admin/customer-keys/:id',
  requireAdminPin,
  (req, res) => capitaflowController.adminUpdateKeyOfferings(req, res),
);
router.delete(
  '/admin/customer-keys/:id',
  requireAdminPin,
  (req, res) => capitaflowController.adminDeleteCustomerKey(req, res),
);
// Data subject rights (Israeli PPL / GDPR): export everything for one customer
// as a single JSON file. Admin-only, requires admin PIN.
router.get(
  '/admin/customer-keys/:id/export',
  requireAdminPin,
  (req, res) => capitaflowController.adminExportCustomerData(req, res),
);

// Admin diagnostic: confirms libreoffice (and other optional system deps)
// are actually available in the Render image.
router.get(
  '/admin/system-check',
  requireAdminPin,
  (req, res) => capitaflowController.adminSystemCheck(req, res),
);

// Admin security: recent auth failures, lockouts, agent rate-limit hits,
// data-export volume anomalies. Backed by the security_events table.
router.get(
  '/admin/security-events',
  requireAdminPin,
  (req, res) => capitaflowController.adminSecurityEvents(req, res),
);

// ─── Admin: Investor Keys (Investors Marketplace) ────────────────────────────
router.post(
  '/admin/investor-keys',
  requireAdminPin,
  (req, res) => capitaflowController.adminCreateInvestorKey(req, res),
);
router.get(
  '/admin/investor-keys',
  requireAdminPin,
  (req, res) => capitaflowController.adminListInvestorKeys(req, res),
);
router.post(
  '/admin/investor-keys/:id/revoke',
  requireAdminPin,
  (req, res) => capitaflowController.adminRevokeInvestorKey(req, res),
);
router.delete(
  '/admin/investor-keys/:id',
  requireAdminPin,
  (req, res) => capitaflowController.adminDeleteInvestorKey(req, res),
);

// ─── Admin: Agreements (signed NDAs from the Investors Marketplace) ──────────
router.get(
  '/admin/nda-signatures',
  requireAdminPin,
  (req, res) => capitaflowController.adminListNdaSignatures(req, res),
);
router.get(
  '/admin/nda-signatures/:id/pdf',
  requireAdminPin,
  asyncHandler(async (req, res) => { await capitaflowController.adminDownloadNdaPdf(req, res); }),
);
router.delete(
  '/admin/nda-signatures/:id',
  requireAdminPin,
  (req, res) => capitaflowController.adminDeleteNda(req, res),
);

// ─── LinkedIn Routes ──────────────────────────────────────────────────────────

// Get organization profile (cached or live)
router.get(
  '/linkedin/profile',
  requireLinkedIn,
  asyncHandler((req, res) => linkedInController.getProfile(req, res)),
);

// AI review of the profile
router.post(
  '/linkedin/review-profile',
  requireLinkedIn,
  asyncHandler((_req, res) => linkedInController.reviewProfile(_req, res)),
);

// Update organization profile
router.put(
  '/linkedin/profile',
  requireLinkedIn,
  asyncHandler((req, res) => linkedInController.updateProfile(req, res)),
);

// Get post analytics
router.get(
  '/linkedin/analytics/:postId',
  requireLinkedIn,
  asyncHandler((req, res) => linkedInController.getAnalytics(req, res)),
);

export default router;
