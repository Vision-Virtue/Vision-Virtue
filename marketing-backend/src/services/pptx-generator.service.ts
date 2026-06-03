/* ============================================================
   Investor Deck — PPT placeholder replacer

   Given a customer's populated Financial Model xlsx (containing
   both `Investor_Deck_Questionnaire_Inputs` and
   `Investor_Deck_Calculations`) and the master pptx template,
   produce a populated pptx with every {{PLACEHOLDER}} swapped
   for its real value.

   How it works:
     1.  Open the xlsx as a zip; read sharedStrings.xml.
     2.  For each placeholder source sheet:
           - locate the sheet xml via workbook.xml + rels
           - iterate rows: find the cell whose resolved string
             matches {{X}} and read the value from the configured
             value column (E for the questionnaire sheet,
             D for the calculations sheet).
     3.  Merge both maps into `placeholder → value`.
           (Questionnaire wins on collisions because customers'
            answers are authoritative for qualitative content.)
     4.  Open the pptx zip; for every ppt/slides/slide*.xml,
         do a string-replace of `{{X}}` → value inside <a:t> text
         runs. Strings split across multiple <a:r> runs in the
         same paragraph are first stitched, then re-emitted as a
         single text run preserving the first run's formatting.
     5.  Save the populated pptx and return stats.

   Memory: both xlsx and pptx are read fully into memory via
   JSZip. Peak ~80 MB for a 2.7 MB pptx + 2.4 MB xlsx — safe to
   run in-process (no worker fork needed).
   ============================================================ */

import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

const QUESTIONNAIRE_SHEET = 'Investor_Deck_Questionnaire_Inputs';
const CALCULATIONS_SHEET  = 'Investor_Deck_Calculations';

// Column letters for the value cell in each sheet.
//   Questionnaire layout:  A Slide# | B Slide_Title | C Placeholder | D Question | E Answer_Value
//   Calculations layout:   A Slide# | B Slide_Title | C Placeholder | D Calculated_Value
const QUESTIONNAIRE_VALUE_COL = 'E';
const CALCULATIONS_VALUE_COL  = 'D';

// ─── XML helpers ─────────────────────────────────────────────────────────────

function arr<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

/** Resolve "C42" → column letters / row number. */
function parseAddr(addr: string): { col: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!m) throw new Error(`Bad cell address: ${addr}`);
  return { col: m[1], row: parseInt(m[2], 10) };
}

/** Pull every <si>'s concatenated <t> text into an array indexed by si position. */
function loadSharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return Promise.resolve([]);
  return file.async('string').then((xml) => {
    const out: string[] = [];
    // Iterate <si>…</si> blocks. Inside each <si> we may have a single <t>,
    // or multiple <r><t>…</t></r> runs — we just concatenate all <t> text.
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(xml))) {
      const inner = m[1];
      const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let parts = '';
      let t: RegExpExecArray | null;
      while ((t = tRe.exec(inner))) parts += t[1];
      out.push(decodeXmlEntities(parts));
    }
    return out;
  });
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function encodeXmlEntities(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Find the relative xl/worksheets/sheetN.xml path for a given sheet name. */
async function findSheetXmlPath(zip: JSZip, sheetName: string): Promise<string | null> {
  const wbFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!wbFile || !relsFile) return null;
  const wbXml = await wbFile.async('string');
  const relsXml = await relsFile.async('string');

  const sheetTagRe = new RegExp(`<sheet\\b[^/>]*name="${sheetName}"[^/>]*\\/>`);
  const sheetTag = sheetTagRe.exec(wbXml);
  if (!sheetTag) return null;
  const ridMatch = /r:id="([^"]+)"/.exec(sheetTag[0]);
  if (!ridMatch) return null;

  // Type contains URL chars (/), so we use string indexOf rather than a
  // character-class-based regex to locate the Relationship tag.
  const idMarker = `Id="${ridMatch[1]}"`;
  const idIdx = relsXml.indexOf(idMarker);
  if (idIdx < 0) return null;
  const tagStart = relsXml.lastIndexOf('<Relationship', idIdx);
  const tagEnd   = relsXml.indexOf('/>', idIdx);
  if (tagStart < 0 || tagEnd < 0) return null;
  const relTag = relsXml.slice(tagStart, tagEnd + 2);
  const target = /Target="([^"]+)"/.exec(relTag)?.[1];
  if (!target) return null;
  return target.startsWith('/')
    ? target.slice(1)
    : `xl/${target.replace(/^\.\//, '')}`;
}

