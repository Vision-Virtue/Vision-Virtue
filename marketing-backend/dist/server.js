"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const v8_1 = __importDefault(require("v8"));
const app_1 = __importDefault(require("./app"));
const database_1 = require("./db/database");
const PORT = parseInt(process.env.PORT || '3001', 10);
// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
    // Initialize database
    try {
        (0, database_1.getDb)();
        console.log('[SERVER] Database initialized');
    }
    catch (err) {
        console.error('[SERVER] Failed to initialize database:', err);
        process.exit(1);
    }
    // Validate required environment variables
    const warnings = [];
    if (!process.env.ANTHROPIC_API_KEY) {
        warnings.push('ANTHROPIC_API_KEY is not set — AI features will not work');
    }
    if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
        warnings.push('LinkedIn OAuth credentials are not set — LinkedIn features will not work');
    }
    if (!process.env.ACCESS_CODE) {
        warnings.push('ACCESS_CODE is not set — the authorized personnel PIN gate will fail');
    }
    if (!process.env.RAPHAEL_PASSCODE) {
        warnings.push('RAPHAEL_PASSCODE is not set — approval endpoint will fail');
    }
    else if (process.env.RAPHAEL_PASSCODE === 'raphael2025') {
        warnings.push('RAPHAEL_PASSCODE is still the default value — change it before going live');
    }
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-this-in-production-please') {
        warnings.push('SESSION_SECRET is not set or is using the default value — change it in production');
    }
    if (warnings.length > 0) {
        console.warn('\n[SERVER] ⚠️  Configuration warnings:');
        warnings.forEach((w) => console.warn(`  - ${w}`));
        console.warn('');
    }
    // Start HTTP server
    const server = app_1.default.listen(PORT, () => {
        console.log('\n╔══════════════════════════════════════════════════╗');
        console.log('║     Vision & Virtue — Marketing AI Backend       ║');
        console.log('╚══════════════════════════════════════════════════╝');
        console.log(`\n  Server:   http://localhost:${PORT}`);
        console.log(`  API:      http://localhost:${PORT}/api`);
        console.log(`  Health:   http://localhost:${PORT}/api/health`);
        console.log(`  Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
        console.log(`  Env:      ${process.env.NODE_ENV || 'development'}`);
        const heapLimitMB = Math.round(v8_1.default.getHeapStatistics().heap_size_limit / (1024 * 1024));
        console.log(`  Heap:     ${heapLimitMB} MB (max-old-space-size)`);
        console.log('\n  Agents:');
        console.log('    - Dr. Ethan Ross (Chief Economist)');
        console.log('    - Sofia Chen (Manager of Marketing)');
        console.log('    - Daniel Berg (VP Marketing)');
        console.log('    - Raphael (Approver)');
        console.log('\n  Workflow:');
        console.log('    IDEA → BRIEF → DRAFT → VP REVIEW → RAPHAEL → PUBLISHED');
        console.log('\n  Ready.\n');
    });
    // ─── Graceful Shutdown ──────────────────────────────────────────────────────
    function shutdown(signal) {
        console.log(`\n[SERVER] Received ${signal}. Shutting down gracefully...`);
        server.close(() => {
            console.log('[SERVER] HTTP server closed');
            (0, database_1.closeDb)();
            console.log('[SERVER] Database closed');
            process.exit(0);
        });
        // Force exit after 10 seconds
        setTimeout(() => {
            console.error('[SERVER] Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (err) => {
        console.error('[SERVER] Uncaught exception:', err);
        shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
        console.error('[SERVER] Unhandled rejection:', reason);
    });
}
start().catch((err) => {
    console.error('[SERVER] Failed to start:', err);
    process.exit(1);
});
