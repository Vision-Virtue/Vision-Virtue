/* ============================================================
   Deck-token signing
   Produces a short-lived HMAC-signed token used to authorise
   the public PPTX-serving endpoint that Microsoft Office Online
   Viewer hits when rendering an investor deck. The token is
   bound to a (listing, investor key, expiry) tuple — outside the
   validity window, the URL is dead.
   ============================================================ */

import crypto from 'crypto';

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes — Office Online fetches once at iframe load

function secret(): string {
  // Render injects SESSION_SECRET (generateValue: true). In dev fall back to
  // a stable string so local restarts don't invalidate everything mid-test.
  return process.env.SESSION_SECRET || process.env.RAPHAEL_PASSCODE || 'vv-dev-deck-secret';
}

interface DeckTokenClaims {
  listingId: string;
  investorKeyId: string;
  exp: number; // ms since epoch
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  return Buffer.from(s, 'base64');
}

export function signDeckToken(args: { listingId: string; investorKeyId: string; ttlMs?: number }): string {
  const claims: DeckTokenClaims = {
    listingId:     args.listingId,
    investorKeyId: args.investorKeyId,
    exp:           Date.now() + (args.ttlMs ?? TOKEN_TTL_MS),
  };
  const payload = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  const sig = b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
  return payload + '.' + sig;
}

export function verifyDeckToken(token: string): DeckTokenClaims | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let claims: DeckTokenClaims;
  try {
    claims = JSON.parse(b64urlDecode(payload).toString('utf8'));
  } catch { return null; }
  if (!claims.listingId || !claims.investorKeyId || typeof claims.exp !== 'number') return null;
  if (Date.now() > claims.exp) return null;
  return claims;
}
