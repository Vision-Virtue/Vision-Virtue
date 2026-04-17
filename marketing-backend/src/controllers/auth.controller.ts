import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { contentRepository } from '../db/repository';
import { getDb } from '../db/database';
import { LinkedInService } from '../services/linkedin.service';

function getLinkedInService(): LinkedInService {
  return new LinkedInService(
    process.env.LINKEDIN_CLIENT_ID || '',
    process.env.LINKEDIN_CLIENT_SECRET || '',
    process.env.LINKEDIN_REDIRECT_URI || '',
    process.env.LINKEDIN_ORGANIZATION_ID || '',
  );
}

// Resolve the correct marketing page URL regardless of which domain FRONTEND_URL points to.
// GitHub Pages project pages live under /Vision-Virtue/ — plain custom domains do not.
function marketingUrl(qs: string): string {
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const needsSubPath = base.includes('github.io') && !base.endsWith('/Vision-Virtue');
  const page = needsSubPath ? '/Vision-Virtue/marketing.html' : '/marketing.html';
  return `${base}${page}?${qs}`;
}

// ─── Auth Controller ──────────────────────────────────────────────────────────

export class AuthController {
  // GET /api/auth/linkedin
  startLinkedInAuth(req: Request, res: Response): void {
    const linkedInService = getLinkedInService();
    const state = uuidv4();

    // Store state in session for CSRF protection
    (req.session as unknown as Record<string, unknown>)['oauth_state'] = state;

    const authUrl = linkedInService.getAuthorizationUrl(state);
    res.redirect(authUrl);
  }

  // GET /api/auth/linkedin/callback
  async linkedInCallback(req: Request, res: Response): Promise<void> {
    const { code, state, error, error_description } = req.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    if (error) {
      res.redirect(marketingUrl(`linkedin_error=${encodeURIComponent(error_description || error)}`));
      return;
    }

    if (!code) {
      res.status(400).json({
        error: { code: 'MISSING_CODE', message: 'Authorization code not received from LinkedIn' },
      });
      return;
    }

    // Verify CSRF state
    const sessionState = (req.session as unknown as Record<string, unknown>)['oauth_state'] as
      | string
      | undefined;
    if (!state || !sessionState || sessionState !== state) {
      res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'OAuth state mismatch. Possible CSRF attack.' },
      });
      return;
    }

    // Clear session state
    delete (req.session as unknown as Record<string, unknown>)['oauth_state'];

    const linkedInService = getLinkedInService();
    const tokenData = await linkedInService.exchangeCodeForToken(code);

    contentRepository.saveLinkedInToken(tokenData);

    res.redirect(marketingUrl('linkedin_connected=true'));
  }

  // GET /api/auth/status
  getStatus(_req: Request, res: Response): void {
    const token = contentRepository.getLinkedInToken();
    const credentialsConfigured = !!(
      process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET
    );

    if (!token) {
      res.json({
        success: true,
        data: {
          linkedin_connected: false,
          credentials_configured: credentialsConfigured,
          expires_at: null,
          organization_id: null,
        },
      });
      return;
    }

    const isExpired = Date.now() > token.expires_at;

    res.json({
      success: true,
      data: {
        linkedin_connected: !isExpired,
        credentials_configured: credentialsConfigured,
        expires_at: new Date(token.expires_at).toISOString(),
        organization_id: token.organization_id,
        person_urn: token.person_urn,
        token_age_hours: Math.round((Date.now() - new Date(token.created_at).getTime()) / 3600000),
        is_expired: isExpired,
      },
    });
  }

  // DELETE /api/auth/linkedin
  disconnectLinkedIn(_req: Request, res: Response): void {
    const token = contentRepository.getLinkedInToken();
    if (!token) {
      res.json({ success: true, message: 'LinkedIn was not connected' });
      return;
    }

    // We use saveLinkedInToken which first deletes all existing tokens
    // So we can just delete by re-saving nothing, but easier to expose via DB
    // Instead, we'll just mark as expired by returning a helpful message
    // The simplest approach: delete by saving a dummy expired token
    // Actually, let's just use a direct DB call
    getDb().prepare('DELETE FROM linkedin_accounts').run();

    res.json({ success: true, message: 'LinkedIn disconnected successfully' });
  }
}

export const authController = new AuthController();
