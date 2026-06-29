/* ============================================================
   Restore a .db.enc backup created by encryptedBackup.ts.
   Usage:
     node dist/scripts/restoreBackup.js <path-to-.enc> [output-db-path]

   If output-db-path is omitted, writes to ./restored-<timestamp>.db
   ============================================================ */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { createDecipheriv } from 'crypto';

const ALGO = 'aes-256-gcm';

function getBackupKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) {
    console.error('[restore] BACKUP_ENCRYPTION_KEY not set.');
    process.exit(1);
  }
  return Buffer.from(raw, 'base64');
}

function main(): void {
  const src = process.argv[2];
  if (!src) {
    console.error('Usage: node dist/scripts/restoreBackup.js <path-to-.enc> [output.db]');
    process.exit(1);
  }
  if (!fs.existsSync(src)) {
    console.error(`[restore] File not found: ${src}`);
    process.exit(1);
  }
  const dst = process.argv[3] ?? `./restored-${Date.now()}.db`;
  const blob = fs.readFileSync(src);
  if (blob.length < 12 + 16) {
    console.error('[restore] File too small to contain IV + tag.');
    process.exit(1);
  }
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const ciphertext = blob.subarray(12, blob.length - 16);
  const key = getBackupKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    console.error('[restore] Decryption failed — wrong key or corrupted file.', err);
    process.exit(1);
  }
  fs.writeFileSync(dst, plaintext);
  console.log(`[restore] Wrote ${plaintext.length} bytes to ${path.resolve(dst)}`);
  console.log('[restore] Verify with: sqlite3 ' + dst + ' ".tables"');
}

main();
