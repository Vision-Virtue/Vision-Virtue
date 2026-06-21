"use strict";
/* ============================================================
   PPTX → PDF conversion via headless libreoffice
   Used by the Investors Marketplace deck viewer to render the
   customer's populated investor-deck PPTX as a view-only PDF for
   investors who have signed the NDA. The conversion is cached on
   disk per (listing_id, source_pptx_mtime) so libreoffice only
   runs once per source-deck revision.
   ============================================================ */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrBuildAutoDeckPdf = getOrBuildAutoDeckPdf;
exports.invalidateAutoDeckCache = invalidateAutoDeckCache;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const LIBREOFFICE_BIN = process.env.LIBREOFFICE_BIN || 'libreoffice';
const CONVERSION_TIMEOUT_MS = 90000;
/** Resolve the persistent cache dir on the Render disk (or local data dir). */
function autoDeckCacheDir() {
    const root = path_1.default.resolve(path_1.default.dirname(process.env.DB_PATH || './data/marketing.db'));
    const dir = path_1.default.join(root, 'marketplace-decks', 'auto');
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function cacheKey(listingId, pptxMtimeMs) {
    if (!/^[A-Za-z0-9-]+$/.test(listingId))
        throw new Error('Invalid listing id');
    return `${listingId}-${Math.floor(pptxMtimeMs)}.pdf`;
}
/** Convert a PPTX file at the given path to a PDF Buffer. */
function runLibreOffice(pptxPath) {
    return new Promise((resolve, reject) => {
        let tmpDir;
        try {
            tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'lo-pdf-'));
        }
        catch (err) {
            reject(err);
            return;
        }
        const proc = (0, child_process_1.spawn)(LIBREOFFICE_BIN, [
            '--headless',
            '--norestore',
            '--nologo',
            '--nofirststartwizard',
            '--convert-to', 'pdf',
            '--outdir', tmpDir,
            pptxPath,
        ], { timeout: CONVERSION_TIMEOUT_MS });
        let stderr = '';
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        proc.on('error', (err) => {
            try {
                fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
            }
            catch { /* ignore */ }
            reject(err);
        });
        proc.on('exit', (code) => {
            if (code !== 0) {
                try {
                    fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
                }
                catch { /* ignore */ }
                reject(new Error(`libreoffice exited with code ${code}. stderr=${stderr.slice(0, 600)}`));
                return;
            }
            const base = path_1.default.basename(pptxPath, path_1.default.extname(pptxPath));
            const outPath = path_1.default.join(tmpDir, base + '.pdf');
            if (!fs_1.default.existsSync(outPath)) {
                try {
                    fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
                }
                catch { /* ignore */ }
                reject(new Error('libreoffice produced no PDF. stderr=' + stderr.slice(0, 600)));
                return;
            }
            try {
                const buf = fs_1.default.readFileSync(outPath);
                try {
                    fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
                }
                catch { /* ignore */ }
                resolve(buf);
            }
            catch (err) {
                try {
                    fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
                }
                catch { /* ignore */ }
                reject(err);
            }
        });
    });
}
/**
 * Get the auto-converted PDF for a listing's source PPTX, using the on-disk
 * cache when fresh. Throws if libreoffice isn't available or conversion fails
 * — callers should fall back to the customer-uploaded PDF in that case.
 */
async function getOrBuildAutoDeckPdf(args) {
    const { listingId, pptxAbsPath } = args;
    const stat = fs_1.default.statSync(pptxAbsPath);
    const dir = autoDeckCacheDir();
    const key = cacheKey(listingId, stat.mtimeMs);
    const target = path_1.default.join(dir, key);
    if (fs_1.default.existsSync(target)) {
        return fs_1.default.readFileSync(target);
    }
    // Sweep older cached files for this listing so stale revisions don't pile up.
    try {
        const prefix = listingId + '-';
        for (const f of fs_1.default.readdirSync(dir)) {
            if (f.startsWith(prefix) && f !== key) {
                try {
                    fs_1.default.unlinkSync(path_1.default.join(dir, f));
                }
                catch { /* ignore */ }
            }
        }
    }
    catch { /* ignore */ }
    const buf = await runLibreOffice(pptxAbsPath);
    try {
        fs_1.default.writeFileSync(target, buf);
    }
    catch { /* writing cache is best-effort */ }
    return buf;
}
/** Invalidate the cache for a listing — called when the customer re-publishes
 *  or the source PPTX is regenerated. */
function invalidateAutoDeckCache(listingId) {
    try {
        const dir = autoDeckCacheDir();
        const prefix = listingId + '-';
        for (const f of fs_1.default.readdirSync(dir)) {
            if (f.startsWith(prefix)) {
                try {
                    fs_1.default.unlinkSync(path_1.default.join(dir, f));
                }
                catch { /* ignore */ }
            }
        }
    }
    catch { /* ignore */ }
}
