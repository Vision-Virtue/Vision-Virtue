/* ============================================================
   Visibility — GL list parser

   Accepts the raw bytes of an .xlsx OR .csv file and returns
   the GL rows. Mandatory layout:
     Column A = GL Number
     Column B = GL Name

   xlsx parsing reuses the same JSZip + fast-xml-parser stack
   as the customer questionnaire worker, kept in-process here
   because GL files are small (≤500 rows) and shape is trivial.
   ============================================================ */

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export interface GLRow {
  glNumber: string;
  glName:   string;
}

export interface ParseResult {
  rows: GLRow[];
}

const MAX_ROWS = 500;

// ─── xlsx ───────────────────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  isArray: (n) => n === 'sheet' || n === 'Relationship' || n === 'row' || n === 'c' || n === 'si',
});

function colLetters(addr: string): string {
  const m = /^([A-Za-z]+)\d+$/.exec(addr);
  return m ? m[1].toUpperCase() : '';
}

async function parseXlsx(buf: Buffer): Promise<GLRow[]> {
  const zip = await JSZip.loadAsync(buf);

  // Pull shared strings (xlsx stores text values via index into sharedStrings.xml).
  const sstFile = zip.file('xl/sharedStrings.xml');
  const sst: string[] = [];
  if (sstFile) {
    const sstXml = await sstFile.async('string');
    const sstObj = xmlParser.parse(sstXml);
    const items = (sstObj?.sst?.si ?? []) as Array<{ t?: string | { '#text'?: string }; r?: Array<{ t?: string | { '#text'?: string } }> }>;
    for (const item of items) {
      // Plain <si><t>foo</t></si>
      if (item.t !== undefined) {
        sst.push(typeof item.t === 'string' ? item.t : (item.t['#text'] ?? ''));
        continue;
      }
      // Rich text runs <si><r><t>foo</t></r>...</si>
      if (item.r) {
        sst.push(item.r.map(run => typeof run.t === 'string' ? run.t : (run.t?.['#text'] ?? '')).join(''));
        continue;
      }
      sst.push('');
    }
  }

  // Find the first sheet that has data. Spec says "uploaded GL list" —
  // we accept whichever sheet looks right. In practice this is sheet1.
  const wbXml = await zip.file('xl/workbook.xml')!.async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const wbObj = xmlParser.parse(wbXml);
  const sheets = (wbObj?.workbook?.sheets?.sheet ?? []) as Array<{ '@_r:id'?: string }>;
  if (!sheets.length) throw new Error('xlsx contains no sheets');
  const rels = xmlParser.parse(relsXml);
  const relList = (rels?.Relationships?.Relationship ?? []) as Array<{ '@_Id'?: string; '@_Target'?: string }>;
  const rel = relList.find((r) => r['@_Id'] === sheets[0]['@_r:id']);
  if (!rel?.['@_Target']) throw new Error('xlsx has no sheet relationship');
  const sheetPath = rel['@_Target'].startsWith('/')
    ? rel['@_Target'].slice(1)
    : `xl/${rel['@_Target'].replace(/^\.\//, '')}`;

  const sheetXml = await zip.file(sheetPath)!.async('string');
  const sheetObj = xmlParser.parse(sheetXml);
  const rawRows = (sheetObj?.worksheet?.sheetData?.row ?? []) as Array<{
    '@_r'?: string;
    c?: Array<{ '@_r'?: string; '@_t'?: string; v?: string; is?: { t?: string | { '#text'?: string } } }>;
  }>;

  const result: GLRow[] = [];
  let firstDataRow = -1;

  for (const r of rawRows) {
    const rowNum = parseInt(r['@_r'] || '0', 10);
    const cells = r.c ?? [];

    let aText = '';
    let bText = '';
    for (const c of cells) {
      const col = colLetters(c['@_r'] || '');
      const t   = c['@_t'];
      let value = '';
      if (t === 'inlineStr' && c.is) {
        value = typeof c.is.t === 'string' ? c.is.t : (c.is.t?.['#text'] ?? '');
      } else if (t === 's' && c.v !== undefined) {
        const idx = parseInt(c.v, 10);
        value = sst[idx] ?? '';
      } else if (c.v !== undefined) {
        value = c.v;
      }
      if (col === 'A') aText = value.trim();
      else if (col === 'B') bText = value.trim();
    }

    // Skip header row: a row where A doesn't look like a number/code
    // and we haven't seen data yet.
    const looksLikeData = aText !== '' && bText !== '';
    if (!looksLikeData) continue;

    // First data row may still be a header — strip if A is something like
    // "GL Number" / "Number" / "GL #" etc.
    if (firstDataRow === -1) {
      firstDataRow = rowNum;
      if (/^(gl\s*(number|#|no\.?)|number|account|code)$/i.test(aText)) continue;
    }

    result.push({ glNumber: aText, glName: bText });
  }

  return result;
}

// ─── csv ────────────────────────────────────────────────────────────────────

function parseCsv(buf: Buffer): GLRow[] {
  // Strip BOM if present.
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const lines: string[][] = [];
  let i = 0;
  let field = '';
  let row: string[] = [];
  let inQuote = false;

  const pushField = (): void => { row.push(field); field = ''; };
  const pushRow   = (): void => { lines.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === ',') { pushField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { pushField(); pushRow(); i++; continue; }
    field += ch; i++;
  }
  pushField();
  if (row.length > 1 || row[0] !== '') pushRow();

  const out: GLRow[] = [];
  let firstSeen = false;
  for (const r of lines) {
    const a = (r[0] ?? '').trim();
    const b = (r[1] ?? '').trim();
    if (!a && !b) continue;
    if (!firstSeen) {
      firstSeen = true;
      if (/^(gl\s*(number|#|no\.?)|number|account|code)$/i.test(a)) continue;
    }
    if (!a || !b) {
      // Either missing → validation error
      throw new ParseError(
        `Row "${r.join(',')}" is missing GL Number or GL Name. Both columns are required.`,
      );
    }
    out.push({ glNumber: a, glName: b });
  }
  return out;
}

// ─── Public entry point ──────────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = 'ParseError';
  }
}

function isXlsx(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x50 && buf[1] === 0x4b &&
    buf[2] === 0x03 && buf[3] === 0x04
  );
}

export async function parseGLBuffer(
  buf: Buffer,
  filenameHint?: string,
): Promise<ParseResult> {
  let rows: GLRow[];
  if (isXlsx(buf)) {
    try {
      rows = await parseXlsx(buf);
    } catch (err) {
      throw new ParseError(
        err instanceof Error
          ? `Could not read the .xlsx file: ${err.message}`
          : 'Could not read the .xlsx file.',
      );
    }
  } else if (filenameHint && /\.csv$/i.test(filenameHint)) {
    rows = parseCsv(buf);
  } else {
    // No xlsx magic, no .csv hint — try CSV anyway (the browser may not
    // send a filename; CSV is plain text and harmless to attempt).
    rows = parseCsv(buf);
  }

  // Validation per spec §2.1
  if (rows.length === 0) {
    throw new ParseError('No GL rows found. Make sure column A is GL Number and column B is GL Name.');
  }
  if (rows.length > MAX_ROWS) {
    throw new ParseError(`Too many rows (${rows.length}). The maximum is ${MAX_ROWS}.`);
  }

  // Reject duplicate GL numbers within the same upload (the per-customer
  // unique constraint at the DB level would also catch this, but failing
  // early gives a friendlier message).
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.glNumber)) {
      throw new ParseError(`Duplicate GL Number "${r.glNumber}" in the file. Each GL Number must appear once.`);
    }
    seen.add(r.glNumber);
  }

  return { rows };
}

