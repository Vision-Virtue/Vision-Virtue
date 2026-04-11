"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.linkedInController = exports.LinkedInController = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const repository_1 = require("../db/repository");
const linkedin_service_1 = require("../services/linkedin.service");
const types_1 = require("../types");
function getLinkedInService() {
    return new linkedin_service_1.LinkedInService(process.env.LINKEDIN_CLIENT_ID || '', process.env.LINKEDIN_CLIENT_SECRET || '', process.env.LINKEDIN_REDIRECT_URI || '', process.env.LINKEDIN_ORGANIZATION_ID || '');
}
// ─── LinkedIn Controller ──────────────────────────────────────────────────────
class LinkedInController {
    // GET /api/linkedin/profile
    async getProfile(req, res) {
        // Try cache first
        const cached = repository_1.contentRepository.getCachedLinkedInProfile();
        const forceRefresh = req.query['refresh'] === 'true';
        if (cached && !forceRefresh) {
            res.json({ success: true, data: cached, source: 'cache' });
            return;
        }
        const token = repository_1.contentRepository.getLinkedInToken();
        if (!token) {
            res.status(401).json({
                error: { code: 'LINKEDIN_NOT_CONNECTED', message: 'LinkedIn is not connected' },
            });
            return;
        }
        if (Date.now() > token.expires_at) {
            res.status(401).json({
                error: { code: 'LINKEDIN_TOKEN_EXPIRED', message: 'LinkedIn token has expired' },
            });
            return;
        }
        const linkedInService = getLinkedInService();
        const profile = await linkedInService.getOrganizationProfile(token.access_token);
        repository_1.contentRepository.cacheLinkedInProfile(profile);
        res.json({ success: true, data: profile, source: 'live' });
    }
    // POST /api/linkedin/review-profile
    async reviewProfile(_req, res) {
        const cached = repository_1.contentRepository.getCachedLinkedInProfile();
        if (!cached) {
            res.status(400).json({
                error: {
                    code: 'NO_PROFILE_DATA',
                    message: 'No profile data available. Fetch profile first.',
                },
            });
            return;
        }
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            res.status(500).json({
                error: { code: 'MISSING_CONFIG', message: 'ANTHROPIC_API_KEY is not configured' },
            });
            return;
        }
        const client = new sdk_1.default({ apiKey });
        const prompt = `You are a LinkedIn optimization expert specializing in B2B professional services firms.

Analyze the following LinkedIn organization profile for Vision & Virtue, a premium financial advisory firm serving CFOs, boards, and founders:

PROFILE DATA:
${JSON.stringify(cached, null, 2)}

Provide specific, actionable recommendations to improve:
1. Tagline / headline — make it compelling for CFOs and financial executives
2. About/description — optimize for thought leadership positioning
3. Specialties — ensure relevant keywords are included
4. Profile completeness — identify any missing fields
5. Content strategy alignment — suggestions for post topics that match this profile

Format your response as JSON:
{
  "overall_score": 7,
  "strengths": ["strength 1", "strength 2"],
  "improvements": [
    {
      "field": "tagline",
      "current": "current value",
      "suggested": "suggested value",
      "reason": "why this improvement matters"
    }
  ],
  "content_strategy": ["post topic idea 1", "post topic idea 2"],
  "summary": "2-3 sentence overall assessment"
}`;
        const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }],
        });
        const content = response.content[0];
        if (content.type !== 'text') {
            throw new types_1.ApiError(500, 'Unexpected response from AI', 'AI_ERROR');
        }
        let analysis;
        try {
            const fenceMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
            const jsonStr = fenceMatch ? fenceMatch[1].trim() : content.text.trim();
            analysis = JSON.parse(jsonStr);
        }
        catch {
            analysis = { raw_analysis: content.text };
        }
        res.json({ success: true, data: analysis });
    }
    // PUT /api/linkedin/profile
    async updateProfile(req, res) {
        const updates = req.body;
        if (!updates || Object.keys(updates).length === 0) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'No update fields provided' },
            });
            return;
        }
        const token = repository_1.contentRepository.getLinkedInToken();
        if (!token) {
            res.status(401).json({
                error: { code: 'LINKEDIN_NOT_CONNECTED', message: 'LinkedIn is not connected' },
            });
            return;
        }
        if (Date.now() > token.expires_at) {
            res.status(401).json({
                error: { code: 'LINKEDIN_TOKEN_EXPIRED', message: 'LinkedIn token has expired' },
            });
            return;
        }
        const linkedInService = getLinkedInService();
        const result = await linkedInService.updateOrganizationProfile(token.access_token, updates);
        // Invalidate cache
        repository_1.contentRepository.cacheLinkedInProfile(null);
        res.json({ success: true, data: result });
    }
    // GET /api/linkedin/analytics/:postId
    async getAnalytics(req, res) {
        const { postId } = req.params;
        if (!postId) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'postId is required' },
            });
            return;
        }
        const token = repository_1.contentRepository.getLinkedInToken();
        if (!token) {
            res.status(401).json({
                error: { code: 'LINKEDIN_NOT_CONNECTED', message: 'LinkedIn is not connected' },
            });
            return;
        }
        if (Date.now() > token.expires_at) {
            res.status(401).json({
                error: { code: 'LINKEDIN_TOKEN_EXPIRED', message: 'LinkedIn token has expired' },
            });
            return;
        }
        const linkedInService = getLinkedInService();
        const analytics = await linkedInService.getPostAnalytics(token.access_token, postId);
        res.json({ success: true, data: analytics });
    }
}
exports.LinkedInController = LinkedInController;
exports.linkedInController = new LinkedInController();
