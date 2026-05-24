"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const content_controller_1 = require("../controllers/content.controller");
const linkedin_controller_1 = require("../controllers/linkedin.controller");
const auth_controller_1 = require("../controllers/auth.controller");
const chat_controller_1 = require("../controllers/chat.controller");
const partner_controller_1 = require("../controllers/partner.controller");
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
// ─── Partner Customer Area (Phase 2A) ────────────────────────────────────────
// Validate a customer key and return basic info
router.post('/customer/auth', (req, res) => partner_controller_1.partnerController.auth(req, res));
// Submit a Customer's Questionnaire (header X-Customer-Key required)
router.post('/submissions', asyncHandler(async (req, res) => { await partner_controller_1.partnerController.createSubmission(req, res); }));
// List the authenticated customer's submissions
router.get('/customer/me/submissions', (req, res) => partner_controller_1.partnerController.listMySubmissions(req, res));
// Customer downloads their own finalized xlsx
router.get('/customer/me/submissions/:id/xlsx', (req, res) => partner_controller_1.partnerController.downloadMyXlsx(req, res));
// Public count of pending submissions — used by the homepage notification
// badge on the Authorized Personnel button. Returns just `{ pending: N }`,
// no PII, so it doesn't need auth.
router.get('/notifications/pending-count', (req, res) => partner_controller_1.partnerController.adminPendingCount(req, res));
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
// ─── CF (Cash Flow) — spec §15 ──────────────────────────────────────────────
router.get('/visibility/budgets/:id/cf', (req, res) => visibility_controller_1.cashFlowController.getOrCreate(req, res));
router.patch('/visibility/budgets/:id/cf', (req, res) => visibility_controller_1.cashFlowController.patch(req, res));
// CF — Payables (spec §3)
router.get('/visibility/budgets/:id/cf/payables', (req, res) => visibility_controller_1.cfPayablesController.get(req, res));
router.patch('/visibility/budgets/:id/cf/payables', (req, res) => visibility_controller_1.cfPayablesController.patchSection(req, res));
router.patch('/visibility/budgets/:id/cf/payables/rows/:rowId', (req, res) => visibility_controller_1.cfPayablesController.patchRow(req, res));
// CF — Receivables (spec §4)
router.get('/visibility/budgets/:id/cf/receivables', (req, res) => visibility_controller_1.cfReceivablesController.get(req, res));
router.patch('/visibility/budgets/:id/cf/receivables', (req, res) => visibility_controller_1.cfReceivablesController.patchSection(req, res));
router.patch('/visibility/budgets/:id/cf/receivables/rows/:rowId', (req, res) => visibility_controller_1.cfReceivablesController.patchRow(req, res));
// ─── Admin (Raphael) — Partner Submissions ──────────────────────────────────
// All admin endpoints require X-Admin-Pin header OR ?pin= query (matching
// ACCESS_CODE). Query-param form lets the frontend send simple CORS
// requests with no preflight.
// Self-test: a tiny endpoint that just confirms the admin PIN is good.
// Used by the frontend / for manual diagnosis.
router.get('/admin/me', auth_middleware_1.requireAdminPin, (_req, res) => res.json({ ok: true, role: 'admin' }));
router.get('/admin/submissions', auth_middleware_1.requireAdminPin, (req, res) => partner_controller_1.partnerController.adminListSubmissions(req, res));
router.get('/admin/submissions/:id', auth_middleware_1.requireAdminPin, (req, res) => partner_controller_1.partnerController.adminGetSubmission(req, res));
router.post('/admin/submissions/:id/finalize', auth_middleware_1.requireAdminPin, asyncHandler(async (req, res) => { await partner_controller_1.partnerController.adminFinalize(req, res); }));
router.post('/admin/submissions/:id/generate-xlsx', auth_middleware_1.requireAdminPin, asyncHandler(async (req, res) => { await partner_controller_1.partnerController.adminGenerateXlsx(req, res); }));
// Reupload — admin overwrites the stored xlsx with a manually-edited file.
// raw() takes the place of express.json() for this one route so we can
// receive the binary body. Cap at 15 MB to leave headroom over the ~3 MB
// template size while still rejecting absurdly large uploads.
router.post('/admin/submissions/:id/upload-xlsx', auth_middleware_1.requireAdminPin, (0, express_1.raw)({ type: '*/*', limit: '15mb' }), (req, res) => partner_controller_1.partnerController.adminUploadXlsx(req, res));
router.get('/admin/submissions/:id/xlsx', auth_middleware_1.requireAdminPin, (req, res) => partner_controller_1.partnerController.adminDownloadXlsx(req, res));
router.get('/admin/notifications/count', auth_middleware_1.requireAdminPin, (req, res) => partner_controller_1.partnerController.adminPendingCount(req, res));
router.post('/admin/customer-keys', auth_middleware_1.requireAdminPin, (req, res) => partner_controller_1.partnerController.adminCreateKey(req, res));
router.get('/admin/customer-keys', auth_middleware_1.requireAdminPin, (req, res) => partner_controller_1.partnerController.adminListKeys(req, res));
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