// ─── Salaries & Benefits upload parser (spec §7.2 + custom layout) ─────────
//
// Updated layout requested by Vision & Virtue:
//   Column A = Company Name        (matched to Org > Companies)
//   Column B = Employee Name       (free text)
//   Column C = Employer's Cost     (numeric, source currency)
//   Column D = Department Name     (matched to Org > Departments)
//   Column E = Exchange rate       (numeric > 0; Monthly Salary in
//                                   the budget currency = C / E)
//
// Company and Department names must match an existing entry in the
// customer's Organizational Structure exactly (case-insensitive,
// trimmed). The visibility controller does the matching and returns
// UNMAPPED_NAMES with the offending values if anything doesn't line up.

export interface SBUploadRow {
  companyName: string;
  employeeName: string;
  employersCost: number;
  departmentName: string;
  exchangeRate: number;
}

function readSBHeaders(a: string): boolean {
  return /^(company|company\s*name)$/i.test(a);
}

async function parseSBXlsx(buf: Buffer): Promise<SBUploadRow[]> {
  const zip = await JSZip.loadAsync(buf);
  const sstFile = zip.file('xl/sharedStrings.xml');
  const sst: string[] = [];
  if (sstFile) {
    const sstXml = await sstFile.async('string');
    const sstObj = xmlParser.parse(sstXml);
    const items = (sstObj?.sst?.si ?? []) as Array<{ t?: string | { '#text'?: string }; r?: Array<{ t?: string | { '#text'?: string } }> }>;
    for (const item of items) {
      if (item.t !== undefined) {
        sst.push(typeof item.t === 'string' ? item.t : (item.t['#text'] ?? ''));
        continue;
      }
      if (item.r) {
        sst.push(item.r.map(run => typeof run.t === 'string' ? run.t : (run.t?.['#text'] ?? '')).join(''));
        continue;
      }
      sst.push('');
    }
  }
  const wbXml = await zip.file('xl/workbook.xml')!.async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const wbObj = xmlParser.parse(wbXml);
  const sheets = (wbObj?.workbook?.sheets?.sheet ?? []) as Array<{ '@_r:id'?: string }>;
  if (!sheets.length) throw new Error('xlsx contains no sheets');
  const rels = xmlParser.parse(relsXml);
  const relList = (rels?.Relationships?.Relationship ?? []) as Array<{ '@_Id'?: string; '@_Target'?: string }>;
  const rel = relList.find((r) => r['@_Id'] === sheets[0]['@_r:id']);
  if (!rel?.['@_Target']) throw new Error('xlsx has no sheet relationship');
  const sheetPath = rel['@_Target'].startsWith('/')
    ? rel['@_Target'].slice(1)
    : `xl/${rel['@_Target'].replace(/^\.\//, '')}`;

  const sheetXml = await zip.file(sheetPath)!.async('string');
  const sheetObj = xmlParser.parse(sheetXml);
  const rawRows = (sheetObj?.worksheet?.sheetData?.row ?? []) as Array<{
    '@_r'?: string;
    c?: Array<{ '@_r'?: string; '@_t'?: string; v?: string; is?: { t?: string | { '#text'?: string } } }>;
  }>;

  const result: SBUploadRow[] = [];
  let firstDataRow = -1;
  for (const r of rawRows) {
    const rowNum = parseInt(r['@_r'] || '0', 10);
    const cells = r.c ?? [];
    let aText = '', bText = '', cText = '', dText = '', eText = '';
    for (const c of cells) {
      const col = colLetters(c['@_r'] || '');
      const t = c['@_t'];
      let value = '';
      if (t === 'inlineStr' && c.is) {
        value = typeof c.is.t === 'string' ? c.is.t : (c.is.t?.['#text'] ?? '');
      } else if (t === 's' && c.v !== undefined) {
        const idx = parseInt(c.v, 10);
        value = sst[idx] ?? '';
      } else if (c.v !== undefined) {
        value = c.v;
      }
      if      (col === 'A') aText = value.trim();
      else if (col === 'B') bText = value.trim();
      else if (col === 'C') cText = value.trim();
      else if (col === 'D') dText = value.trim();
      else if (col === 'E') eText = value.trim();
    }
    if (!aText && !bText && !cText && !dText && !eText) continue;
    if (firstDataRow === -1) {
      firstDataRow = rowNum;
      if (readSBHeaders(aText)) continue;
    }
    if (!aText) throw new ParseError(`Row ${rowNum}: Company Name (column A) is required.`);
    if (!bText) throw new ParseError(`Row ${rowNum}: Employee Name (column B) is required.`);
    if (!dText) throw new ParseError(`Row ${rowNum}: Department (column D) is required.`);
    const cost = Number(cText.replace(/[,$\s€£₪]/g, ''));
    const fx   = Number(eText.replace(/[,$\s€£₪]/g, ''));
    if (!Number.isFinite(cost)) throw new ParseError(`Row ${rowNum}: Employer's Cost (column C) must be a number; got "${cText}".`);
    if (!Number.isFinite(fx) || fx <= 0) throw new ParseError(`Row ${rowNum}: Exchange rate (column E) must be a positive number; got "${eText}".`);
    result.push({
      companyName:    aText,
      employeeName:   bText,
      employersCost:  cost,
      departmentName: dText,
      exchangeRate:   fx,
    });
  }
  return result;
}

