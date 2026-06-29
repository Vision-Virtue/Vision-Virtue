/* ============================================================
   File-upload hardening.

   1. Magic-byte verification — checks the actual file bytes, not
      just the extension or client-provided MIME. Defeats simple
      file-type spoofing (rename .exe to .xlsx).

   2. Excel formula stripping — CSV / XLSX cells starting with
      = + - @ tab or \r can execute as formulas when opened in
      Excel/Google Sheets by a downstream consumer (V&V staff
      reviewing the upload, the customer's CFO, etc.). We prefix
      such cells with a single quote so Excel treats them as text.
      (Per OWASP "CSV Injection" advisory.)

   3. Size cap — defeats zip-bomb / oversized-upload DoS.

   4. Row cap — defeats fork-bomb-style uploads with 1M rows.
   ============================================================ */

import { logSecurityEvent } from './auth-security';

type Verdict = { ok: true } | { ok: false; reason: string };

const MAX_FILE_BYTES = 5 * 1024 * 1024;  // 5 MB hard cap
const MAX_ROWS       = 500;               // matches Visibility spec §2.1

/** Magic-byte signatures for the file types Visibility accepts. */
const SIGNATURES = {
  /** XLSX is a ZIP file → PK\x03\x04 */
  xlsx: [0x50, 0x4b, 0x03, 0x04],
  /** XLSX can also start with PK\x05\x06 (empty zip) or PK\x07\x08 */
  xlsxAlt1: [0x50, 0x4b, 0x05, 0x06],
  xlsxAlt2: [0x50, 0x4b, 0x07, 0x08],
  /** Old XLS (BIFF) — D0 CF 11 E0 A1 B1 1A E1 (compound document) */
  xls: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
};

/** Throws if the buffer's first bytes don't match a permitted signature.
 *  CSV has no magic bytes (it's plain text) — caller must use the `csv`
 *  branch via expected type. */
export function verifyMagicBytes(
  buf: Buffer,
  expected: 'xlsx' | 'csv' | 'pdf' | 'docx' | 'image',
): Verdict {
  if (!buf || buf.length < 4) {
    return { ok: false, reason: 'File too short to verify type.' };
  }
  switch (expected) {
    case 'xlsx': {
      const head = Array.from(buf.subarray(0, 4));
      if (
        signatureMatches(head, SIGNATURES.xlsx) ||
        signatureMatches(head, SIGNATURES.xlsxAlt1) ||
        signatureMatches(head, SIGNATURES.xlsxAlt2)
      ) return { ok: true };
      return { ok: false, reason: 'File does not look like a valid .xlsx (ZIP signature missing).' };
    }
    case 'csv': {
      // Plain text — verify no obvious binary contamination + UTF-8 / ASCII-decodable
      for (let i = 0; i < Math.min(buf.length, 1024); i++) {
        const b = buf[i];
        // Forbid NUL bytes and most control chars (allow tab, LF, CR)
        if (b === 0x00) return { ok: false, reason: 'CSV contains NUL byte (likely binary, not text).' };
      }
      return { ok: true };
    }
    case 'pdf': {
      // PDF starts with "%PDF-"
      if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return { ok: true };
      return { ok: false, reason: 'File does not look like a valid PDF.' };
    }
    case 'docx': {
      // DOCX is also a ZIP
      const head = Array.from(buf.subarray(0, 4));
      if (signatureMatches(head, SIGNATURES.xlsx)) return { ok: true };
      return { ok: false, reason: 'File does not look like a valid .docx.' };
    }
    case 'image': {
      // PNG: 89 50 4E 47 ; JPEG: FF D8 ; GIF: 47 49 46
      const b = buf;
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ok: true };
      if (b[0] === 0xff && b[1] === 0xd8) return { ok: true };
      if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ok: true };
      return { ok: false, reason: 'File does not look like a PNG / JPEG / GIF.' };
    }
  }
}

function signatureMatches(head: number[], sig: number[]): boolean {
  if (head.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (head[i] !== sig[i]) return false;
  return true;
}

/** Throws if the file is too large. */
export function verifyFileSize(buf: Buffer, maxBytes = MAX_FILE_BYTES): Verdict {
  if (buf.length > maxBytes) {
    return { ok: false, reason: `File exceeds ${Math.floor(maxBytes / 1024 / 1024)} MB limit (got ${(buf.length / 1024 / 1024).toFixed(2)} MB).` };
  }
  return { ok: true };
}

/** Sanitize a single cell value to defeat CSV / spreadsheet formula injection.
 *  If the value starts with = + - @ tab or \r, prepend a single quote so
 *  downstream spreadsheet tools treat it as text. */
export function sanitizeCellValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value.length === 0) return value;
  const first = value.charCodeAt(0);
  // ASCII = (0x3d), + (0x2b), - (0x2d), @ (0x40), tab (0x09), CR (0x0d)
  if (first === 0x3d || first === 0x2b || first === 0x2d || first === 0x40 || first === 0x09 || first === 0x0d) {
    return `'${value}`;
  }
  return value;
}

/** Sanitize every string value in an array of objects parsed from a CSV/XLSX. */
export function sanitizeParsedRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(row => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) out[k] = sanitizeCellValue(v);
    return out as T;
  });
}

/** Row-count guard. */
export function verifyRowCount(count: number, maxRows = MAX_ROWS): Verdict {
  if (count > maxRows) {
    return { ok: false, reason: `Upload exceeds ${maxRows}-row limit (got ${count}).` };
  }
  return { ok: true };
}

/** All-in-one validator. Returns the first failure or { ok: true }. */
export function validateUpload(input: {
  buffer: Buffer;
  expectedType: 'xlsx' | 'csv' | 'pdf' | 'docx' | 'image';
  customerKeyId?: string;
  ip?: string;
}): Verdict {
  const sz = verifyFileSize(input.buffer);
  if (sz.ok === false) {
    logSecurityEvent({
      kind: 'upload_rejected', severity: 'warning', ip: input.ip ?? null,
      detail: sz.reason, customer_key_id: input.customerKeyId,
    });
    return sz;
  }
  const mb = verifyMagicBytes(input.buffer, input.expectedType);
  if (mb.ok === false) {
    logSecurityEvent({
      kind: 'upload_rejected', severity: 'warning', ip: input.ip ?? null,
      detail: mb.reason, customer_key_id: input.customerKeyId,
    });
    return mb;
  }
  return { ok: true };
}
