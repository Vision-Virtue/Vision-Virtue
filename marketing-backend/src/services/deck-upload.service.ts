/* ============================================================
   Customer "drag-and-drop" upload store + text extractor

   Customer drops PDF / DOCX / PPTX / XLSX files in the capitaflow
   portal; we persist them on the same disk as customer-xlsx
   and customer-assets, then surface them to AI Finance where
   text extraction + Claude orchestration produce the deck.

   Layout on disk:

     <data root>/
       customer-uploads/
         <customerKeyId>/
           <fileId>.<ext>         ← original bytes
           <fileId>.meta.json     ← sidecar metadata

   Sidecar JSON shape:
     {
       id:             "<uuid>",
       originalName:   "deck.pptx",
       mimeType:       "application/...",
       sizeBytes:      48201,
       uploadedAt:     "2026-06-03T12:00:00.000Z",
       extractedText:  "…"      ← present once extraction has run
       extractedAt:    "…"      ← present once extraction has run
       extractedError: "…"      ← present if extraction failed
     }

   Why sidecars and not a DB row? Mirrors the existing pattern
   used by capitaflow-xlsx and deck-asset services — file system
   is the source of truth, no schema migration needed, and the
   admin can sort by mtime to see new uploads.
   ============================================================ */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ─── Paths ────────────────────────────────────────────────────────────────────

function rootDir(): string {
  const dbPath = process.env.DB_PATH || './data/marketing.db';
  return path.join(path.dirname(path.resolve(dbPath)), 'customer-uploads');
}

function customerDir(customerKeyId: string): string {
  return path.join(rootDir(), sanitizeId(customerKeyId));
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'unknown';
}

// ─── MIME → extension whitelist ──────────────────────────────────────────────

const MIME_EXT: Record<string, string> = {
  'application/pdf':                                                          'pdf',
  'application/msword':                                                       'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':  'docx',
  'application/vnd.ms-powerpoint':                                            'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx',
  'application/vnd.ms-excel':                                                 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':        'xlsx',
  // Images — used as company logos for the Investors Marketplace tile and
  // the investor-deck cover. Accepted in the customer drag&drop area.
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/jpg':     'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
  'image/gif':     'gif',
};

// Fallback: try to infer extension from the original filename when the
// browser sends application/octet-stream or a vendor-specific MIME we
// don't recognise.
function extFromName(name: string): string | null {
  const m = /\.([a-zA-Z0-9]{2,5})$/.exec(name || '');
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (['pdf','doc','docx','ppt','pptx','xls','xlsx'].includes(ext)) return ext;
  return null;
}

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30 MB — investor decks can be big

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeckUploadMeta {
  id:             string;
  fileName:       string;
  originalName:   string;
  mimeType:       string;
  ext:            string;
  sizeBytes:      number;
  uploadedAt:     string;
  url:            string;
  extractedAt?:   string;
  extractedError?: string;
  hasExtractedText: boolean;
}

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Persist a customer upload. The buffer is checked for size + a usable
 * extension (from MIME or filename). Returns metadata; the file is not
 * extracted yet — call extractText() lazily.
 */
export function storeUpload(opts: {
  customerKeyId: string;
  originalName:  string;
  mimeType:      string;
  buffer:        Buffer;
}): DeckUploadMeta {
  if (!opts.buffer || opts.buffer.length === 0) {
    throw new Error('Empty upload body.');
  }
  if (opts.buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);
  }
  const lcMime = (opts.mimeType || '').toLowerCase().split(';')[0].trim();
  const ext = MIME_EXT[lcMime] || extFromName(opts.originalName);
  if (!ext) {
    throw new Error(`Unsupported file type: ${opts.mimeType || 'unknown'}. ` +
                    'Use PDF, Word (.doc/.docx), PowerPoint (.ppt/.pptx) or Excel (.xls/.xlsx).');
  }

  const dir = customerDir(opts.customerKeyId);
  ensureDir(dir);
  const id = crypto.randomBytes(8).toString('hex');
  const fileName = `${id}.${ext}`;
  const absPath  = path.join(dir, fileName);
  fs.writeFileSync(absPath, opts.buffer);

  const meta: Omit<DeckUploadMeta, 'url' | 'hasExtractedText'> & {
    extractedText?: string;
  } = {
    id,
    fileName,
    originalName: opts.originalName || fileName,
    mimeType:     lcMime || 'application/octet-stream',
    ext,
    sizeBytes:    opts.buffer.length,
    uploadedAt:   new Date().toISOString(),
  };
  fs.writeFileSync(metaPath(dir, id), JSON.stringify(meta, null, 2));

  return toPublicMeta(meta);
}

function metaPath(dir: string, id: string): string {
  return path.join(dir, `${id}.meta.json`);
}