// ─── Cell value resolution ───────────────────────────────────────────────────

interface CellInfo {
  type: string | null;  // 's', 'inlineStr', 'str', 'b', or null (numeric)
  /** Raw inner <v> text or null. */
  v: string | null;
  /** Inline string text (for t="inlineStr"). */
  inlineText: string | null;
  /** Raw cell XML (for fallback parsing). */
  raw: string;
}

/**
 * Parse one <c r="…">…</c> snippet into a structured CellInfo.
 * fast-xml-parser is overkill here; the cells are simple enough to scan
 * with focused regex (and avoiding the parser lets us keep the xlsx
 * portion of memory tiny).
 */
function parseCellXml(cellXml: string): CellInfo {
  const t = /\bt="([^"]+)"/.exec(cellXml)?.[1] || null;
  const v = /<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1] || null;
  const inlineText = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(cellXml)?.[1] || null;
  return { type: t, v, inlineText, raw: cellXml };
}

function resolveCellValue(cell: CellInfo, sharedStrings: string[]): string | null {
  if (cell.type === 's' && cell.v) {
    const idx = parseInt(cell.v, 10);
    return Number.isFinite(idx) && idx >= 0 && idx < sharedStrings.length
      ? sharedStrings[idx]
      : null;
  }
  if (cell.type === 'inlineStr' && cell.inlineText !== null) {
    return decodeXmlEntities(cell.inlineText);
  }
  if (cell.type === 'str' && cell.v !== null) {
    return decodeXmlEntities(cell.v);
  }
  if (cell.type === 'b' && cell.v !== null) {
    return cell.v === '1' ? 'TRUE' : 'FALSE';
  }
  // Numeric or no-type fall back to the <v> raw text.
  if (cell.v !== null) return cell.v;
  return null;
}

/**
 * Walk every <row>…</row> in a sheet xml, find rows whose Col-C value
 * resolves to a `{{X}}` placeholder, and read the value cell at the
 * configured value column. Returns Map<placeholder, value>.
 */
function extractPlaceholdersFromSheetXml(
  sheetXml: string,
  sharedStrings: string[],
  valueColLetter: string,
): Map<string, string> {
  const out = new Map<string, string>();
  // Pull each <row>…</row>. The sheet XML may use self-closing rows;
  // we only care about rows that contain cells.
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(sheetXml))) {
    const rowInner = rm[1];
    // Index cells by column letter.
    const cellRe = /<c\b[^>]*r="([A-Z]+)(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g;
    const cellsByCol = new Map<string, CellInfo>();
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowInner))) {
      const col = cm[1];
      cellsByCol.set(col, parseCellXml(cm[0]));
    }
    const placeholderCell = cellsByCol.get('C');
    if (!placeholderCell) continue;
    const placeholder = resolveCellValue(placeholderCell, sharedStrings);
    if (!placeholder) continue;
    const phMatch = /^\{\{([A-Z0-9_]+)\}\}$/.exec(placeholder.trim());
    if (!phMatch) continue;

    const valueCell = cellsByCol.get(valueColLetter);
    if (!valueCell) {
      out.set(phMatch[0], '');
      continue;
    }
    const value = resolveCellValue(valueCell, sharedStrings);
    out.set(phMatch[0], value === null ? '' : value);
  }
  return out;
}

/**
 * Read both sheets from the customer's xlsx and merge into one
 * placeholder → value map.
 */
