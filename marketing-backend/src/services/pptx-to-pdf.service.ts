/* ============================================================
   PPTX → PDF conversion via headless libreoffice
   Used by the Investors Marketplace deck viewer to render the
   customer's populated investor-deck PPTX as a view-only PDF for
   investors who have signed the NDA. The conversion is cached on
   disk per (listing_id, source_pptx_mtime) so libreoffice only
   runs once per source-deck revision.
   ============================================================ */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LIBREOFFICE_BIN = process.env.LIBREOFFICE_BIN || 'libreoffice';
const CONVERSION_TIMEOUT_MS = 90_000;

/** Resolve the persistent cache dir on the Render disk (or local data dir). */
function autoDeckCacheDir(): string {
  const root = path.resolve(path.dirname(process.env.DB_PATH || './data/marketing.db'));
  const dir = path.join(root, 'marketplace-decks', 'auto');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheKey(listingId: string, pptxMtimeMs: number): string {
  if (!/^[A-Za-z0-9-]+$/.test(listingId)) throw new Error('Invalid listing id');
  return `${listingId}-${Math.floor(pptxMtimeMs)}.pdf`;
}

/** Convert a PPTX file at the given path to a PDF Buffer. */
function runLibreOffice(pptxPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let tmpDir: string;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-pdf-'));
    } catch (err) {
      reject(err as Error); return;
    }
    const proc = spawn(LIBREOFFICE_BIN, [
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
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      reject(err);
    });
    proc.on('exit', (code) => {
      if (code !== 0) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        reject(new Error(`libreoffice exited with code ${code}. stderr=${stderr.slice(0, 600)}`));
        return;
      }
      const base = path.basename(pptxPath, path.extname(pptxPath));
      const outPath = path.join(tmpDir, base + '.pdf');
      if (!fs.existsSync(outPath)) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        reject(new Error('libreoffice produced no PDF. stderr=' + stderr.slice(0, 600)));
        return;
      }
      try {
        const buf = fs.readFileSync(outPath);
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        resolve(buf);
      } catch (err) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        reject(err as Error);
      }
    });
  });
}

/**
 * Get the auto-converted PDF for a listing's source PPTX, using the on-disk
 * cache when fresh. Throws if libreoffice isn't available or conversion fails
 * — callers should fall back to the customer-uploaded PDF in that case.
 */
export async function getOrBuildAutoDeckPdf(args: {
  listingId: string;
  pptxAbsPath: string;
}): Promise<Buffer> {
  const { listingId, pptxAbsPath } = args;
  const stat = fs.statSync(pptxAbsPath);
  const dir = autoDeckCacheDir();
  const key = cacheKey(listingId, stat.mtimeMs);
  const target = path.join(dir, key);

  if (fs.existsSync(target)) {
    return fs.readFileSync(target);
  }

  // Sweep older cached files for this listing so stale revisions don't pile up.
  try {
    const prefix = listingId + '-';
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(prefix) && f !== key) {
        try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  const buf = await runLibreOffice(pptxAbsPath);
  try { fs.writeFileSync(target, buf); } catch { /* writing cache is best-effort */ }
  return buf;
}

/** Invalidate the cache for a listing — called when the customer re-publishes
 *  or the source PPTX is regenerated. */
export function invalidateAutoDeckCache(listingId: string): void {
  try {
    const dir = autoDeckCacheDir();
    const prefix = listingId + '-';
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(prefix)) {
        try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}
