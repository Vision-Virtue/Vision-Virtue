/* ============================================================
   Encrypted backup of the SQLite database.

   Output: /data/backups/marketing-YYYY-MM-DD-HHMM.db.enc
   - AES-256-GCM with BACKUP_ENCRYPTION_KEY (separate from DATA_ENCRYPTION_KEY)
   - Format: 12-byte IV || ciphertext || 16-byte tag
   - Retention: keep last 30 days; older files auto-deleted
   - Off-site upload to S3 / B2 is optional and gated on BACKUP_S3_URI
     env var (which is NOT set by default — no extra payments)

   Schedule via Render Cron Job:
     0 3 * * *   node dist/scripts/encryptedBackup.js
   (3am UTC daily; light load period)

   To restore:
     node dist/scripts/restoreBackup.js <path-to-.enc>
   (see restoreBackup.ts below — for now restore is a manual openssl
   command documented in the comments)
   ============================================================ */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { createCipheriv, randomBytes } from 'crypto';

const RETENTION_DAYS = 30;
const ALGO = 'aes-256-gcm';

function getBackupKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) {
    console.error('[backup] BACKUP_ENCRYPTION_KEY not set. Generate with:');
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    process.exit(1);
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    console.error(`[backup] BACKUP_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}).`);
    process.exit(1);
  }
  return buf;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

function encryptFile(srcPath: string, dstPath: string, key: Buffer): void {
  const plaintext = fs.readFileSync(srcPath);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [IV (12 bytes)] [ciphertext] [tag (16 bytes)]
  fs.writeFileSync(dstPath, Buffer.concat([iv, encrypted, tag]));
}

function pruneOld(dir: string, retentionDays: number): { kept: number; deleted: number } {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.db.enc'));
  let kept = 0, deleted = 0;
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
      deleted++;
    } else {
      kept++;
    }
  }
  return { kept, deleted };
}

async function maybeUploadToS3(localPath: string): Promise<void> {
  const s3Uri = process.env.BACKUP_S3_URI;
  if (!s3Uri) {
    console.log('[backup] BACKUP_S3_URI not set — skipping off-site upload.');
    console.log('[backup] To enable off-site backup, set BACKUP_S3_URI=s3://bucket/prefix/ (requires AWS SDK + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY).');
    return;
  }
  // Lazy-load AWS SDK so the dep is optional. If user enables S3 backup later,
  // they install @aws-sdk/client-s3 and we use it here.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const match = s3Uri.match(/^s3:\/\/([^/]+)\/(.*)$/);
    if (!match) throw new Error(`BACKUP_S3_URI must be s3://bucket/prefix/ — got "${s3Uri}"`);
    const [, bucket, prefix] = match;
    const key = `${prefix.endsWith('/') ? prefix : prefix + '/'}${path.basename(localPath)}`;
    const client = new S3Client({});
    const body = fs.readFileSync(localPath);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ServerSideEncryption: 'AES256' }));
    console.log(`[backup] uploaded to s3://${bucket}/${key}`);
  } catch (err) {
    console.error('[backup] S3 upload failed (non-blocking):', err);
  }
}

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH || './data/marketing.db';
  if (!fs.existsSync(dbPath)) {
    console.error(`[backup] DB file not found at ${dbPath}`);
    process.exit(1);
  }

  const backupDir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const key = getBackupKey();
  const dstName = `marketing-${timestamp()}.db.enc`;
  const dstPath = path.join(backupDir, dstName);

  console.log(`[backup] encrypting ${dbPath} → ${dstPath}`);
  encryptFile(dbPath, dstPath, key);

  const srcSize = fs.statSync(dbPath).size;
  const dstSize = fs.statSync(dstPath).size;
  console.log(`[backup] source: ${(srcSize / 1024).toFixed(1)} KB → encrypted: ${(dstSize / 1024).toFixed(1)} KB`);

  const pruned = pruneOld(backupDir, RETENTION_DAYS);
  console.log(`[backup] retention: kept ${pruned.kept}, deleted ${pruned.deleted} old backup(s)`);

  await maybeUploadToS3(dstPath);

  console.log('[backup] done');
}

main().catch(err => {
  console.error('[backup] FAILED:', err);
  process.exit(1);
});
