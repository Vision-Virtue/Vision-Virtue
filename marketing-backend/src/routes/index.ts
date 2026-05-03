import { Router, Request, Response, NextFunction } from 'express';
import { contentController } from '../controllers/content.controller';
import { linkedInController } from '../controllers/linkedin.controller';
import { authController, verifyPin } from '../controllers/auth.controller';
import { chatController } from '../controllers/chat.controller';
import { partnerController } from '../controllers/partner.controller';
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

// ─── Admin (Raphael) — Partner Submissions ──────────────────────────────────
// All admin endpoints require an X-Admin-Pin header matching ACCESS_CODE.

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