function toPublicMeta(raw: Record<string, unknown>): DeckUploadMeta {
  return {
    id:               String(raw.id),
    fileName:         String(raw.fileName),
    originalName:     String(raw.originalName),
    mimeType:         String(raw.mimeType),
    ext:              String(raw.ext),
    sizeBytes:        Number(raw.sizeBytes) || 0,
    uploadedAt:       String(raw.uploadedAt),
    url:              `/api/customer/deck-upload/${encodeURIComponent(String(raw.id))}`,
    extractedAt:      raw.extractedAt ? String(raw.extractedAt) : undefined,
    extractedError:   raw.extractedError ? String(raw.extractedError) : undefined,
    hasExtractedText: typeof raw.extractedText === 'string' && raw.extractedText.length > 0,
  };
}

/** All uploads for one customer, newest first. */
export function listUploads(customerKeyId: string): DeckUploadMeta[] {
  const dir = customerDir(customerKeyId);
  if (!fs.existsSync(dir)) return [];
  const out: DeckUploadMeta[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.meta.json')) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      out.push(toPublicMeta(meta));
    } catch { /* skip malformed sidecar */ }
  }
  return out.sort((a, b) => (b.uploadedAt > a.uploadedAt ? 1 : -1));
}

/** Absolute path to one upload's payload file (or null if not found). */
export function resolveUpload(customerKeyId: string, fileId: string): string | null {
  if (!fileId.match(/^[a-zA-Z0-9_-]{1,64}$/)) return null;
  const dir = customerDir(customerKeyId);
  if (!fs.existsSync(dir)) return null;
  // The id may not include the extension, so scan the dir for any file
  // that begins with `<id>.`.
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(`${fileId}.`) && !f.endsWith('.meta.json')) {
      return path.join(dir, f);
    }
  }
  return null;
}

export function readMeta(customerKeyId: string, fileId: string): Record<string, unknown> | null {
  if (!fileId.match(/^[a-zA-Z0-9_-]{1,64}$/)) return null;
  const p = metaPath(customerDir(customerKeyId), fileId);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

export function writeMeta(customerKeyId: string, fileId: string, meta: Record<string, unknown>): void {
  ensureDir(customerDir(customerKeyId));
  fs.writeFileSync(metaPath(customerDir(customerKeyId), fileId), JSON.stringify(meta, null, 2));
}

/** Delete the file payload + sidecar. Returns true if anything was removed. */
export function deleteUpload(customerKeyId: string, fileId: string): boolean {
  if (!fileId.match(/^[a-zA-Z0-9_-]{1,64}$/)) return false;
  const dir = customerDir(customerKeyId);
  if (!fs.existsSync(dir)) return false;
  let removed = false;
  for (const f of fs.readdirSync(dir)) {
    if (f === `${fileId}.meta.json` || f.startsWith(`${fileId}.`)) {
      try { fs.unlinkSync(path.join(dir, f)); removed = true; } catch { /* swallow */ }
    }
  }
  return removed;
}

// ─── Text extraction ──────────────────────────────────────────────────────────

/**
 * Extract plain text from one stored upload. Uses pdf-parse for PDF,
 * mammoth for DOCX, JSZip+XML for PPTX, JSZip+XML for XLSX. .doc and .ppt
 * (legacy binary formats) are not supported — caller should ask the
 * customer to re-save as the modern OOXML format.
 *
 * Idempotent: re-running extracts again (and overwrites the cached text).
 */
export async function extractText(customerKeyId: string, fileId: string): Promise<string> {
  const meta = readMeta(customerKeyId, fileId);
  if (!meta) throw new Error(`Upload not found: ${fileId}`);
  const abs = resolveUpload(customerKeyId, fileId);
  if (!abs) throw new Error(`Upload payload missing: ${fileId}`);

  const ext = String(meta.ext);
  let text = '';
  try {
    if (ext === 'pdf') {
      // pdf-parse v2 exposes a PDFParse class; older v1 was a callable
      // function. Use the class form.
      const pdfMod = (await import('pdf-parse')) as unknown as { PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text?: string }> } };
      const data  = await new pdfMod.PDFParse({ data: await fs.promises.readFile(abs) }).getText();
      text = String(data?.text || '').trim();
    } else if (ext === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: abs });
      text = String(result.value || '').trim();
    } else if (ext === 'pptx') {
      text = await extractPptxText(abs);
    } else if (ext === 'xlsx') {
      text = await extractXlsxText(abs);
    } else if (ext === 'doc' || ext === 'ppt') {
      throw new Error(`Legacy ${ext.toUpperCase()} format not supported — please re-save as .${ext}x.`);
    } else {
      throw new Error(`No extractor for .${ext}`);
    }
    meta.extractedText  = text;
    meta.extractedAt    = new Date().toISOString();
    delete meta.extractedError;
    writeMeta(customerKeyId, fileId, meta);
    return text;
  } catch (err) {
    meta.extractedError = err instanceof Error ? err.message : String(err);
    meta.extractedAt    = new Date().toISOString();
    writeMeta(customerKeyId, fileId, meta);
    throw err;
  }
}

