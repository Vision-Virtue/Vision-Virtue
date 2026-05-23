"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireLinkedIn = requireLinkedIn;
exports.requireRaphael = requireRaphael;
exports.requireAdminPin = requireAdminPin;
exports.errorHandler = errorHandler;
const crypto_1 = require("crypto");
const repository_1 = require("../db/repository");
const types_1 = require("../types");
// ─── Require LinkedIn Token ───────────────────────────────────────────────────
function requireLinkedIn(req, res, next) {
    try {
        const token = repository_1.contentRepository.getLinkedInToken();
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
        req.linkedInToken = token;
        next();
    }
    catch (err) {
        next(err);
    }
}
// ─── Require Raphael Passcode ─────────────────────────────────────────────────
function requireRaphael(req, res, next) {
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
    const { passcode } = req.body;
    if (!passcode) {
        res.status(400).json({
            error: {
                code: 'PASSCODE_REQUIRED',
                message: 'Raphael passcode is required in the request body.',
            },
        });
        return;
    }
    const a = (0, crypto_1.createHash)('sha256').update(passcode).digest();
    const b = (0, crypto_1.createHash)('sha256').update(expectedPasscode).digest();
    if (!(0, crypto_1.timingSafeEqual)(a, b)) {
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
// Protects admin/Raphael endpoints. Reads the master PIN from either the
// X-Admin-Pin header OR the ?pin= query parameter (whichever is present),
// and constant-time compares against ACCESS_CODE.
//
// Accepting the PIN via query parameter lets the frontend send "simple"
// CORS requests (no custom headers, no JSON body) which avoids the
// preflight roundtrip — preflights have been intermittently failing
// from some browser/proxy combos.
function requireAdminPin(req, res, next) {
    const expected = process.env.ACCESS_CODE;
    if (!expected) {
        res.status(500).json({
            error: { code: 'NOT_CONFIGURED', message: 'ACCESS_CODE is not configured on the server.' },
        });
        return;
    }
    const headerPin = req.header('x-admin-pin') || '';
    const queryPin = typeof req.query.pin === 'string' ? req.query.pin : '';
    const provided = headerPin || queryPin;
    if (!provided) {
        res.status(401).json({
            error: { code: 'ADMIN_PIN_REQUIRED', message: 'Admin PIN is required.' },
        });
        return;
    }
    const a = (0, crypto_1.createHash)('sha256').update(provided).digest();
    const b = (0, crypto_1.createHash)('sha256').update(expected).digest();
    if (!(0, crypto_1.timingSafeEqual)(a, b)) {
        res.status(403).json({
            error: { code: 'ADMIN_PIN_INVALID', message: 'Invalid admin PIN.' },
        });
        return;
    }
    next();
}
// ─── Global Error Handler ─────────────────────────────────────────────────────
function errorHandler(err, _req, res, _next) {
    if (err instanceof types_1.ApiError) {
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
