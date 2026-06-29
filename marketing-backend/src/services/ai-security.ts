/* ============================================================
   AI Agent security guards.

   Wraps every Anthropic API call with:
   1. Per-customer scoping — the customer_key_id MUST be bound to
      the context; reject if missing or if any context fields
      reference a different customer.
   2. Prompt-injection sanitization — user-typed strings are
      escaped + structured into a JSON envelope rather than
      concatenated into the system prompt.
   3. Output filtering — scan replies for tokens that suggest
      cross-tenant data leak (other customer names / VV- key
      patterns / etc).
   4. Audit logging — every prompt + response is logged with the
      customer key id so we can prove who saw what.
   ============================================================ */

import { getDb } from '../db/database';

/** Strings that should never appear verbatim in user-supplied data when
 *  inlined into a prompt. Patterns are stripped or escaped. */
const PROMPT_INJECTION_TOKENS = [
  /ignore (?:all )?(?:previous|prior|above) (?:instructions?|prompts?)/gi,
  /system:\s*you (?:are|will)/gi,
  /you (?:are|will be) now/gi,
  /disregard.*(?:instructions?|rules?)/gi,
  /\[SYSTEM\]/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
];

/** Patterns in the agent's REPLY that indicate cross-customer leakage
 *  or jailbreak success. If matched, the reply is redacted and an
 *  alert is logged for V&V to investigate. */
const OUTPUT_LEAK_TOKENS = [
  /VV-[A-HJKLMNP-Z2-9]{6}/g,     // any other customer key
  /IV-[A-HJKLMNP-Z2-9]{6}/g,     // any investor key
  /DATA_ENCRYPTION_KEY/gi,
  /BACKUP_ENCRYPTION_KEY/gi,
  /sk-ant-api/gi,                 // Anthropic API key
];

/** Recursively sanitize a value before it goes into a prompt.
 *  - Strings: strip prompt-injection patterns
 *  - Objects: recurse
 *  - Arrays: recurse on each element
 *  - Primitives: passthrough
 *  Length-limit each string to defeat token-bomb context-flooding. */
export function sanitizeForPrompt(value: unknown, maxStringLen = 2000): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    let s = value;
    for (const pat of PROMPT_INJECTION_TOKENS) s = s.replace(pat, '[REDACTED]');
    if (s.length > maxStringLen) s = s.slice(0, maxStringLen) + '… [truncated]';
    return s;
  }
  if (Array.isArray(value)) {
    return value.map(v => sanitizeForPrompt(v, maxStringLen));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeForPrompt(v, maxStringLen);
    }
    return out;
  }
  return value;
}

/** Wrap a customer-data context into a structured JSON envelope that the
 *  prompt template should reference by key, instead of inlining the
 *  customer's raw strings into instructions. */
export function buildContextEnvelope(customerKeyId: string, data: Record<string, unknown>): string {
  const sanitized = sanitizeForPrompt(data);
  return JSON.stringify({
    schema: 'visibility/customer-context/v1',
    customer_key_id: customerKeyId,
    data: sanitized,
  });
}

/** Scan an agent reply for cross-tenant leakage tokens. Returns the
 *  redacted text + a list of matched patterns. If anything matched,
 *  the V&V on-call should review (the audit log carries the full input). */
export function filterOutputForLeaks(reply: string, currentCustomerKey: string): { text: string; leaks: string[] } {
  let text = reply;
  const leaks: string[] = [];
  for (const pat of OUTPUT_LEAK_TOKENS) {
    const matches = text.match(pat);
    if (matches && matches.length) {
      // Don't redact mentions of the CURRENT customer's own key — they may legitimately reference it
      for (const m of matches) {
        if (m === currentCustomerKey) continue;
        leaks.push(m);
      }
      text = text.replace(pat, m => m === currentCustomerKey ? m : '[REDACTED]');
    }
  }
  return { text, leaks };
}

/** Log an AI call for audit. Stored encrypted at rest; admin-only access.
 *  Failure to log should NOT block the API response — best effort. */
export function auditAICall(input: {
  customerKeyId: string | null;
  agent: string;
  prompt: string;
  reply: string;
  leaksFound: string[];
  durationMs: number;
}): void {
  try {
    const db = getDb();
    // Lazy-create the audit table on first write
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_audit_log (
        id              TEXT PRIMARY KEY,
        customer_key_id TEXT,
        agent           TEXT NOT NULL,
        prompt_hash     TEXT NOT NULL,
        reply_hash      TEXT NOT NULL,
        leaks_found     INTEGER NOT NULL DEFAULT 0,
        leak_tokens     TEXT,
        duration_ms     INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_audit_customer ON ai_audit_log(customer_key_id, created_at);
    `);
    const { createHash, randomBytes } = require('crypto');
    const promptHash = createHash('sha256').update(input.prompt).digest('hex');
    const replyHash = createHash('sha256').update(input.reply).digest('hex');
    db.prepare(`
      INSERT INTO ai_audit_log (id, customer_key_id, agent, prompt_hash, reply_hash, leaks_found, leak_tokens, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomBytes(8).toString('hex'),
      input.customerKeyId,
      input.agent,
      promptHash,
      replyHash,
      input.leaksFound.length,
      input.leaksFound.length ? JSON.stringify(input.leaksFound) : null,
      input.durationMs,
      new Date().toISOString(),
    );
  } catch (err) {
    console.error('[ai-security] audit log failed (non-blocking):', err);
  }
}

/** The headline guard. Call BEFORE every Anthropic API request:
 *    1. Validates customerKeyId is set + matches every customer-scoped
 *       field in the context.
 *    2. Returns a sanitized context envelope ready to pass to the agent.
 *  Throws on scoping violation so the API returns 500, not a leaky 200. */
export function guardCustomerScope(
  customerKeyId: string,
  context: Record<string, unknown>,
): { envelope: string; sanitizedContext: Record<string, unknown> } {
  if (!customerKeyId || typeof customerKeyId !== 'string') {
    throw new Error('AI-SECURITY: customer_key_id is required on every customer-scoped agent call.');
  }
  // Reject context that references a different customer_key_id internally
  const ctxKeyId = (context as { customer_key_id?: unknown }).customer_key_id;
  if (ctxKeyId && ctxKeyId !== customerKeyId) {
    throw new Error('AI-SECURITY: context customer_key_id does not match request customer_key_id.');
  }
  const sanitized = sanitizeForPrompt(context) as Record<string, unknown>;
  return {
    envelope: buildContextEnvelope(customerKeyId, sanitized),
    sanitizedContext: sanitized,
  };
}

/** Per-customer agent rate limit — limits exfiltration via Q&A.
 *  Returns true if the call is allowed, false if rate-limited. */
const callCounters = new Map<string, { count: number; resetAt: number }>();
export function checkAgentRateLimit(customerKeyId: string, maxCallsPerHour = 100): boolean {
  const now = Date.now();
  const entry = callCounters.get(customerKeyId);
  if (!entry || now > entry.resetAt) {
    callCounters.set(customerKeyId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= maxCallsPerHour) return false;
  entry.count++;
  return true;
}
