import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual, createHash } from 'crypto';
import { contentRepository } from '../db/repository';
import { ApiError } from '../types';

// ─── Require LinkedIn Token ───────────────────────────────────────────────────

export function requireLinkedIn(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = contentRepository.getLinkedInToken();

    if (!token) {
      res.status(401).json({
        error: {
          code: 'LINKEDIN_NOT_CONNECTED',
          message: 'LinkedIn account is not connected. Please authorize via /api/auth/linkedin.',
        },
      });
      return;
    }

    if (Date.now() > token.expires_at) {
      res.status(401).json({
        error: {
          code: 'LINKEDIN_TOKEN_EXPIRED',
          message: 'LinkedIn access token has expired. Please re-authorize.',
        },
      });
      return;
    }

    // Attach token to request for downstream use
    (req as Request & { linkedInToken: typeof token }).linkedInToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

// ─── Require Raphael Passcode ─────────────────────────────────────────────────

export function requireRaphael(req: Request, res: Response, next: NextFunction): void {
  const expectedPasscode = process.env.RAPHAEL_PASSCODE;

  if (!expectedPasscode) {
    res.status(500).json({
      error: {
        code: 'PASSCODE_NOT_CONFIGURED',
        message: 'Raphael passcode is not configured on the server.',
      },
    });
    return;
  }

  const { passcode } = req.body as { passcode?: string };

  if (!passcode) {
    res.status(400).json({
      error: {
        code: 'PASSCODE_REQUIRED',
        message: 'Raphael passcode is required in the request body.',
      },
    });
    return;
  }

  const a = createHash('sha256').update(passcode).digest();
  const b = createHash('sha256').update(expectedPasscode).digest();
  if (!timingSafeEqual(a, b)) {
    res.status(403).json({
      error: {
        code: 'PASSCODE_INVALID',
        message: 'Invalid Raphael passcode.',
      },
    });
    return;
  }

  next();
}

// ─── Require Admin PIN (Authorized Personnel) ─────────────────────────────────
//
// Protects admin/Raphael endpoints. Reads the master PIN from the
// X-Admin-Pin header and constant-time compares against ACCESS_CODE.

export function requireAdminPin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ACCESS_CODE;
  if (!expected) {
    res.status(500).json({
      error: { code: 'NOT_CONFIGURED', message: 'ACCESS_CODE is not configured on the server.' },
    });
    return;
  }
  const provided = req.header('x-admin-pin');
  if (!provided) {
    res.status(401).json({
      error: { code: 'ADMIN_PIN_REQUIRED', message: 'X-Admin-Pin header is required.' },
    });
    return;
  }
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    res.status(403).json({
      error: { code: 'ADMIN_PIN_INVALID', message: 'Invalid admin PIN.' },
    });
    return;
  }
  next();
}

// ─── Global Error Handler ─────────────────────────────────────────────────────

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    console.error(`[API_ERROR] ${err.statusCode} ${err.code}: ${err.message}`);
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  console.error('[ERROR]', err);

  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : (err instanceof Error ? err.message : 'An unexpected error occurred');
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
  });
}