/**
 * Get the previously-extracted text. Triggers extraction on first call.
 */
export async function getOrExtractText(customerKeyId: string, fileId: string): Promise<string> {
  const meta = readMeta(customerKeyId, fileId);
  if (meta && typeof meta.extractedText === 'string' && meta.extractedText.length > 0) {
    return meta.extractedText as string;
  }
  return extractText(customerKeyId, fileId);
}

// ─── PPTX text extraction (JSZip + slide XMLs) ───────────────────────────────

async function extractPptxText(absPath: string): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const buf = await fs.promises.readFile(absPath);
  const zip = await JSZip.loadAsync(buf);

  const slideFiles = Object.keys(zip.files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)\.xml$/)?.[1] || '0', 10);
      const nb = parseInt(b.match(/(\d+)\.xml$/)?.[1] || '0', 10);
      return na - nb;
    });

  const parts: string[] = [];
  for (const k of slideFiles) {
    const xml = await zip.file(k)!.async('string');
    // Extract every <a:t> text run, concatenate, separate by newline per
    // paragraph (<a:p>).
    const paraRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
    const tRe    = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
    const slideTextLines: string[] = [];
    let pm: RegExpExecArray | null;
    while ((pm = paraRe.exec(xml))) {
      const paraInner = pm[1];
      let line = '';
      let tm: RegExpExecArray | null;
      while ((tm = tRe.exec(paraInner))) {
        line += decodeEntities(tm[1]);
      }
      const trimmed = line.trim();
      if (trimmed) slideTextLines.push(trimmed);
    }
    if (slideTextLines.length) {
      const idx = parseInt(k.match(/(\d+)\.xml$/)?.[1] || '0', 10);
      parts.push(`# Slide ${idx}\n${slideTextLines.join('\n')}`);
    }
  }
  return parts.join('\n\n');
}

// ─── XLSX text extraction (JSZip + sharedStrings + sheet XMLs) ───────────────

async function extractXlsxText(absPath: string): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const buf = await fs.promises.readFile(absPath);
  const zip = await JSZip.loadAsync(buf);

  // 1. shared strings
  const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string') || '';
  const sharedStrings: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let sm: RegExpExecArray | null;
  while ((sm = siRe.exec(ssXml))) {
    const tMatches = [...sm[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)];
    sharedStrings.push(decodeEntities(tMatches.map(m => m[1]).join('')));
  }

  // 2. iterate all sheets
  const wbXml = await zip.file('xl/workbook.xml')?.async('string') || '';
  const sheetMatches = [...wbXml.matchAll(/<sheet\b[^/>]*name="([^"]+)"[^/>]*\/>/g)];
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string') || '';

  const out: string[] = [];
  for (const sm of sheetMatches) {
    const sheetTag = sm[0];
    const sheetName = sm[1];
    const ridMatch = /r:id="([^"]+)"/.exec(sheetTag);
    if (!ridMatch) continue;
    const idMarker = `Id="${ridMatch[1]}"`;
    const idIdx = relsXml.indexOf(idMarker);
    if (idIdx < 0) continue;
    const tagStart = relsXml.lastIndexOf('<Relationship', idIdx);
    const tagEnd   = relsXml.indexOf('/>', idIdx);
    if (tagStart < 0 || tagEnd < 0) continue;
    const relTag = relsXml.slice(tagStart, tagEnd + 2);
    const target = /Target="([^"]+)"/.exec(relTag)?.[1];
    if (!target) continue;
    const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const sheetXml = await zip.file(sheetPath)?.async('string');
    if (!sheetXml) continue;

    const lines: string[] = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(sheetXml))) {
      const cellRe = /<c\b[^>]*?(?:t="([^"]*)")?[^>]*>([\s\S]*?)<\/c>/g;
      const rowCells: string[] = [];
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1]))) {
        const ctype = cm[1] || '';
        const inner = cm[2];
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        const is = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1];
        let val = '';
        if (ctype === 's' && v !== undefined) {
          const idx = parseInt(v, 10);
          val = (Number.isFinite(idx) && sharedStrings[idx]) || '';
        } else if (ctype === 'inlineStr' && is !== undefined) {
          val = decodeEntities(is);
        } else if (v !== undefined) {
          val = v;
        }
        if (val) rowCells.push(val);
      }
      if (rowCells.length) lines.push(rowCells.join('\t'));
    }
    if (lines.length) out.push(`## Sheet: ${sheetName}\n${lines.join('\n')}`);
  }
  return out.join('\n\n');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
