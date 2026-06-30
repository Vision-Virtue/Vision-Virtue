/* ============================================================
   In-process daily backup scheduler.

   Fires runEncryptedBackup() once every 24 hours, aligned to a
   configurable UTC hour (default 03:00 UTC ≈ 05:00 Israel — a
   genuinely quiet window).

   No external scheduler service required (no Render Cron Job,
   no node-cron dependency). Pure setTimeout + setInterval.

   On first tick after server start:
   - If the current UTC time is already past today's run hour,
     waits until tomorrow's run hour (does NOT immediately backup
     on every restart — that would create dozens of backups in a
     deploy storm and burn the retention window).

   Caveats:
   - If the API process restarts during the run window (rare),
     that day's backup is skipped. Tomorrow's runs as normal. The
     longest possible gap is 48h, never longer.
   - No-op (with a one-time log) when BACKUP_ENCRYPTION_KEY is
     unset, so local dev with `npm start` doesn't try to back up.
   ============================================================ */

import { runEncryptedBackup } from '../scripts/encryptedBackup';
import { logSecurityEvent } from './auth-security';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Compute the next time-of-day in UTC, in milliseconds from now. */
function msUntilNextUtcHour(targetHourUtc: number, targetMinuteUtc = 0): number {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    targetHourUtc,
    targetMinuteUtc,
    0,
    0,
  ));
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1); // already past today — schedule for tomorrow
  }
  return next.getTime() - now.getTime();
}

async function runBackupTick(): Promise<void> {
  try {
    const result = await runEncryptedBackup();
    if (result.ok) {
      const srcKb = ((result.srcSizeBytes ?? 0) / 1024).toFixed(1);
      const encKb = ((result.encSizeBytes ?? 0) / 1024).toFixed(1);
      console.log(`[backup-scheduler] OK ${result.durationMs}ms — ${srcKb}KB → ${encKb}KB encrypted; kept ${result.kept}, pruned ${result.deleted}${result.s3Uploaded ? ' (uploaded to S3)' : ''}`);
      // Audit-log success to security_events so admins can prove backups are running
      logSecurityEvent({
        kind: 'backup_success',
        severity: 'info',
        ip: null,
        detail: `Daily backup completed in ${result.durationMs}ms; ${result.kept} retained, ${result.deleted} pruned.`,
        meta: { srcSizeBytes: result.srcSizeBytes, encSizeBytes: result.encSizeBytes, s3Uploaded: result.s3Uploaded },
      });
    } else {
      console.error(`[backup-scheduler] FAILED ${result.durationMs}ms — ${result.error}`);
      logSecurityEvent({
        kind: 'backup_failed',
        severity: 'critical',
        ip: null,
        detail: `Daily backup FAILED: ${result.error}`,
      });
    }
  } catch (err) {
    // Should never happen — runEncryptedBackup catches internally — but be paranoid.
    console.error('[backup-scheduler] unexpected error:', err);
  }
}

/** Start the daily backup scheduler. Call once from server.ts after the DB
 *  is initialised and the encryption key is verified. Idempotent — safe to
 *  call multiple times but you'll get duplicate schedules; don't. */
export function startDailyBackupScheduler(targetHourUtc = 3): void {
  // Skip entirely if no backup key (local dev / unconfigured prod)
  if (!process.env.BACKUP_ENCRYPTION_KEY) {
    console.log('[backup-scheduler] BACKUP_ENCRYPTION_KEY not set — daily backups disabled.');
    return;
  }

  const initialDelay = msUntilNextUtcHour(targetHourUtc);
  const hoursUntil = (initialDelay / 1000 / 60 / 60).toFixed(1);
  console.log(`[backup-scheduler] Daily backup scheduled for ${String(targetHourUtc).padStart(2, '0')}:00 UTC (next run in ~${hoursUntil}h).`);

  setTimeout(() => {
    // First scheduled run
    runBackupTick().catch(err => console.error('[backup-scheduler] tick error:', err));
    // Then every 24h thereafter
    setInterval(() => {
      runBackupTick().catch(err => console.error('[backup-scheduler] tick error:', err));
    }, ONE_DAY_MS);
  }, initialDelay);
}
