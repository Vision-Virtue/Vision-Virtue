/* ============================================================
   Column-level AES-256-GCM encryption for sensitive data at rest.

   Used by visibility.repository.ts + capitaflow.repository.ts to
   protect: salaries, employee names, budget descriptions, vendor
   names, customer GL account labels, and any other field that
   contains customer-identifying or financial detail.

   Format on disk:   v1:<iv_b64>:<ciphertext_b64>:<authTag_b64>
   - v1 = versioned envelope so we can rotate algorithms later
   - 12-byte random IV per write (NIST SP 800-38D recommended for GCM)
   - 16-byte auth tag prevents tampering

   Key management:
   - Reads DATA_ENCRYPTION_KEY env var (base64-encoded 32 random bytes)
   - Set on Render via env var with generateValue: true so it's
     never in the codebase or chat history.
   - To generate locally for the first time:
       node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ============================================================ */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;       // 96-bit IV is the GCM standard
const TAG_LEN = 16;      // 128-bit auth tag
const VERSION = 'v1';
const PREFIX = `${VERSION}:`;

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'DATA_ENCRYPTION_KEY env var not set. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))" ' +
      'and add it to Render → Environment.',
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `DATA_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}). ` +
      'Regenerate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  _key = buf;
  return _key;
}

/** Encrypt a plaintext string. Returns the on-disk envelope.
 *  Empty / null / undefined input returns the input unchanged
 *  so empty database columns stay empty (no envelope overhead). */
export function encryptString(plaintext: string | null | undefined): string | null | undefined {
  if (plaintext == null) return plaintext;
  if (plaintext === '') return '';
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${enc.toString('base64')}:${tag.toString('base64')}`;
}

/** Decrypt an on-disk envelope. If the input is NOT in envelope
 *  form (no v1: prefix), returns it unchanged — this lets us run
 *  the wrappers on a mixed DB during migration without breaking
 *  cleartext rows. */
export function decryptString(stored: string | null | undefined): string | null | undefined {
  if (stored == null) return stored;
  if (stored === '') return '';
  if (!stored.startsWith(PREFIX)) return stored; // legacy cleartext — passthrough
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error(`Malformed encrypted envelope (expected 3 parts, got ${parts.length}).`);
  }
  const [ivB64, encB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const enc = Buffer.from(encB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_LEN) throw new Error('Invalid IV length in stored envelope.');
  if (tag.length !== TAG_LEN) throw new Error('Invalid auth tag length in stored envelope.');
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

/** Encrypt a number stored as text. Empty/null passthrough. */
export function encryptNumber(n: number | null | undefined): string | null | undefined {
  if (n == null) return n as unknown as undefined;
  return encryptString(String(n));
}

export function decryptNumber(stored: string | null | undefined): number | null | undefined {
  if (stored == null) return stored as unknown as undefined;
  if (stored === '') return null;
  const plain = decryptString(stored);
  if (plain == null || plain === '') return null;
  const n = Number(plain);
  return Number.isFinite(n) ? n : null;
}

/** Encrypt an object stored as JSON (e.g. form_data blobs). */
export function encryptJson(value: unknown): string | null {
  if (value == null) return null;
  return encryptString(JSON.stringify(value)) ?? null;
}

export function decryptJson<T = unknown>(stored: string | null | undefined): T | null {
  if (stored == null || stored === '') return null;
  const plain = decryptString(stored);
  if (plain == null || plain === '') return null;
  try {
    return JSON.parse(plain) as T;
  } catch {
    return null;
  }
}

/** Test helper — checks whether a stored value is already in encrypted
 *  envelope form. Useful for migrations that need to be idempotent. */
export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

/** Self-test — verifies the key is loadable + round-trip works.
 *  Call this once on server startup to fail fast if the key is broken. */
export function verifyEncryptionKey(): void {
  const probe = 'visibility-encryption-self-test-' + Date.now();
  const enc = encryptString(probe);
  const dec = decryptString(enc);
  if (dec !== probe) {
    throw new Error('Encryption self-test failed — DATA_ENCRYPTION_KEY may be corrupted.');
  }
}
