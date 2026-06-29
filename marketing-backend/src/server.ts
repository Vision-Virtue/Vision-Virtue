import dotenv from 'dotenv';
dotenv.config();

import v8 from 'v8';
import app from './app';
import { getDb, closeDb } from './db/database';
import { verifyEncryptionKey } from './db/encryption';

const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  // Initialize database
  try {
    getDb();
    console.log('[SERVER] Database initialized');
  } catch (err) {
    console.error('[SERVER] Failed to initialize database:', err);
    process.exit(1);
  }

  // Verify column-encryption key is present + works (fail fast)
  if (process.env.DATA_ENCRYPTION_KEY) {
    try {
      verifyEncryptionKey();
      console.log('[SERVER] Encryption key OK (AES-256-GCM column encryption enabled)');
    } catch (err) {
      console.error('[SERVER] Encryption key verification failed:', err);
      process.exit(1);
    }
  } else {
    console.warn('[SERVER] WARNING: DATA_ENCRYPTION_KEY is not set — sensitive columns will be stored in cleartext.');
    console.warn('         Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    console.warn('         Then add to Render → Environment → DATA_ENCRYPTION_KEY');
  }

  // Validate required environment variables
  const warnings: string[] = [];
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
  } else if (process.env.RAPHAEL_PASSCODE === 'raphael2025') {
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
  const server = app.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║     Vision & Virtue — Marketing AI Backend       ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`\n  Server:   http://localhost:${PORT}`);
    console.log(`  API:      http://localhost:${PORT}/api`);
    console.log(`  Health:   http://localhost:${PORT}/api/health`);
    console.log(`  Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`  Env:      ${process.env.NODE_ENV || 'development'}`);
    const heapLimitMB = Math.round(v8.getHeapStatistics().heap_size_limit / (1024 * 1024));
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

  function shutdown(signal: string): void {
    console.log(`\n[SERVER] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('[SERVER] HTTP server closed');
      closeDb();
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
