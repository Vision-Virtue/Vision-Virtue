"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ASSET_BYTES = void 0;
exports.storeAsset = storeAsset;
exports.resolveAsset = resolveAsset;
exports.contentTypeForFilename = contentTypeForFilename;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
function rootDir() {
    const dbPath = process.env.DB_PATH || './data/marketing.db';
    return path_1.default.join(path_1.default.dirname(path_1.default.resolve(dbPath)), 'customer-assets');
}
function customerDir(customerKeyId) {
    return path_1.default.join(rootDir(), sanitizeId(customerKeyId));
}
function ensureDir(p) {
    if (!fs_1.default.existsSync(p))
        fs_1.default.mkdirSync(p, { recursive: true });
}
/** Strip anything that isn't a safe filename character. */
function sanitizeId(s) {
    return s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'unknown';
}
/** Accepted MIME types → file extension. Reject anything else. */
const MIME_EXT = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/gif': 'gif',
};
exports.MAX_ASSET_BYTES = 10 * 1024 * 1024; // 10 MB
/**
 * Persist a customer-uploaded image. Returns the asset's relative URL,
 * which the questionnaire stores as the field value for that placeholder.
 *
 * Throws on invalid content type, oversize body, or weird placeholder name.
 */
function storeAsset(opts) {
    if (!opts.buffer || opts.buffer.length === 0) {
        throw new Error('Empty upload body.');
    }
    if (opts.buffer.length > exports.MAX_ASSET_BYTES) {
        throw new Error(`File too large (max ${exports.MAX_ASSET_BYTES / 1024 / 1024} MB).`);
    }
    const ext = MIME_EXT[opts.contentType.toLowerCase().split(';')[0].trim()];
    if (!ext) {
        throw new Error(`Unsupported file type: ${opts.contentType}. Use PNG, JPG, WebP, SVG, or GIF.`);
    }
    // Sanitize the placeholder name for use as a filename component.
    const phRaw = opts.placeholderName.replace(/^\{\{|\}\}$/g, '').trim();
    const ph = phRaw.replace(/[^A-Z0-9_]+/gi, '_').toUpperCase().slice(0, 60);
    if (!ph)
        throw new Error('Missing or invalid placeholder name.');
    const dir = customerDir(opts.customerKeyId);
    ensureDir(dir);
    const uniq = crypto_1.default.randomBytes(4).toString('hex');
    const fileName = `${ph}__${uniq}.${ext}`;
    const absPath = path_1.default.join(dir, fileName);
    fs_1.default.writeFileSync(absPath, opts.buffer);
    return {
        fileName,
        absPath,
        url: `/api/customer/deck-asset/${encodeURIComponent(fileName)}`,
    };
}
/** Resolve a stored asset filename back to its absolute path for a customer. */
function resolveAsset(customerKeyId, fileName) {
    // Reject path traversal / nested paths.
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..'))
        return null;
    const abs = path_1.default.join(customerDir(customerKeyId), fileName);
    return fs_1.default.existsSync(abs) ? abs : null;
}
/** Best-effort content-type from filename extension, for serving back. */
function contentTypeForFilename(fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        case 'svg': return 'image/svg+xml';
        case 'gif': return 'image/gif';
        default: return 'application/octet-stream';
    }
}
