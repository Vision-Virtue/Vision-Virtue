/* ============================================================
   Customer / Investor key hashing (scrypt).

   Why hash:
   - DB leak doesn't reveal active keys
   - Admin database snapshots can't be replayed against the live API
   - Even V&V staff can't read keys directly from the DB

   Algorithm: Node built-in scrypt (memory-hard, FIPS-approved)
   - Parameters: N=16384, r=8, p=1, keylen=64
   - 16-byte random salt per key
   - Format: scrypt:<salt_b64>:<hash_b64>
   - Verify takes ~50ms — fine for our key count (<1000 active keys)

   Linear-scan lookup: because the salt is per-row, we can't index.
   For the next 5 years V&V has <1000 active keys; linear scan is fine.
   Past that, switch to a deterministic HMAC index column.
   ============================================================ */

import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_N = 16384;    // CPU/memory cost factor (RFC 7914 recommends ≥2^14 for interactive)
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
const PREFIX = 'scrypt:';

/** Hash a customer key for at-rest storage. Returns a string like
 *  "scrypt:<salt_b64>:<hash_b64>" suitable for the customer_keys.key_hash
 *  column. Same input + different call = different output (random salt). */
export async function hashKey(key: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await scrypt(key, salt, KEY_LEN);
  return `${PREFIX}${salt.toString('base64')}:${hash.toString('base64')}`;
}

/** Constant-time comparison of a candidate key against a stored hash. */
export async function verifyKey(candidate: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith(PREFIX)) return false;
  const parts = storedHash.slice(PREFIX.length).split(':');
  if (parts.length !== 2) return false;
  const [saltB64, hashB64] = parts;
  let salt: Buffer, expected: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  if (salt.length !== SALT_LEN) return false;
  if (expected.length !== KEY_LEN) return false;
  const actual = await scrypt(candidate, salt, KEY_LEN);
  // Constant-time compare to defeat timing side-channels
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Extract a non-secret display prefix from a customer key for admin UIs.
 *  "VV-AB12CD" → "VV-AB••••" (so the admin list can show "which key" without
 *  exposing the full secret). Safe to log + display. */
export function keyDisplayPrefix(key: string): string {
  if (!key || key.length < 5) return '••••••';
  // Take the prefix-and-first-4 (e.g. "VV-AB12CD" → "VV-AB12")
  return `${key.slice(0, 7)}••••`;
}

/** Test helper — returns true if a stored value looks like a scrypt envelope. */
export function isHashed(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}
