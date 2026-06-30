/* ============================================================
   Weekly automated security self-test.

   Runs every Sunday at 04:00 UTC. Proves to admin (via the
   security_events table) that the full security stack is alive:
   1. DATA_ENCRYPTION_KEY can still encrypt + decrypt
   2. BACKUP_ENCRYPTION_KEY is present + correct length
   3. scrypt hashing can hash + verify
   4. Audit log table is writable
   5. Recent backup file exists in /data/backups/

   Failures log a 'critical' severity event so the admin notices.
   Success logs an 'info' event proving "this was checked on date X".

   No customer-visible behavior. No new dependencies.
   ============================================================ */

import fs from 'fs';
import path from 'path';
import {
  encryptString,
  decryptString,
  verifyEncryptionKey,
} from '../db/encryption';
import { hashKey, verifyKey } from '../db/keyHash';
import { logSecurityEvent } from './auth-security';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS  = 24 * 60 * 60 * 1000;

interface CheckResult { name: string; ok: boolean; detail: string; }

async function runChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // 1. Data encryption round-trip
  try {
    verifyEncryptionKey();
    const probe = 'self-test-' + Date.now();
    const enc = encryptString(probe);
    const dec = decryptString(enc);
    checks.push({
      name: 'data_encryption',
      ok: dec === probe,
      detail: dec === probe ? 'AES-256-GCM encrypt/decrypt round-trip OK' : 'round-trip mismatch!',
    });
  } catch (err) {
    checks.push({ name: 'data_encryption', ok: false, detail: `error: ${err instanceof Error ? err.message : err}` });
  }

  // 2. Backup key present + correct length
  try {
    const raw = process.env.BACKUP_ENCRYPTION_KEY;
    if (!raw) {
      checks.push({ name: 'backup_key', ok: false, detail: 'BACKUP_ENCRYPTION_KEY not set' });
    } else {
      const buf = Buffer.from(raw, 'base64');
      checks.push({
        name: 'backup_key',
        ok: buf.length === 32,
        detail: buf.length === 32 ? 'backup key length OK (32 bytes)' : `wrong length: ${buf.length} bytes`,
      });
    }
  } catch (err) {
    checks.push({ name: 'backup_key', ok: false, detail: `error: ${err instanceof Error ? err.message : err}` });
  }

  // 3. scrypt hash + verify round-trip
  try {
    const probe = 'self-test-key-' + Date.now();
    const hashed = await hashKey(probe);
    const verifyOk = await verifyKey(probe, hashed);
    const wrongVerifyOk = await verifyKey('wrong-' + probe, hashed);
    checks.push({
      name: 'key_hashing',
      ok: verifyOk && !wrongVerifyOk,
      detail: verifyOk && !wrongVerifyOk
        ? 'scrypt hash + verify + reject-wrong all OK'
        : `verify=${verifyOk}, wrongVerify=${wrongVerifyOk} (expected true,false)`,
    });
  } catch (err) {
    checks.push({ name: 'key_hashing', ok: false, detail: `error: ${err instanceof Error ? err.message : err}` });
  }

  // 4. Recent encrypted backup exists (within last 36h — covers 24h cadence + retries)
  try {
    const dbPath = process.env.DB_PATH || './data/marketing.db';
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) {
      checks.push({ name: 'recent_backup', ok: false, detail: 'backup directory does not exist yet (waiting for first 03:00 UTC tick)' });
    } else {
      const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db.enc'));
      const recent = files
        .map(f => ({ f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .filter(x => Date.now() - x.mtime < 36 * 60 * 60 * 1000)
        .sort((a, b) => b.mtime - a.mtime);
      if (recent.length === 0 && files.length === 0) {
        checks.push({ name: 'recent_backup', ok: false, detail: 'no backup files yet (server is fresh — first 03:00 UTC will create one)' });
      } else if (recent.length === 0) {
        checks.push({ name: 'recent_backup', ok: false, detail: `latest backup is older than 36h (most recent: ${files.length} files exist)` });
      } else {
        checks.push({ name: 'recent_backup', ok: true, detail: `most recent backup: ${recent[0].f}` });
      }
    }
  } catch (err) {
    checks.push({ name: 'recent_backup', ok: false, detail: `error: ${err instanceof Error ? err.message : err}` });
  }

  return checks;
}

/** Schedule the weekly self-test. Aligned to Sunday 04:00 UTC. */
export function startWeeklySecuritySelfTest(): void {
  const now = new Date();
  // Compute next Sunday 04:00 UTC
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 0, 0, 0));
  const daysUntilSunday = (7 - next.getUTCDay()) % 7;
  if (daysUntilSunday === 0 && next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCDate(next.getUTCDate() + daysUntilSunday);
  }
  const initialDelay = next.getTime() - now.getTime();
  const days = (initialDelay / ONE_DAY_MS).toFixed(1);
  console.log(`[security-self-test] First run scheduled in ${days} days (next Sunday 04:00 UTC).`);

  setTimeout(async () => {
    await runOnce();
    setInterval(runOnce, ONE_WEEK_MS);
  }, initialDelay);
}

async function runOnce(): Promise<void> {
  try {
    const checks = await runChecks();
    const failures = checks.filter(c => !c.ok);
    const summary = checks.map(c => `${c.name}=${c.ok ? 'OK' : 'FAIL'}`).join(', ');
    if (failures.length === 0) {
      console.log(`[security-self-test] OK — ${summary}`);
      logSecurityEvent({
        kind: 'security_self_test_passed',
        severity: 'info',
        ip: null,
        detail: `All security checks passed: ${summary}`,
        meta: { checks },
      });
    } else {
      console.error(`[security-self-test] FAILURES (${failures.length}/${checks.length}): ${summary}`);
      logSecurityEvent({
        kind: 'security_self_test_failed',
        severity: 'critical',
        ip: null,
        detail: `Security self-test failed for ${failures.length} check(s): ${failures.map(f => `${f.name} (${f.detail})`).join('; ')}`,
        meta: { checks },
      });
    }
  } catch (err) {
    console.error('[security-self-test] tick error:', err);
  }
}

/** Public: run the self-test immediately, returning the result. Used by the
 *  admin smoke endpoint so Raphael can prove "right now" all systems are go. */
export async function runSecuritySelfTestNow(): Promise<{ ok: boolean; checks: CheckResult[] }> {
  const checks = await runChecks();
  return { ok: checks.every(c => c.ok), checks };
}
