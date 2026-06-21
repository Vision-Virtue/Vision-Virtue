"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const content_controller_1 = require("../controllers/content.controller");
const linkedin_controller_1 = require("../controllers/linkedin.controller");
const auth_controller_1 = require("../controllers/auth.controller");
const chat_controller_1 = require("../controllers/chat.controller");
const capitaflow_controller_1 = require("../controllers/capitaflow.controller");
const visibility_controller_1 = require("../controllers/visibility.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// ─── Helper: wrap async route handlers to forward errors ─────────────────────
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
// ─── Health Check ─────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'vv-marketing-backend',
        version: '1.0.0',
    });
});
// ─── Auth Routes ──────────────────────────────────────────────────────────────
router.get('/auth/status', (_req, res) => auth_controller_1.authController.getStatus(_req, res));
router.post('/auth/verify-pin', asyncHandler(async (req, res) => { (0, auth_controller_1.verifyPin)(req, res); }));
router.get('/auth/linkedin', (req, res) => auth_controller_1.authController.startLinkedInAuth(req, res));
router.get('/auth/linkedin/callback', asyncHandler((req, res) => auth_controller_1.authController.linkedInCallback(req, res)));
router.delete('/auth/linkedin', (_req, res) => auth_controller_1.authController.disconnectLinkedIn(_req, res));
// ─── Content Routes ───────────────────────────────────────────────────────────
// List all content items
router.get('/content', asyncHandler((req, res) => content_controller_1.contentController.getAll(req, res)));
// Create a new topic
router.post('/content', asyncHandler((req, res) => content_controller_1.contentController.createTopic(req, res)));
// Get a specific content item (with audit history)
router.get('/content/:id', asyncHandler((req, res) => content_controller_1.contentController.getById(req, res)));
// Generate economist brief
router.post('/content/:id/economist-brief', asyncHandler((req, res) => content_controller_1.contentController.generateEconomistBrief(req, res)));
// Generate marketing draft
router.post('/content/:id/marketing-draft', asyncHandler((req, res) => content_controller_1.contentController.createMarketingDraft(req, res)));
// Submit for VP review
router.post('/content/:id/vp-review', asyncHandler((req, res) => content_controller_1.contentController.requestVpReview(req, res)));
// VP self-edit after 3 revision cycles
router.post('/content/:id/vp-self-edit', asyncHandler((req, res) => content_controller_1.contentController.vpSelfEdit(req, res)));
// Request Raphael approval (after VP approves)
router.post('/content/:id/request-approval', asyncHandler((req, res) => content_controller_1.contentController.requestApproval(req, res)));
// Raphael approves — requireRaphael checks passcode
router.post('/content/:id/approve', auth_middleware_1.requireRaphael, asyncHandler((req, res) => content_controller_1.contentController.approve(req, res)));
// Raphael rejects — requireRaphael checks passcode
router.post('/content/:id/reject', auth_middleware_1.requireRaphael, asyncHandler((req, res) => content_controller_1.contentController.reject(req, res)));
// Ask the Economist a question (Raphael only — requires passcode)
router.post('/content/:id/ask-economist', auth_middleware_1.requireRaphael, asyncHandler((req, res) => content_controller_1.contentController.askEconomist(req, res)));
// Raphael returns annotated posts to VP for corrections (requires passcode)
router.post('/content/:id/return-to-vp', auth_middleware_1.requireRaphael, asyncHandler((req, res) => content_controller_1.contentController.returnToVp(req, res)));
// VP applies AI corrections and sends back to Raphael
router.post('/content/:id/vp-correct', asyncHandler((req, res) => content_controller_1.contentController.vpCorrect(req, res)));
// Publish to LinkedIn
router.post('/content/:id/publish', asyncHandler((req, res) => content_controller_1.contentController.publish(req, res)));
// Reset PUBLISHED → APPROVED_FOR_PUBLISHING so publish can be retried
router.post('/content/:id/reset-for-publish', asyncHandler((req, res) => content_controller_1.contentController.resetForPublish(req, res)));
// ─── Direct Agent Chat ────────────────────────────────────────────────────────
router.post('/chat/:agent', asyncHandler((req, res) => chat_controller_1.chatController.directChat(req, res)));
// ─── CapitaFlow Customer Area (Phase 2A) ────────────────────────────────────────
// Validate a customer key and return basic info
router.post('/customer/auth', (req, res) => capitaflow_controller_1.capitaflowController.auth(req, res));
// Validate an investor key (Investors Marketplace gate). Same shape as
// /customer/auth but checked against the investor_keys table.
router.post('/investor/auth', (req, res) => capitaflow_controller_1.capitaflowController.investorAuth(req, res));
// Investors Marketplace — listings (investor-facing, gated by X-Investor-Key)
router.get('/investor/marketplace/listings', (req, res) => capitaflow_controller_1.capitaflowController.investorListListings(req, res));
router.get('/investor/marketplace/listings/:id', (req, res) => capitaflow_controller_1.capitaflowController.investorGetListing(req, res));
// Investors Marketplace — customer publish / withdraw (gated by X-Customer-Key)
router.post('/customer/me/marketplace-listings', asyncHandler(async (req, res) => { await capitaflow_controller_1.capitaflowController.customerPublishListing(req, res); }));
router.get('/customer/me/marketplace-listings', (req, res) => capitaflow_controller_1.capitaflowController.customerListMyListings(req, res));
router.post('/customer/me/marketplace-listings/:id/withdraw', (req, res) => capitaflow_controller_1.capitaflowController.customerWithdrawListing(req, res));
// Investors Marketplace — preview the auto-extracted tile fields without
// publishing. Drives the CapitaFlow-area preview before the customer clicks Publish.
router.get('/customer/me/marketplace-preview', asyncHandler(async (req, res) => { await capitaflow_controller_1.capitaflowController.customerPreviewListing(req, res); }));
// Investors Marketplace — Customer uploads the view-only investor deck PDF
// (raw body, application/pdf only). Gated by X-Customer-Key.
router.post('/customer/me/marketplace-listings/:id/deck-pdf', (0, express_1.raw)({ type: 'application/pdf', limit: '30mb' }), (req, res) => capitaflow_controller_1.capitaflowController.customerUploadDeckPdf(req, res));
// Investors Marketplace — NDA flow (gated by X-Investor-Key)
router.post('/investor/nda/sign', (req, res) => capitaflow_controller_1.capitaflowController.investorSignNda(req, res));
router.get('/investor/nda/status', (req, res) => capitaflow_controller_1.capitaflowController.investorNdaStatus(req, res));
// Returns the Office Online Viewer iframe URL for the customer's PPTX.
router.get('/investor/marketplace/listings/:id/deck-info', (req, res) => capitaflow_controller_1.capitaflowController.investorGetDeckInfo(req, res));
// Public PPTX serving endpoint — gated by an HMAC-signed token, NOT a
// header. Microsoft Office Online fetches this URL once when loading the
// iframe; outside the token's TTL (10 min) the URL is dead.
router.get('/marketplace/deck-pptx/:token', (req, res) => capitaflow_controller_1.capitaflowController.marketplaceServeDeckPptx(req, res));
// Public logo for a marketplace tile. Listing must be active. The image
// itself was uploaded by the customer via the deck-upload (drag&drop) flow
// and selected by the publish handler. No auth header required — logos are
// the public-facing identifier of the listing.
router.get('/marketplace/listings/:id/logo', (req, res) => capitaflow_controller_1.capitaflowController.marketplaceServeLogo(req, res));
// Investor-deck placeholder schema — used by the customer questionnaire UI
// to render the deck-specific sections. Single source of truth shared with
// the xlsx writer.
router.get('/customer/deck-schema', (req, res) => capitaflow_controller_1.capitaflowController.deckSchema(req, res));
// Investor-deck asset upload — raw image bytes. Each image MIME we accept
// is registered with the raw-body parser; multipart isn't used here.
const DECK_ASSET_MIMES = [
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif',
];
router.post('/customer/deck-asset', (0, express_1.raw)({ type: DECK_ASSET_MIMES, limit: '10mb' }), (req, res) => capitaflow_controller_1.capitaflowController.deckAssetUpload(req, res));
router.get('/customer/deck-asset/:fileName', (req, res) => capitaflow_controller_1.capitaflowController.deckAssetServe(req, res));
// Investor-deck validation — checks the customer's questionnaire side
// (required fields, image uploads). Calculations side validated separately.
router.get('/customer/me/submissions/:id/deck-validation', (req, res) => capitaflow_controller_1.capitaflowController.deckValidation(req, res));
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
router.post('/customer/deck-upload', (0, express_1.raw)({ type: DECK_UPLOAD_MIMES, limit: '30mb' }), (req, res) => capitaflow_controller_1.capitaflowController.deckUploadCreate(req, res));
router.get('/customer/deck-upload', (req, res) => capitaflow_controller_1.capitaflowController.deckUploadList(req, res));
router.get('/customer/deck-upload/:fileId', (req, res) => capitaflow_controller_1.capitaflowController.deckUploadDownload(req, res));
router.delete('/customer/deck-upload/:fileId', (req, res) => capitaflow_controller_1.capitaflowController.deckUploadDelete(req, res));
// Admin views of a submission's uploads
router.get('/admin/submissions/:id/uploads', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminListUploads(req, res));
router.get('/admin/submissions/:id/uploads/:fileId', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminDownloadUpload(req, res));
router.post('/admin/submissions/:id/uploads/:fileId/extract', auth_middleware_1.requireAdminPin, asyncHandler(async (req, res) => { await capitaflow_controller_1.capitaflowController.adminExtractUpload(req, res); }));
// Submit a Customer's Questionnaire (header X-Customer-Key required)
router.post('/submissions', asyncHandler(async (req, res) => { await capitaflow_controller_1.capitaflowController.createSubmission(req, res); }));
// List the authenticated customer's submissions
router.get('/customer/me/submissions', (req, res) => capitaflow_controller_1.capitaflowController.listMySubmissions(req, res));
// Customer fetches one of their own submissions in full (incl. formData).
router.get('/customer/me/submissions/:id', (req, res) => capitaflow_controller_1.capitaflowController.getMySubmission(req, res));
// Customer downloads their own finalized xlsx
router.get('/customer/me/submissions/:id/xlsx', (req, res) => capitaflow_controller_1.capitaflowController.downloadMyXlsx(req, res));
// Customer downloads their own populated investor-deck pptx
router.get('/customer/me/submissions/:id/pptx', (req, res) => capitaflow_controller_1.capitaflowController.downloadMyPptx(req, res));
// Customer-side edit of their own submission (resets status to 'review').
router.patch('/customer/me/submissions/:id', (req, res) => capitaflow_controller_1.capitaflowController.updateMySubmission(req, res));
// Customer-facing consultation with Ethan Caldwell (live to finalized data).
router.post('/customer/me/consult', asyncHandler(async (req, res) => { await capitaflow_controller_1.capitaflowController.consultEthan(req, res); }));
// Public count of pending submissions — used by the homepage notification
// badge on the Authorized Personnel button. Returns just `{ pending: N }`,
// no PII, so it doesn't need auth.
router.get('/notifications/pending-count', (req, res) => capitaflow_controller_1.capitaflowController.adminPendingCount(req, res));
// ─── Visibility offering — Phase 1: Financial Structure ────────────────────
router.get('/visibility/dropdowns', (req, res) => visibility_controller_1.visibilityController.dropdowns(req, res));
router.get('/visibility/financial-structure', (req, res) => visibility_controller_1.visibilityController.getFinancialStructure(req, res));
// Raw upload for the GL file. Customer key arrives via ?key= so we don't
// trigger a CORS preflight on a binary POST.
router.post('/visibility/gl/upload', (0, express_1.raw)({ type: '*/*', limit: '5mb' }), asyncHandler(async (req, res) => { await visibility_controller_1.visibilityController.uploadGL(req, res); }));
router.patch('/visibility/gl/:id', (req, res) => visibility_controller_1.visibilityController.updateGL(req, res));
router.delete('/visibility/gl/:id', (req, res) => visibility_controller_1.visibilityController.deleteGL(req, res));
router.post('/visibility/financial-structure/complete', (req, res) => visibility_controller_1.visibilityController.completeFinancialStructure(req, res));
router.post('/visibility/financial-structure/edit', (req, res) => visibility_controller_1.visibilityController.editFinancialStructure(req, res));
// Phase 2 — Organizational Structure.
router.get('/visibility/org-structure', (req, res) => visibility_controller_1.visibilityController.getOrgStructure(req, res));
router.post('/visibility/org-structure/entities', (req, res) => visibility_controller_1.visibilityController.createOrgEntity(req, res));
router.patch('/visibility/org-structure/entities/:id', (req, res) => visibility_controller_1.visibilityController.renameOrgEntity(req, res));
router.delete('/visibility/org-structure/entities/:id', (req, res) => visibility_controller_1.visibilityController.deleteOrgEntity(req, res));
router.get('/visibility/org-structure/entities/:id/references', (req, res) => visibility_controller_1.visibilityController.getOrgEntityReferences(req, res));
router.post('/visibility/org-structure/complete', (req, res) => visibility_controller_1.visibilityController.completeOrgStructure(req, res));
router.post('/visibility/org-structure/edit', (req, res) => visibility_controller_1.visibilityController.editOrgStructure(req, res));
// Phase 3a — Budgets.
router.get('/visibility/budgets', (req, res) => visibility_controller_1.budgetsController.list(req, res));
router.post('/visibility/budgets', (req, res) => visibility_controller_1.budgetsController.create(req, res));
router.get('/visibility/budgets/:id', (req, res) => visibility_controller_1.budgetsController.get(req, res));
router.patch('/visibility/budgets/:id', (req, res) => visibility_controller_1.budgetsController.patch(req, res));
router.delete('/visibility/budgets/:id', (req, res) => visibility_controller_1.budgetsController.remove(req, res));
router.post('/visibility/budgets/:id/finalize', (req, res) => visibility_controller_1.budgetsController.finalize(req, res));
router.post('/visibility/budgets/:id/lines', (req, res) => visibility_controller_1.budgetsController.createLine(req, res));
router.patch('/visibility/budgets/:id/lines/:lineId', (req, res) => visibility_controller_1.budgetsController.patchLine(req, res));
router.delete('/visibility/budgets/:id/lines/:lineId', (req, res) => visibility_controller_1.budgetsController.removeLine(req, res));
// Phase 3c — Personal area: P&L Pivot view + Export to Excel.
router.get('/visibility/budgets/:id/pivot', (req, res) => visibility_controller_1.budgetsController.getPivot(req, res));
router.get('/visibility/budgets/:id/export', asyncHandler(async (req, res) => { await visibility_controller_1.budgetsController.exportXlsx(req, res); }));
// Phase 3b — Salaries & Benefits (per budget).
router.get('/visibility/budgets/:id/salaries', (req, res) => visibility_controller_1.salariesController.list(req, res));
router.post('/visibility/budgets/:id/salaries', (req, res) => visibility_controller_1.salariesController.createRow(req, res));
router.patch('/visibility/budgets/:id/salaries/:rowId', (req, res) => visibility_controller_1.salariesController.patchRow(req, res));
router.delete('/visibility/budgets/:id/salaries/:rowId', (req, res) => visibility_controller_1.salariesController.removeRow(req, res));
router.post('/visibility/budgets/:id/salaries/upload', (0, express_1.raw)({ type: '*/*', limit: '5mb' }), asyncHandler(async (req, res) => { await visibility_controller_1.salariesController.upload(req, res); }));
router.post('/visibility/budgets/:id/salaries/finalize', (req, res) => visibility_controller_1.salariesController.finalize(req, res));
router.post('/visibility/budgets/:id/salaries/edit', (req, res) => visibility_controller_1.salariesController.edit(req, res));
// Phase 3c — Revenues & COGS (per budget).
router.get('/visibility/budgets/:id/rc', (req, res) => visibility_controller_1.rcController.list(req, res));
router.post('/visibility/budgets/:id/rc', (req, res) => visibility_controller_1.rcController.createRow(req, res));
router.patch('/visibility/budgets/:id/rc/:rowId', (req, res) => visibility_controller_1.rcController.patchRow(req, res));
router.delete('/visibility/budgets/:id/rc/:rowId', (req, res) => visibility_controller_1.rcController.removeRow(req, res));
router.post('/visibility/budgets/:id/rc/finalize', (req, res) => visibility_controller_1.rcController.finalize(req, res));
router.post('/visibility/budgets/:id/rc/edit', (req, res) => visibility_controller_1.rcController.edit(req, res));
// ─── CF (Cash Flow) — spec §15 ──────────────────────────────────────────────
router.get('/visibility/budgets/:id/cf', (req, res) => visibility_controller_1.cashFlowController.getOrCreate(req, res));
router.patch('/visibility/budgets/:id/cf', (req, res) => visibility_controller_1.cashFlowController.patch(req, res));
// CF — Payables (spec §3)
router.get('/visibility/budgets/:id/cf/payables', (req, res) => visibility_controller_1.cfPayablesController.get(req, res));
router.patch('/visibility/budgets/:id/cf/payables', (req, res) => visibility_controller_1.cfPayablesController.patchSection(req, res));
router.patch('/visibility/budgets/:id/cf/payables/rows/:rowId', (req, res) => visibility_controller_1.cfPayablesController.patchRow(req, res));
router.delete('/visibility/budgets/:id/cf/payables/rows/:rowId', (req, res) => visibility_controller_1.cfPayablesController.deleteRow(req, res));
// CF — Receivables (spec §4)
router.get('/visibility/budgets/:id/cf/receivables', (req, res) => visibility_controller_1.cfReceivablesController.get(req, res));
router.patch('/visibility/budgets/:id/cf/receivables', (req, res) => visibility_controller_1.cfReceivablesController.patchSection(req, res));
router.patch('/visibility/budgets/:id/cf/receivables/rows/:rowId', (req, res) => visibility_controller_1.cfReceivablesController.patchRow(req, res));
router.delete('/visibility/budgets/:id/cf/receivables/rows/:rowId', (req, res) => visibility_controller_1.cfReceivablesController.deleteRow(req, res));
// CF — Inventory (spec §5)
router.get('/visibility/budgets/:id/cf/inventory', (req, res) => visibility_controller_1.cfInventoryController.get(req, res));
router.patch('/visibility/budgets/:id/cf/inventory', (req, res) => visibility_controller_1.cfInventoryController.patch(req, res));
// CF — Salaries & Benefits (spec §6)
router.get('/visibility/budgets/:id/cf/salaries', (req, res) => visibility_controller_1.cfSalariesController.get(req, res));
router.patch('/visibility/budgets/:id/cf/salaries', (req, res) => visibility_controller_1.cfSalariesController.patch(req, res));
// CF — Manual sections: Other Adjustments / Financing / Capex (spec §7 / §8 / §9)
router.get('/visibility/budgets/:id/cf/manual/:kind', (req, res) => visibility_controller_1.cfManualController.get(req, res));
router.post('/visibility/budgets/:id/cf/manual/:kind', (req, res) => visibility_controller_1.cfManualController.create(req, res));
router.patch('/visibility/budgets/:id/cf/manual/:kind/rows/:rowId', (req, res) => visibility_controller_1.cfManualController.patchRow(req, res));
router.delete('/visibility/budgets/:id/cf/manual/:kind/rows/:rowId', (req, res) => visibility_controller_1.cfManualController.deleteRow(req, res));
// CF — Forecast (spec §11 + §12)
router.get('/visibility/budgets/:id/cf/forecast', (req, res) => visibility_controller_1.cfForecastController.get(req, res));
// CFO Visibility Chat
router.post('/visibility/cfo/chat', asyncHandler(async (req, res) => { await visibility_controller_1.cfoChatController.chat(req, res); }));
// ─── Admin (Raphael) — CapitaFlow Submissions ──────────────────────────────────
// All admin endpoints require X-Admin-Pin header OR ?pin= query (matching
// ACCESS_CODE). Query-param form lets the frontend send simple CORS
// requests with no preflight.
// Self-test: a tiny endpoint that just confirms the admin PIN is good.
// Used by the frontend / for manual diagnosis.
router.get('/admin/me', auth_middleware_1.requireAdminPin, (_req, res) => res.json({ ok: true, role: 'admin' }));
router.get('/admin/submissions', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminListSubmissions(req, res));
router.get('/admin/submissions/:id', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminGetSubmission(req, res));
router.post('/admin/submissions/:id/finalize', auth_middleware_1.requireAdminPin, asyncHandler(async (req, res) => { await capitaflow_controller_1.capitaflowController.adminFinalize(req, res); }));
router.post('/admin/submissions/:id/generate-xlsx', auth_middleware_1.requireAdminPin, asyncHandler(async (req, res) => { await capitaflow_controller_1.capitaflowController.adminGenerateXlsx(req, res); }));
// (Re)generate the populated investor-deck pptx from the current xlsx.
router.post('/admin/submissions/:id/generate-pptx', auth_middleware_1.requireAdminPin, asyncHandler(async (req, res) => { await capitaflow_controller_1.capitaflowController.adminGeneratePptx(req, res); }));
router.get('/admin/submissions/:id/pptx', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminDownloadPptx(req, res));
// Reupload — admin overwrites the stored xlsx with a manually-edited file.
// raw() takes the place of express.json() for this one route so we can
// receive the binary body. Cap at 15 MB to leave headroom over the ~3 MB
// template size while still rejecting absurdly large uploads.
router.post('/admin/submissions/:id/upload-xlsx', auth_middleware_1.requireAdminPin, (0, express_1.raw)({ type: '*/*', limit: '15mb' }), (req, res) => capitaflow_controller_1.capitaflowController.adminUploadXlsx(req, res));
// Reupload — admin overwrites the stored pptx with a manually-edited deck.
router.post('/admin/submissions/:id/upload-pptx', auth_middleware_1.requireAdminPin, (0, express_1.raw)({ type: '*/*', limit: '25mb' }), (req, res) => capitaflow_controller_1.capitaflowController.adminUploadPptx(req, res));
// Edit — flip a finalized submission back to 'review' for corrections.
router.post('/admin/submissions/:id/unfinalize', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminUnfinalize(req, res));
// Admin chat — finance agents wired to all submitted customer data.
router.post('/admin/chat/:agent', auth_middleware_1.requireAdminPin, asyncHandler(async (req, res) => { await capitaflow_controller_1.capitaflowController.adminChat(req, res); }));
router.get('/admin/submissions/:id/xlsx', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminDownloadXlsx(req, res));
router.get('/admin/notifications/count', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminPendingCount(req, res));
router.post('/admin/customer-keys', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminCreateKey(req, res));
router.get('/admin/customer-keys', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminListKeys(req, res));
router.delete('/admin/customer-keys/:id', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminDeleteCustomerKey(req, res));
// Admin diagnostic: confirms libreoffice (and other optional system deps)
// are actually available in the Render image.
router.get('/admin/system-check', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminSystemCheck(req, res));
// ─── Admin: Investor Keys (Investors Marketplace) ────────────────────────────
router.post('/admin/investor-keys', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminCreateInvestorKey(req, res));
router.get('/admin/investor-keys', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminListInvestorKeys(req, res));
router.post('/admin/investor-keys/:id/revoke', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminRevokeInvestorKey(req, res));
router.delete('/admin/investor-keys/:id', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminDeleteInvestorKey(req, res));
// ─── Admin: Agreements (signed NDAs from the Investors Marketplace) ──────────
router.get('/admin/nda-signatures', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminListNdaSignatures(req, res));
router.get('/admin/nda-signatures/:id/pdf', auth_middleware_1.requireAdminPin, asyncHandler(async (req, res) => { await capitaflow_controller_1.capitaflowController.adminDownloadNdaPdf(req, res); }));
router.delete('/admin/nda-signatures/:id', auth_middleware_1.requireAdminPin, (req, res) => capitaflow_controller_1.capitaflowController.adminDeleteNda(req, res));
// ─── LinkedIn Routes ──────────────────────────────────────────────────────────
// Get organization profile (cached or live)
router.get('/linkedin/profile', auth_middleware_1.requireLinkedIn, asyncHandler((req, res) => linkedin_controller_1.linkedInController.getProfile(req, res)));
// AI review of the profile
router.post('/linkedin/review-profile', auth_middleware_1.requireLinkedIn, asyncHandler((_req, res) => linkedin_controller_1.linkedInController.reviewProfile(_req, res)));
// Update organization profile
router.put('/linkedin/profile', auth_middleware_1.requireLinkedIn, asyncHandler((req, res) => linkedin_controller_1.linkedInController.updateProfile(req, res)));
// Get post analytics
router.get('/linkedin/analytics/:postId', auth_middleware_1.requireLinkedIn, asyncHandler((req, res) => linkedin_controller_1.linkedInController.getAnalytics(req, res)));
exports.default = router;
