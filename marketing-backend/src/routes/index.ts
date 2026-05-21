import { Router, Request, Response, NextFunction, raw } from 'express';
import { contentController } from '../controllers/content.controller';
import { linkedInController } from '../controllers/linkedin.controller';
import { authController, verifyPin } from '../controllers/auth.controller';
import { chatController } from '../controllers/chat.controller';
import { partnerController } from '../controllers/partner.controller';
import { visibilityController, budgetsController, salariesController } from '../controllers/visibility.controller';
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

// ─── Partner Customer Area (Phase 2A) ────────────────────────────────────────

// Validate a customer key and return basic info
router.post('/customer/auth', (req, res) => partnerController.auth(req, res));

// Submit a Customer's Questionnaire (header X-Customer-Key required)
router.post('/submissions', asyncHandler(async (req, res) => { await partnerController.createSubmission(req, res); }));

// List the authenticated customer's submissions
router.get('/customer/me/submissions', (req, res) => partnerController.listMySubmissions(req, res));

// Customer downloads their own finalized xlsx
router.get('/customer/me/submissions/:id/xlsx', (req, res) => partnerController.downloadMyXlsx(req, res));

// Public count of pending submissions — used by the homepage notification
// badge on the Authorized Personnel button. Returns just `{ pending: N }`,
// no PII, so it doesn't need auth.
router.get('/notifications/pending-count', (req, res) => partnerController.adminPendingCount(req, res));

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

// ─── Admin (Raphael) — Partner Submissions ──────────────────────────────────
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
  (req, res) => partnerController.adminListSubmissions(req, res),
);
router.get(
  '/admin/submissions/:id',
  requireAdminPin,
  (req, res) => partnerController.adminGetSubmission(req, res),
);
router.post(
  '/admin/submissions/:id/finalize',
  requireAdminPin,
  asyncHandler(async (req, res) => { await partnerController.adminFinalize(req, res); }),
);
router.post(
  '/admin/submissions/:id/generate-xlsx',
  requireAdminPin,
  asyncHandler(async (req, res) => { await partnerController.adminGenerateXlsx(req, res); }),
);
// Reupload — admin overwrites the stored xlsx with a manually-edited file.
// raw() takes the place of express.json() for this one route so we can
// receive the binary body. Cap at 15 MB to leave headroom over the ~3 MB
// template size while still rejecting absurdly large uploads.
router.post(
  '/admin/submissions/:id/upload-xlsx',
  requireAdminPin,
  raw({ type: '*/*', limit: '15mb' }),
  (req, res) => partnerController.adminUploadXlsx(req, res),
);
router.get(
  '/admin/submissions/:id/xlsx',
  requireAdminPin,
  (req, res) => partnerController.adminDownloadXlsx(req, res),
);
router.get(
  '/admin/notifications/count',
  requireAdminPin,
  (req, res) => partnerController.adminPendingCount(req, res),
);
router.post(
  '/admin/customer-keys',
  requireAdminPin,
  (req, res) => partnerController.adminCreateKey(req, res),
);
router.get(
  '/admin/customer-keys',
  requireAdminPin,
  (req, res) => partnerController.adminListKeys(req, res),
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