export async function extractPlaceholdersFromXlsx(
  xlsxPath: string,
): Promise<{ map: Map<string, string>; sources: Record<string, string> }> {
  const buf = await fs.promises.readFile(xlsxPath);
  const zip = await JSZip.loadAsync(buf);
  const sharedStrings = await loadSharedStrings(zip);

  const sources: Record<string, string> = {};
  const merged = new Map<string, string>();

  // Calculations first; the questionnaire sheet can overwrite (the customer's
  // qualitative answer is authoritative for narrative placeholders).
  for (const [sheetName, valueCol] of [
    [CALCULATIONS_SHEET,  CALCULATIONS_VALUE_COL] as const,
    [QUESTIONNAIRE_SHEET, QUESTIONNAIRE_VALUE_COL] as const,
  ]) {
    const sheetPath = await findSheetXmlPath(zip, sheetName);
    if (!sheetPath) {
      console.warn(`[pptx-gen] sheet not found in xlsx: ${sheetName}`);
      continue;
    }
    const file = zip.file(sheetPath);
    if (!file) continue;
    const xml = await file.async('string');
    const partial = extractPlaceholdersFromSheetXml(xml, sharedStrings, valueCol);
    for (const [k, v] of partial) {
      merged.set(k, v);
      sources[k] = sheetName;
    }
  }

  return { map: merged, sources };
}

// ─── PPTX text replacement ───────────────────────────────────────────────────

/**
 * Walk every slide XML and replace {{X}} placeholders with the values
 * from `valueMap`. Handles the common case where placeholders sit
 * inside a single <a:t> run AND the harder case where PowerPoint has
 * split a placeholder across multiple <a:r> runs in the same paragraph
 * (e.g. when the customer hand-edited the template).
 *
 * Returns the count of replacements made plus the set of placeholders
 * the pptx referenced but the xlsx couldn't fill.
 */
function applyReplacementsToSlideXml(
  slideXml: string,
  valueMap: Map<string, string>,
  stats: { replaced: number; unmatched: Set<string> },
): string {
  // ── Pass 1: simple intra-run replacements ─────────────────────────────────
  // Replace any {{X}} that sits entirely inside a single <a:t>.
  let xml = slideXml.replace(/<a:t([^>]*)>([\s\S]*?)<\/a:t>/g, (_m, attrs: string, text: string) => {
    const decoded = decodeXmlEntities(text);
    let didReplace = false;
    const out = decoded.replace(/\{\{([A-Z0-9_]+)\}\}/g, (full, key) => {
      if (valueMap.has(full)) {
        stats.replaced += 1;
        didReplace = true;
        return valueMap.get(full) ?? '';
      }
      stats.unmatched.add(full);
      return full;
    });
    return `<a:t${attrs}>${encodeXmlEntities(didReplace ? out : decoded)}</a:t>`;
  });

  // ── Pass 2: cross-run placeholders ────────────────────────────────────────
  // PowerPoint sometimes splits text across <a:r> runs:
  //   <a:r><a:rPr/><a:t>{{COMP</a:t></a:r><a:r><a:rPr/><a:t>ANY_NAME}}</a:t></a:r>
  // We stitch each paragraph's text, look for placeholders, and rewrite
  // the paragraph with a single text run carrying the first run's rPr.
  xml = xml.replace(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g, (paraMatch, paraInner: string) => {
    // Skip cheap path: if no `{{` survives in the paragraph after pass 1, leave it alone.
    if (paraInner.indexOf('{{') < 0) return paraMatch;
    // Collect each <a:r>…</a:r> with its rPr + raw text.
    const runRe = /<a:r\b[^>]*>([\s\S]*?)<\/a:r>/g;
    const runs: Array<{ raw: string; rPr: string; text: string }> = [];
    let m: RegExpExecArray | null;
    let firstRunStart = -1;
    let lastRunEnd = -1;
    while ((m = runRe.exec(paraInner))) {
      if (firstRunStart < 0) firstRunStart = m.index;
      lastRunEnd = m.index + m[0].length;
      const inner = m[1];
      const rPr = /<a:rPr\b[^/>]*(?:\/>|>[\s\S]*?<\/a:rPr>)/.exec(inner)?.[0] || '';
      const t   = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/.exec(inner)?.[1] ?? '';
      runs.push({ raw: m[0], rPr, text: decodeXmlEntities(t) });
    }
    if (runs.length < 2) return paraMatch;  // single run already handled by pass 1
    const combined = runs.map(r => r.text).join('');
    if (combined.indexOf('{{') < 0) return paraMatch;

    let didReplace = false;
    const replaced = combined.replace(/\{\{([A-Z0-9_]+)\}\}/g, (full) => {
      if (valueMap.has(full)) {
        stats.replaced += 1;
        didReplace = true;
        return valueMap.get(full) ?? '';
      }
      stats.unmatched.add(full);
      return full;
    });
    if (!didReplace) return paraMatch;

    // Replace the entire run sequence with a single run carrying run 0's rPr.
    const newRun =
      `<a:r>${runs[0].rPr}<a:t>${encodeXmlEntities(replaced)}</a:t></a:r>`;
    return paraMatch.slice(0, paraMatch.indexOf(paraInner)) +
           paraInner.slice(0, firstRunStart) + newRun + paraInner.slice(lastRunEnd) +
           paraMatch.slice(paraMatch.indexOf(paraInner) + paraInner.length);
  });

  return xml;
}