function parseSBCsv(buf: Buffer): SBUploadRow[] {
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines: string[][] = [];
  let i = 0, field = '', row: string[] = [], inQuote = false;
  const pushField = (): void => { row.push(field); field = ''; };
  const pushRow   = (): void => { lines.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQuote = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === ',') { pushField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { pushField(); pushRow(); i++; continue; }
    field += ch; i++;
  }
  pushField();
  if (row.length > 1 || row[0] !== '') pushRow();

  const out: SBUploadRow[] = [];
  let firstSeen = false;
  let lineNo = 0;
  for (const r of lines) {
    lineNo++;
    const a = (r[0] ?? '').trim();
    const b = (r[1] ?? '').trim();
    const c = (r[2] ?? '').trim();
    const d = (r[3] ?? '').trim();
    const e = (r[4] ?? '').trim();
    if (!a && !b && !c && !d && !e) continue;
    if (!firstSeen) {
      firstSeen = true;
      if (readSBHeaders(a)) continue;
    }
    if (!a) throw new ParseError(`Row ${lineNo}: Company Name (column A) is required.`);
    if (!b) throw new ParseError(`Row ${lineNo}: Employee Name (column B) is required.`);
    if (!d) throw new ParseError(`Row ${lineNo}: Department (column D) is required.`);
    const cost = Number(c.replace(/[,$\s€£₪]/g, ''));
    const fx   = Number(e.replace(/[,$\s€£₪]/g, ''));
    if (!Number.isFinite(cost)) throw new ParseError(`Row ${lineNo}: Employer's Cost (column C) must be a number; got "${c}".`);
    if (!Number.isFinite(fx) || fx <= 0) throw new ParseError(`Row ${lineNo}: Exchange rate (column E) must be a positive number; got "${e}".`);
    out.push({
      companyName:    a,
      employeeName:   b,
      employersCost:  cost,
      departmentName: d,
      exchangeRate:   fx,
    });
  }
  return out;
}

export async function parseSBBuffer(buf: Buffer, filenameHint?: string): Promise<SBUploadRow[]> {
  let rows: SBUploadRow[];
  if (isXlsx(buf)) {
    try {
      rows = await parseSBXlsx(buf);
    } catch (err) {
      if (err instanceof ParseError) throw err;
      throw new ParseError(err instanceof Error ? `Could not read the .xlsx file: ${err.message}` : 'Could not read the .xlsx file.');
    }
  } else if (filenameHint && /\.csv$/i.test(filenameHint)) {
    rows = parseSBCsv(buf);
  } else {
    rows = parseSBCsv(buf);
  }
  if (rows.length === 0) {
    throw new ParseError('No salary rows found. Layout: A = Company, B = Employee Name, C = Employer\'s Cost, D = Department, E = Exchange rate.');
  }
  if (rows.length > MAX_ROWS) {
    throw new ParseError(`Too many rows (${rows.length}). The maximum is ${MAX_ROWS}.`);
  }
  return rows;
}
