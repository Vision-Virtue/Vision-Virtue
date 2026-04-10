"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const content_controller_1 = require("../controllers/content.controller");
const linkedin_controller_1 = require("../controllers/linkedin.controller");
const auth_controller_1 = require("../controllers/auth.controller");
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
// Ask the Economist a question (available during Raphael approval review)
router.post('/content/:id/ask-economist', asyncHandler((req, res) => content_controller_1.contentController.askEconomist(req, res)));
// Publish to LinkedIn
router.post('/content/:id/publish', asyncHandler((req, res) => content_controller_1.contentController.publish(req, res)));
// ─── LinkedIn Routes ──────────────────────────────────────────────────────────
// Get organization profile (cached or live)
router.get('/linkedin/profile', asyncHandler((req, res) => linkedin_controller_1.linkedInController.getProfile(req, res)));
// AI review of the profile
router.post('/linkedin/review-profile', asyncHandler((_req, res) => linkedin_controller_1.linkedInController.reviewProfile(_req, res)));
// Update organization profile
router.put('/linkedin/profile', asyncHandler((req, res) => linkedin_controller_1.linkedInController.updateProfile(req, res)));
// Get post analytics
router.get('/linkedin/analytics/:postId', asyncHandler((req, res) => linkedin_controller_1.linkedInController.getAnalytics(req, res)));
exports.default = router;
