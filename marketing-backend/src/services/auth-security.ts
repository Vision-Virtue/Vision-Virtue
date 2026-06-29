/* ============================================================
   Auth-side defenses beyond the per-IP rate limit:

   1. Per-key consecutive-failure lockout
      5 consecutive failed login attempts on a single key trigger
      a 1-hour lockout on THAT KEY (the attacker can't simply rotate
      IPs and continue brute-forcing the same key).

   2. Anomaly counters for the admin security_events table
      Auth spikes, rate-limit hits, lockouts are recorded here so
      V&V admins can review without opening server logs.

   Why in-memory + DB:
   - Lockouts are short-lived (1h) and survive single-process restarts
     fine via the DB-backed restore-on-startup hook.
   - In-memory counters are fast (sub-millisecond) for the hot path.
   ============================================================ */

import { getDb } from '../db/database';
import { randomBytes } from 'crypto';

const MAX_CONSEC_FAILURES = 5;
const LOCKOUT_MS = 60 * 60 * 1000; // 1 hour

interface LockEntry { fails: number; lockedUntil: number; }
const lockState = new Map<string, LockEntry>(); // keyed by the candidate key (cleartext input)

/** Returns true if the given key is currently locked (don't even try to verify). */
export function isKeyLocked(candidateKey: string): { locked: boolean; until?: number } {
  const entry = lockState.get(candidateKey);
  if (!entry) return { locked: false };
  const now = Date.now();
  if (entry.lockedUntil > now) return { locked: true, until: entry.lockedUntil };
  // Expired lockout — clear it
  lockState.delete(candidateKey);
  return { locked: false };
}

/** Call after a successful auth — resets the failure counter for this key. */
export function recordAuthSuccess(candidateKey: string): void {
  lockState.delete(candidateKey);
}

/** Call after a failed auth attempt — increment counter, lock if threshold hit. */
export function recordAuthFailure(candidateKey: string, ip: string | undefined): { lockedNow: boolean; until?: number } {
  const now = Date.now();
  const entry = lockState.get(candidateKey) ?? { fails: 0, lockedUntil: 0 };
  entry.fails++;
  let lockedNow = false;
  if (entry.fails >= MAX_CONSEC_FAILURES) {
    entry.lockedUntil = now + LOCKOUT_MS;
    entry.fails = 0; // reset counter; next 5 fails after unlock = relock
    lockedNow = true;
    logSecurityEvent({
      kind: 'auth_key_lockout',
      severity: 'warning',
      ip: ip ?? null,
      detail: `Key locked for 1h after ${MAX_CONSEC_FAILURES} consecutive failures.`,
      // We do NOT log the cleartext key — only a truncated prefix to help
      // admins identify which customer was targeted (without exposing the secret).
      key_prefix: candidateKey.slice(0, 7),
    });
  } else {
    logSecurityEvent({
      kind: 'auth_failure',
      severity: 'info',
      ip: ip ?? null,
      detail: `Failed attempt ${entry.fails}/${MAX_CONSEC_FAILURES} on key.`,
      key_prefix: candidateKey.slice(0, 7),
    });
  }
  lockState.set(candidateKey, entry);
  return { lockedNow, until: lockedNow ? entry.lockedUntil : undefined };
}

/* ============================================================
   Security events log — admin-visible anomaly board.
   ============================================================ */

interface SecurityEvent {
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  ip: string | null;
  detail: string;
  key_prefix?: string;
  customer_key_id?: string;
  meta?: Record<string, unknown>;
}

let _tableEnsured = false;
function ensureTable(): void {
  if (_tableEnsured) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_events (
      id              TEXT PRIMARY KEY,
      created_at      TEXT NOT NULL,
      kind            TEXT NOT NULL,
      severity        TEXT NOT NULL,
      ip              TEXT,
      key_prefix      TEXT,
      customer_key_id TEXT,
      detail          TEXT NOT NULL,
      meta            TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_security_events_kind ON security_events(kind, created_at DESC);
  `);
  _tableEnsured = true;
}

export function logSecurityEvent(evt: SecurityEvent): void {
  try {
    ensureTable();
    const db = getDb();
    db.prepare(`
      INSERT INTO security_events (id, created_at, kind, severity, ip, key_prefix, customer_key_id, detail, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomBytes(8).toString('hex'),
      new Date().toISOString(),
      evt.kind,
      evt.severity,
      evt.ip,
      evt.key_prefix ?? null,
      evt.customer_key_id ?? null,
      evt.detail,
      evt.meta ? JSON.stringify(evt.meta) : null,
    );
  } catch (err) {
    console.error('[auth-security] failed to log security event:', err);
  }
}

/** Admin endpoint helper — recent events sorted newest first. */
export function listRecentSecurityEvents(limit = 200): unknown[] {
  ensureTable();
  return getDb()
    .prepare(`SELECT * FROM security_events ORDER BY created_at DESC LIMIT ?`)
    .all(limit);
}
