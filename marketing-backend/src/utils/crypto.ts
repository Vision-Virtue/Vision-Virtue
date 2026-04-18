import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';

function getKey(): Buffer | null {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;

  const key = getKey();
  if (!key) return stored;

  const rest = stored.slice(ENC_PREFIX.length).split(':');
  if (rest.length !== 3) return stored;

  try {
    const [ivHex, tagHex, ciphertextHex] = rest;
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(ciphertextHex, 'hex')).toString('utf8') + decipher.final('utf8');
  } catch {
    throw new Error('Failed to decrypt token — TOKEN_ENCRYPTION_KEY may have changed');
  }
}