export interface PptxGenStats {
  replaced: number;
  unmatched: string[];
  slidesProcessed: number;
}

/**
 * Generate a populated pptx for a given customer's xlsx.
 */
export async function generatePopulatedPptx(opts: {
  templatePptxPath: string;
  customerXlsxPath: string;
  outputPptxPath: string;
}): Promise<PptxGenStats> {
  if (!fs.existsSync(opts.templatePptxPath)) {
    throw new Error(`PPTX template not found at ${opts.templatePptxPath}`);
  }
  if (!fs.existsSync(opts.customerXlsxPath)) {
    throw new Error(`Customer xlsx not found at ${opts.customerXlsxPath}`);
  }

  const { map } = await extractPlaceholdersFromXlsx(opts.customerXlsxPath);

  // Normalize values: trim, treat "MISSING INPUT" / empty as "" so the
  // resulting pptx doesn't shout "MISSING INPUT" all over. The downstream
  // V&V workflow already has a separate "missing fields" report.
  const valueMap = new Map<string, string>();
  for (const [k, v] of map) {
    const trimmed = (v == null ? '' : String(v)).trim();
    const isMissing = /^MISSING INPUT/i.test(trimmed);
    valueMap.set(k, isMissing ? '' : trimmed);
  }

  const pptxBuf = await fs.promises.readFile(opts.templatePptxPath);
  const zip = await JSZip.loadAsync(pptxBuf);

  const stats: PptxGenStats = { replaced: 0, unmatched: [], slidesProcessed: 0 };
  const unmatchedSet = new Set<string>();
  const mut = { replaced: 0, unmatched: unmatchedSet };

  // Process every slide file in the pptx.
  const slideEntries = Object.keys(zip.files).filter(
    (k) => /^ppt\/slides\/slide\d+\.xml$/.test(k),
  );
  for (const key of slideEntries) {
    const xml = await zip.file(key)!.async('string');
    const updated = applyReplacementsToSlideXml(xml, valueMap, mut);
    zip.file(key, updated);
    stats.slidesProcessed += 1;
  }

  stats.replaced = mut.replaced;
  stats.unmatched = Array.from(unmatchedSet).sort();

  // Write output.
  const outBuf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  await fs.promises.mkdir(path.dirname(opts.outputPptxPath), { recursive: true });
  await fs.promises.writeFile(opts.outputPptxPath, outBuf);

  return stats;
}

// ─── Storage path helpers (mirrors partner-xlsx.service) ─────────────────────

export function customerPptxDir(): string {
  const dbPath = process.env.DB_PATH || './data/marketing.db';
  return path.join(path.dirname(path.resolve(dbPath)), 'customer-pptx');
}

export function pptxTemplatePath(): string {
  return path.resolve(process.cwd(), 'templates', 'VisionVirtue_InvestorDeck.pptx');
}

/** Filename convention: <safeCustomerName>__<submissionId>.pptx */
export function buildPptxFileName(customerName: string, submissionId: string): string {
  const safe = customerName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'customer';
  return `${safe}__${submissionId}.pptx`;
}

export function resolveStoredPptx(fileName: string): string | null {
  if (!fileName) return null;
  const candidate = path.isAbsolute(fileName)
    ? fileName
    : path.join(customerPptxDir(), fileName);
  return fs.existsSync(candidate) ? candidate : null;
}
