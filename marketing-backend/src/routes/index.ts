import { Router, Request, Response, NextFunction } from 'express';
import { contentController } from '../controllers/content.controller';
import { linkedInController } from '../controllers/linkedin.controller';
import { authController } from '../controllers/auth.controller';
import { chatController } from '../controllers/chat.controller';
import { requireRaphael } from '../middleware/auth.middleware';

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

// Ask the Economist a question (available during Raphael approval review)
router.post(
  '/content/:id/ask-economist',
  asyncHandler((req, res) => contentController.askEconomist(req, res)),
);

// Raphael returns annotated posts to VP for corrections
router.post(
  '/content/:id/return-to-vp',
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

// ─── Direct Agent Chat ────────────────────────────────────────────────────────

router.post(
  '/chat/:agent',
  asyncHandler((req, res) => chatController.directChat(req, res)),
);

// ─── LinkedIn Routes ──────────────────────────────────────────────────────────

// Get organization profile (cached or live)
router.get(
  '/linkedin/profile',
  asyncHandler((req, res) => linkedInController.getProfile(req, res)),
);

// AI review of the profile
router.post(
  '/linkedin/review-profile',
  asyncHandler((_req, res) => linkedInController.reviewProfile(_req, res)),
);

// Update organization profile
router.put(
  '/linkedin/profile',
  asyncHandler((req, res) => linkedInController.updateProfile(req, res)),
);

// Get post analytics
router.get(
  '/linkedin/analytics/:postId',
  asyncHandler((req, res) => linkedInController.getAnalytics(req, res)),
);

export default router;
