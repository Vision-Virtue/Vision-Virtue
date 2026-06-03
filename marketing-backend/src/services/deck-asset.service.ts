/* ============================================================
   Investor-deck asset storage

   Customer-uploaded image placeholders (logos, headshots, product
   shots, diagrams) land on the same persistent disk as the customer
   xlsx files. They sit one level deeper, organised per-customer:

     <DB_PATH parent>/
       customer-xlsx/
         <name>__<submissionId>.xlsx
       customer-assets/
         <customerKeyId>/
           <placeholder>__<uuid8>.<ext>

   No DB row is created — the file path is the source of truth. The
   form's investorDeck.<fieldKey> just holds the relative URL that
   GET /api/customer/deck-asset/:filename serves back (gated by the
   customer key).
   ============================================================ */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

function rootDir(): string {
  const dbPath = process.env.DB_PATH || './data/marketing.db';
  return path.join(path.dirname(path.resolve(dbPath)), 'customer-assets');
}

function customerDir(customerKeyId: string): string {
  return path.join(rootDir(), sanitizeId(customerKeyId));
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/** Strip anything that isn't a safe filename character. */
function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'unknown';
}

/** Accepted MIME types → file extension. Reject anything else. */
const MIME_EXT: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/jpg':     'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
  'image/gif':     'gif',
};

export const MAX_ASSET_BYTES = 10 * 1024 * 1024; // 10 MB

export interface StoredAsset {
  /** Filename only — `<placeholder>__<uuid>.<ext>`. */
  fileName: string;
  /** URL the form value should hold and the PPT pipeline reads. */
  url: string;
  /** Absolute filesystem path. */
  absPath: string;
}

/**
 * Persist a customer-uploaded image. Returns the asset's relative URL,
 * which the questionnaire stores as the field value for that placeholder.
 *
 * Throws on invalid content type, oversize body, or weird placeholder name.
 */
export function storeAsset(opts: {
  customerKeyId: string;
  placeholderName: string;   // e.g. {{COMPANY_LOGO}}  or  COMPANY_LOGO
  contentType: string;
  buffer: Buffer;
}): StoredAsset {
  if (!opts.buffer || opts.buffer.length === 0) {
    throw new Error('Empty upload body.');
  }
  if (opts.buffer.length > MAX_ASSET_BYTES) {
    throw new Error(`File too large (max ${MAX_ASSET_BYTES / 1024 / 1024} MB).`);
  }
  const ext = MIME_EXT[opts.contentType.toLowerCase().split(';')[0].trim()];
  if (!ext) {
    throw new Error(`Unsupported file type: ${opts.contentType}. Use PNG, JPG, WebP, SVG, or GIF.`);
  }
  // Sanitize the placeholder name for use as a filename component.
  const phRaw = opts.placeholderName.replace(/^\{\{|\}\}$/g, '').trim();
  const ph = phRaw.replace(/[^A-Z0-9_]+/gi, '_').toUpperCase().slice(0, 60);
  if (!ph) throw new Error('Missing or invalid placeholder name.');

  const dir = customerDir(opts.customerKeyId);
  ensureDir(dir);

  const uniq = crypto.randomBytes(4).toString('hex');
  const fileName = `${ph}__${uniq}.${ext}`;
  const absPath = path.join(dir, fileName);
  fs.writeFileSync(absPath, opts.buffer);

  return {
    fileName,
    absPath,
    url: `/api/customer/deck-asset/${encodeURIComponent(fileName)}`,
  };
}

/** Resolve a stored asset filename back to its absolute path for a customer. */
export function resolveAsset(customerKeyId: string, fileName: string): string | null {
  // Reject path traversal / nested paths.
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return null;
  const abs = path.join(customerDir(customerKeyId), fileName);
  return fs.existsSync(abs) ? abs : null;
}

/** Best-effort content-type from filename extension, for serving back. */
export function contentTypeForFilename(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'png':  return 'image/png';
    case 'jpg':  case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'svg':  return 'image/svg+xml';
    case 'gif':  return 'image/gif';
    default:     return 'application/octet-stream';
  }
}
