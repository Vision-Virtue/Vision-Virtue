"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireLinkedIn = requireLinkedIn;
exports.requireRaphael = requireRaphael;
exports.errorHandler = errorHandler;
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
    if (passcode !== expectedPasscode) {
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
// ─── Global Error Handler ─────────────────────────────────────────────────────
function errorHandler(err, _req, res, _next) {
    if (err instanceof types_1.ApiError) {
        res.status(err.statusCode).json(err.toJSON());
        return;
    }
    console.error('[ERROR]', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    res.status(500).json({
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message,
        },
    });
}
