"use strict";
// ─── Workflow States ───────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = void 0;
// ─── API Error ────────────────────────────────────────────────────────────────
class ApiError extends Error {
    constructor(statusCode, message, code, details) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, ApiError.prototype);
    }
    toJSON() {
        return {
            error: {
                code: this.code,
                message: this.message,
                details: this.details,
            },
        };
    }
}
exports.ApiError = ApiError;
