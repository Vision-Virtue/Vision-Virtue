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
import * as XLSX from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';
import { XMLValidator } from 'fast-xml-parser';
import {
  rewriteAffectedParagraphs, SlideRewriteInput,
} from './slide-rewriter.service';
import { INVESTOR_DECK_FIELDS } from '../data/investor-deck-schema';
import { listUploads, getOrExtractText } from './deck-upload.service';

const EXTRACTOR_MODEL = 'claude-sonnet-4-20250514';
const EXTRACTOR_MAX_TOKENS = 8192;
// Tight char caps keep the per-call input under ~15K tokens so we have room
// for retries inside Anthropic's 30K-input-tokens-per-minute tier.
//   ~4 chars/token -> 60K chars ≈ 15K tokens of source data.
//   PLUS placeholders list + system prompt ≈ another 2-3K tokens.
const EXTRACTOR_MAX_WORKBOOK_CHARS = 35_000;
const EXTRACTOR_MAX_UPLOADS_CHARS  = 25_000;

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

/**
 * Strip characters that are illegal in XML 1.0. Valid range is:
 *   #x09, #x0A, #x0D, #x20-#xD7FF, #xE000-#xFFFD, #x10000-#x10FFFF
 * Claude occasionally emits stray control chars (especially around emoji /
 * weird whitespace). Leaving them in produces XML that JS regex thinks is
 * well-formed but that PowerPoint rejects with "can't read".
 *
 * U+10000+ is encoded as a surrogate pair in a JS string -- we keep both
 * halves of a valid pair and drop any lone surrogate.
 */
function stripXmlIllegal(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x09 || c === 0x0A || c === 0x0D) { out += s[i]; continue; }
    if (c >= 0x20 && c <= 0xD7FF)               { out += s[i]; continue; }
    if (c >= 0xE000 && c <= 0xFFFD)             { out += s[i]; continue; }
    if (c >= 0xD800 && c <= 0xDBFF) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        out += s[i] + s[i + 1];
        i++;
      }
      continue;
    }
    // Lone low surrogate, U+FFFE, U+FFFF, or other illegal -- drop.
  }
  return out;
}

function encodeXmlEntities(s: string): string {
  return stripXmlIllegal(s)
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

// ─── NEW: Claude-driven placeholder extraction ──────────────────────────────
//
// Replaces the rigid sheet-name + column-letter lookup with a single LLM call
// that:
//   1. Reads ALL sheets from the customer's xlsx (no schema assumption)
//   2. Reads any text the customer dropped into the partner-portal dropzone
//   3. Reads the unique {{PLACEHOLDER}} list from the template pptx
//   4. Asks Claude to produce a JSON map { "{{X}}": "formatted value", ... }
//
// Numbers come back already formatted for an investor deck ($12M / 73% / 3.5x),
// and any placeholder with no supporting data resolves to an empty string so the
// downstream cleanup pass strips its <a:r> run + parent <a:p> paragraph.

/** Dump every sheet in the workbook to a readable text block. */
function readWorkbookAsText(xlsxPath: string): string {
  const wb = XLSX.readFile(xlsxPath, { cellDates: true, cellNF: false, cellText: false });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    // sheet_to_csv gives a flat readable dump (tab-separated would be cleaner
    // but CSV is unambiguous and Claude tolerates either). Empty rows at the
    // tail are auto-trimmed by sheet_to_csv with skipHidden=false.
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (!csv.trim()) continue;
    parts.push(`### Sheet: ${sheetName}\n${csv.trim()}`);
  }
  return parts.join('\n\n---\n\n');
}

/** Collect every unique {{PLACEHOLDER}} token referenced by any slide XML. */
async function collectUniquePlaceholders(templatePptxPath: string): Promise<string[]> {
  const buf = await fs.promises.readFile(templatePptxPath);
  const zip = await JSZip.loadAsync(buf);
  const found = new Set<string>();
  const slideEntries = Object.keys(zip.files).filter(
    (k) => /^ppt\/slides\/slide\d+\.xml$/.test(k),
  );
  for (const key of slideEntries) {
    const xml = await zip.file(key)!.async('string');
    const matches = xml.match(/\{\{[A-Z0-9_]+\}\}/g);
    if (!matches) continue;
    for (const m of matches) found.add(m);
  }
  return Array.from(found).sort();
}

/** Build a single text dump of every customer upload's extracted body. */
async function gatherUploadsText(customerKeyId: string): Promise<string> {
  let uploads: Array<{ id: string; originalName: string; ext: string }>;
  try {
    uploads = listUploads(customerKeyId);
  } catch (err) {
    console.warn('[pptx-gen] listUploads failed (continuing without uploads):', err);
    return '';
  }
  const parts: string[] = [];
  for (const u of uploads) {
    let text = '';
    try {
      text = await getOrExtractText(customerKeyId, u.id);
    } catch (err) {
      parts.push(`### Upload: ${u.originalName}\n[extraction failed: ${err instanceof Error ? err.message : 'unknown'}]`);
      continue;
    }
    if (!text.trim()) continue;
    parts.push(`### Upload: ${u.originalName} (${u.ext.toUpperCase()})\n${text.trim()}`);
  }
  return parts.join('\n\n---\n\n');
}

const EXTRACTOR_SYSTEM_PROMPT =
  'You are filling placeholders in a Vision & Virtue investor-deck PowerPoint ' +
  'template from a customer\'s populated Excel financial model and any supporting ' +
  'materials they have uploaded. Return ONLY a valid JSON object mapping each ' +
  '{{PLACEHOLDER}} token to its correctly formatted value.' +
  '\n\nFORMATTING RULES (apply to every value you return):' +
  '\n  - Currency in millions: "$XM" (e.g. 12_000_000 -> "$12M", 1_500_000 -> "$1.5M")' +
  '\n  - Currency in thousands: "$XK" (e.g. 40_000 -> "$40K", 2_400_000 -> "$2.4M")' +
  '\n  - Percentages: "XX%" (e.g. 0.42 -> "42%", 42 -> "42%", 0.073 -> "7.3%")' +
  '\n  - Multiples / runway: "X.Xx" (e.g. 3.5 -> "3.5x")' +
  '\n  - Ratios / scores: one decimal' +
  '\n  - Counts: thousands-separator commas (e.g. 12345 -> "12,345")' +
  '\n  - Years: 4-digit ("2026")' +
  '\n  - Short strings should fit on a slide (one phrase, no full sentences unless the' +
  ' placeholder name implies long text).' +
  '\n\nDATA-FINDING RULES:' +
  '\n  - The customer\'s Excel structure may vary. Look at ALL sheets. Match by the' +
  ' placeholder name, by the row label, by financial intuition, or by context.' +
  '\n  - If a calc placeholder is implied by the data even without an exact label, infer' +
  ' it (e.g. sum the revenue rows for {{REV_Y1}} if a Year-1 column exists).' +
  '\n  - If a placeholder is qualitative (company description, founders, market) and the' +
  ' customer uploaded materials, draw from those uploads.' +
  '\n  - If neither the Excel nor the uploads support a placeholder, set its value to' +
  ' "" (empty string). Never write "TBD", "N/A", "Unknown", "various", or any filler.' +
  ' Never invent facts.' +
  '\n\nOUTPUT RULES:' +
  '\n  - Return ONLY the JSON object. No markdown fences, no commentary, no preface.' +
  '\n  - Start with "{" and end with "}".' +
  '\n  - Include every placeholder from the list -- if you can\'t fill it, return "".';

function clipForBudget(s: string, maxChars: number): string {
  const trimmed = s.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars) +
         `\n\n[... ${trimmed.length - maxChars} chars truncated to fit token budget ...]`;
}

function buildExtractorUserPrompt(
  workbookText: string,
  uploadsText: string,
  placeholders: string[],
): string {
  // Placeholder names only -- the names are self-descriptive enough
  // ({{COMPANY_NAME}}, {{ROUND_SIZE}}, {{REV_Y1}}, etc.) that the per-field
  // schema enrichment (~5K tokens) wasn't paying for itself.
  const placeholderBlock = placeholders.map((p) => `  - ${p}`).join('\n');

  // Aggressive per-source caps -- two skinny blocks instead of one giant
  // combined cap. Workbook and uploads share token budget, but each gets a
  // hard ceiling so a 200K-char PDF can't crowd out the financial model.
  const workbookClipped = clipForBudget(workbookText, EXTRACTOR_MAX_WORKBOOK_CHARS);
  const uploadsClipped  = clipForBudget(uploadsText,  EXTRACTOR_MAX_UPLOADS_CHARS);

  let sources = '';
  if (workbookClipped) sources += `EXCEL (all sheets):\n\n${workbookClipped}`;
  if (uploadsClipped)  sources += (sources ? '\n\n=================\n\n' : '') +
                                  `CUSTOMER UPLOADS (extracted text):\n\n${uploadsClipped}`;
  if (!sources)        sources  = '(no source data supplied)';

  return `${sources}\n\n=================\n\nPLACEHOLDERS (return a value for every one; "" if unsupported):\n${placeholderBlock}\n\nReturn the JSON object now.`;
}

let _extractorClient: Anthropic | null = null;
function extractorClient(): Anthropic {
  if (_extractorClient) return _extractorClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');
  _extractorClient = new Anthropic({ apiKey: key });
  return _extractorClient;
}

function findMatchingBrace(str: string, start: number): number {
  let depth = 0; let inString = false; let escape = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function parseExtractorJson(raw: string): Record<string, string> {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fence ? fence[1] : raw).trim();
  try {
    return JSON.parse(candidate) as Record<string, string>;
  } catch {
    const start = candidate.indexOf('{');
    if (start < 0) throw new Error('Claude returned no JSON object.');
    const end = findMatchingBrace(candidate, start);
    if (end < 0) throw new Error('Claude JSON object is unterminated.');
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, string>;
  }
}

/**
 * Replacement for `extractPlaceholdersFromXlsx`. Reads every sheet of the
 * customer's Excel + any text already extracted from their portal uploads,
 * collects every unique placeholder from the template pptx, and asks Claude
 * to return one ready-to-replace value map. Numbers come back already
 * formatted for an investor deck; unfillable placeholders resolve to "".
 *
 * `uploadsText` is optional -- callers that have a customerKeyId can supply
 * it from `gatherUploadsText(customerKeyId)`.
 */
export async function extractPlaceholdersWithClaude(
  xlsxPath: string,
  templatePptxPath: string,
  uploadsText: string = '',
): Promise<Map<string, string>> {
  const workbookText = readWorkbookAsText(xlsxPath);
  const placeholders = await collectUniquePlaceholders(templatePptxPath);
  if (placeholders.length === 0) return new Map();

  const userPrompt = buildExtractorUserPrompt(workbookText, uploadsText, placeholders);
  const client = extractorClient();

  // Rough token estimate (4 chars/token) so logs surface when we're near the
  // 30K-input-tokens/min Anthropic tier limit.
  const promptChars = userPrompt.length + EXTRACTOR_SYSTEM_PROMPT.length;
  const approxTokens = Math.round(promptChars / 4);
  console.log(`[pptx-gen] Claude extractor call: ~${approxTokens} input tokens ` +
              `(${promptChars} chars, workbook=${workbookText.length} chars, uploads=${uploadsText.length} chars)`);

  // Retry on 429 (Anthropic per-minute rate limit). Sleep 65 seconds between
  // attempts so the rolling 60s window fully clears. 3 total attempts gives
  // us ~2 min of headroom for transient rate pressure to dissipate.
  const callOnce = () => client.messages.create({
    model:      EXTRACTOR_MODEL,
    max_tokens: EXTRACTOR_MAX_TOKENS,
    system:     EXTRACTOR_SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userPrompt }],
  });
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS   = 65_000;
  let resp: Awaited<ReturnType<typeof callOnce>> | null = null;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      resp = await callOnce();
      break;
    } catch (err) {
      lastErr = err;
      const e = err as { status?: number; message?: string };
      const is429 = e.status === 429 || /\b429\b|rate[_ -]?limit/i.test(e.message || '');
      if (!is429) throw err;
      if (attempt === MAX_ATTEMPTS) break;
      console.warn(`[pptx-gen] extractor 429 (attempt ${attempt}/${MAX_ATTEMPTS}), sleeping 65s before retry`);
      await new Promise((r) => setTimeout(r, BACKOFF_MS));
    }
  }
  if (!resp) {
    throw new Error(
      `Anthropic rate limit (30,000 input tokens/min) hit ${MAX_ATTEMPTS} times in a row ` +
      `(prompt was ~${approxTokens} tokens). Please wait ~2 minutes and try again, ` +
      `or upgrade your Anthropic tier at https://console.anthropic.com/settings/billing. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
  }

  const first = resp.content[0];
  if (!first || first.type !== 'text') {
    throw new Error('Claude returned no text content for placeholder extraction.');
  }
  const parsed = parseExtractorJson(first.text);
  const allowed = new Set(placeholders);
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(parsed)) {
    if (!allowed.has(k)) continue;
    const s = (v == null ? '' : String(v)).trim();
    if (s) out.set(k, s);
  }
  const filled = out.size;
  const total  = placeholders.length;
  console.log(`[pptx-gen] Claude extraction: ${filled}/${total} placeholders filled ` +
              `(workbook=${workbookText.length} chars, uploads=${uploadsText.length} chars)`);
  return out;
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
  slidesDeleted?: number;
  emptyRunsStripped?: number;
  /** Phase 4 LLM rewrite stats (absent if rewrite was skipped or had no work). */
  aiRewrite?: {
    slidesRewritten:      number;
    paragraphsRewritten:  number;
    paragraphsCleared:    number;
    model?:               string;
    skippedReason?:       string;
    failureMessage?:      string;
  };
}

// ─── Smart cleanup: strip empty {{X}} + empty runs, mark sparse slides ───────

/**
 * Per-slide statistics gathered during cleanup. `originalPlaceholders` is
 * how many {{X}} tokens existed in the slide BEFORE replacement; `unfilled`
 * is how many remain AFTER. If unfilled / originalPlaceholders > threshold,
 * the caller deletes the slide entirely.
 */
interface SlideCleanupStats {
  originalPlaceholders: number;
  unfilledPlaceholders: number;
  emptyRunsStripped:    number;
}

/**
 * After main replacement passes, walk the slide XML and:
 *   1. Replace any remaining {{X}} tokens with empty strings.
 *   2. Remove every <a:r>...</a:r> whose <a:t> is now empty or whitespace,
 *      so we don't leave ghost bullets / floating commas / "We have  customers".
 *   3. Remove any <a:p>...</a:p> whose paragraph body lost ALL of its runs
 *      (the paragraph becomes content-less and would otherwise show as a
 *      blank line on the rendered slide).
 *
 * Returns the cleaned XML and per-slide stats.
 */
function cleanupSlideXml(slideXml: string, originalCount: number): { xml: string; stats: SlideCleanupStats } {
  let stats: SlideCleanupStats = {
    originalPlaceholders: originalCount,
    unfilledPlaceholders: 0,
    emptyRunsStripped:    0,
  };

  // (1) Strip remaining {{X}} tokens, counting how many we erased.
  let xml = slideXml.replace(/<a:t([^>]*)>([\s\S]*?)<\/a:t>/g, (_m, attrs: string, text: string) => {
    const decoded = decodeXmlEntities(text);
    const cleaned = decoded.replace(/\{\{([A-Z0-9_]+)\}\}/g, () => {
      stats.unfilledPlaceholders += 1;
      return '';
    });
    return cleaned === decoded
      ? `<a:t${attrs}>${text}</a:t>`
      : `<a:t${attrs}>${encodeXmlEntities(cleaned)}</a:t>`;
  });

  // (2) Drop <a:r> runs whose <a:t> is empty/whitespace.
  xml = xml.replace(/<a:r\b[^>]*>([\s\S]*?)<\/a:r>/g, (match, inner: string) => {
    const tMatch = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/.exec(inner);
    if (!tMatch) return match;
    if (decodeXmlEntities(tMatch[1]).trim() === '') {
      stats.emptyRunsStripped += 1;
      return '';
    }
    return match;
  });

  // (3) Drop paragraphs that lost all their text runs, processed PER
  //     <p:txBody> shape so we can guarantee each shape keeps at least
  //     one paragraph. PowerPoint refuses to open a deck where any
  //     <p:txBody> is empty (no <a:p> children) -- that's the corruption
  //     mode we hit when Phase 4 cleared every paragraph in a shape.
  //
  //     A paragraph is considered "content-bearing" if it has any <a:r>
  //     run, any <a:fld> field, or an <a:endParaRPr/> marker (which the
  //     OOXML spec uses to denote intentional empty lines). Pure-<a:pPr>
  //     paragraphs are leftover scaffolding and get dropped.
  xml = xml.replace(/<p:txBody\b([^>]*)>([\s\S]*?)<\/p:txBody>/g, (_full, attrs: string, body: string) => {
    const processed = body.replace(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g, (paraMatch, inner: string) => {
      const hasContent =
        /<a:r\b/.test(inner) ||
        /<a:fld\b/.test(inner) ||
        /<a:endParaRPr\b/.test(inner) ||
        /<a:t\b[^>]*>[\S]/.test(inner);
      return hasContent ? paraMatch : '';
    });
    // Guarantee at least one <a:p> survives. An empty <a:p/> with only
    // <a:endParaRPr/> is valid OOXML and renders as a blank line.
    const hasParagraph = /<a:p\b/.test(processed);
    const finalBody = hasParagraph
      ? processed
      : processed + '<a:p><a:endParaRPr lang="en-US"/></a:p>';
    return `<p:txBody${attrs}>${finalBody}</p:txBody>`;
  });

  return { xml, stats };
}

/** Count placeholder occurrences before any replacement happens. */
function countOriginalPlaceholders(xml: string): number {
  const matches = xml.match(/\{\{[A-Z0-9_]+\}\}/g);
  return matches ? matches.length : 0;
}

// ─── Slide content extraction (for Phase 4 LLM rewrite) ─────────────────────

interface SlideParagraphInfo {
  /** 0-based occurrence order of the <a:p> in the slide XML. */
  idx: number;
  /** Concatenated <a:t> text content of all runs in this paragraph. */
  text: string;
  /** True if the paragraph still contains an unfilled `{{X}}` token. */
  hasPlaceholder: boolean;
}

interface SlideContent {
  /** Best-effort detected slide title (text of the first shape marked as title). */
  title: string;
  paragraphs: SlideParagraphInfo[];
  /** Text of paragraphs that are NOT being rewritten — used as model context. */
  contextText: string;
}

/**
 * Walk the slide XML to produce a structured view of titles + paragraphs.
 * Used by Phase 4 to decide which paragraphs need rewriting and to give the
 * LLM the surrounding slide context so it can keep rewrites coherent.
 */
function extractSlideContent(slideXml: string): SlideContent {
  let title = '';
  const shapeRe = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g;
  let sm: RegExpExecArray | null;
  while ((sm = shapeRe.exec(slideXml))) {
    const inner = sm[1];
    if (!/<p:ph\b[^/>]*type="(?:title|ctrTitle)"/.test(inner)) continue;
    const tRe = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
    let parts = '';
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(inner))) parts += decodeXmlEntities(t[1]);
    const trimmed = parts.trim();
    if (trimmed) { title = trimmed; break; }
  }

  const paragraphs: SlideParagraphInfo[] = [];
  const paraRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
  let pm: RegExpExecArray | null;
  let i = 0;
  while ((pm = paraRe.exec(slideXml))) {
    const inner = pm[1];
    const tRe = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
    let parts = '';
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(inner))) parts += decodeXmlEntities(t[1]);
    paragraphs.push({
      idx: i++,
      text: parts,
      hasPlaceholder: /\{\{[A-Z0-9_]+\}\}/.test(parts),
    });
  }

  const contextText = paragraphs
    .filter((p) => !p.hasPlaceholder && p.text.trim())
    .map((p) => p.text.trim())
    .join('\n');

  return { title, paragraphs, contextText };
}

/**
 * Replace the contents of the Nth `<a:p>` paragraph (0-indexed by occurrence
 * order) with a single run carrying the first existing run's <a:rPr>.
 *
 * Preserves:
 *   - <a:p> tag attributes (e.g. rtl, marL)
 *   - <a:pPr> paragraph properties (bullet level, alignment)
 *   - First run's <a:rPr> (font / size / colour) for the rewritten text
 *   - <a:endParaRPr> end-of-paragraph marker that PowerPoint expects on
 *     every paragraph; dropping it can cause "PowerPoint can't read"
 *
 * If `newText` is empty or whitespace, the paragraph is emitted with only
 * <a:pPr> + <a:endParaRPr> (no runs) — visually empty but valid;
 * cleanupSlideXml may then drop it if it has no useful content.
 */
function replaceParagraphText(slideXml: string, paraIdx: number, newText: string): string {
  // Capture the opening <a:p ...> attributes so we don't lose them on emit.
  const paraRe = /<a:p\b([^>]*)>([\s\S]*?)<\/a:p>/g;
  let i = 0;
  return slideXml.replace(paraRe, (match, openAttrs: string, inner: string) => {
    const myIdx = i++;
    if (myIdx !== paraIdx) return match;

    const pPr = /<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/.exec(inner)?.[0] || '';
    const endParaRPr = /<a:endParaRPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:endParaRPr>)/.exec(inner)?.[0] || '';

    // Preserve the first run's rPr so the rewritten text keeps font/size/colour.
    let rPr = '';
    const firstRunMatch = /<a:r\b[^>]*>([\s\S]*?)<\/a:r>/.exec(inner);
    if (firstRunMatch) {
      rPr = /<a:rPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:rPr>)/.exec(firstRunMatch[1])?.[0] || '';
    }

    const trimmed = newText.trim();
    const innerOut = trimmed
      ? `${pPr}<a:r>${rPr}<a:t>${encodeXmlEntities(newText)}</a:t></a:r>${endParaRPr}`
      : `${pPr}${endParaRPr}`;
    return `<a:p${openAttrs}>${innerOut}</a:p>`;
  });
}

// ─── Presentation order helpers + slide footer renumber ─────────────────────

/**
 * Read the slide paths in their authored order from presentation.xml's
 * <p:sldIdLst>. Returns an ordered array of "ppt/slides/slideN.xml" paths.
 */
async function readPresentationSlideOrder(zip: JSZip): Promise<string[]> {
  const presFile     = zip.file('ppt/presentation.xml');
  const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels');
  if (!presFile || !presRelsFile) return [];
  const pres     = await presFile.async('string');
  const presRels = await presRelsFile.async('string');

  const rids: string[] = [];
  const sldRe = /<p:sldId\b[^>]*?\br:id="([^"]+)"[^>]*?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = sldRe.exec(pres))) rids.push(m[1]);

  // Build rId -> Target map from rels (Target is relative to ppt/).
  const ridToTarget = new Map<string, string>();
  const relRe = /<Relationship\b[^>]*?\bId="([^"]+)"[^>]*?\bTarget="([^"]+)"[^>]*?\/>/g;
  let r: RegExpExecArray | null;
  while ((r = relRe.exec(presRels))) ridToTarget.set(r[1], r[2]);

  const out: string[] = [];
  for (const rid of rids) {
    const target = ridToTarget.get(rid);
    if (!target) continue;
    out.push(`ppt/${target.replace(/^\.\//, '')}`);
  }
  return out;
}

/**
 * Rewrite hard-coded "NN / <originalTotal>" footer text in every surviving
 * slide to "NEW_INDEX / NEW_TOTAL". Common pattern: V&V template has things
 * like "03 / 20" baked into the slide-number footer text run. After we
 * delete slides, those numbers stop matching reality.
 */
async function renumberSlideFooters(zip: JSZip, originalTotal: number): Promise<void> {
  const order = await readPresentationSlideOrder(zip);
  const newTotal = order.length;
  if (newTotal === 0) return;

  // Build a regex that only matches "<digits> / <originalTotal>" so we don't
  // accidentally rewrite unrelated number-like text. originalTotal is a
  // numeric literal so escapeRegex isn't strictly required, but use it for
  // safety in case the template count is itself a multi-digit number.
  const totalEsc = escapeRegex(String(originalTotal));
  const pattern = new RegExp(
    `<a:t([^>]*)>(\\s*)(\\d{1,3})(\\s*/\\s*)${totalEsc}(\\s*)</a:t>`,
    'g',
  );

  for (let i = 0; i < order.length; i++) {
    const slidePath = order[i];
    const slideFile = zip.file(slidePath);
    if (!slideFile) continue;
    let xml = await slideFile.async('string');
    let touched = false;

    xml = xml.replace(pattern, (_full, attrs: string, lead: string, oldIdx: string, sep: string, trail: string) => {
      touched = true;
      // Preserve zero-padding from the original index width: "03" stays
      // two-digit, "3" stays unpadded.
      const newIdx = oldIdx.length >= 2
        ? String(i + 1).padStart(oldIdx.length, '0')
        : String(i + 1);
      const newTotalStr = oldIdx.length >= 2 && String(newTotal).length < oldIdx.length
        ? String(newTotal).padStart(oldIdx.length, '0')
        : String(newTotal);
      return `<a:t${attrs}>${lead}${newIdx}${sep}${newTotalStr}${trail}</a:t>`;
    });

    if (touched) zip.file(slidePath, xml);
  }
}

// ─── Slide deletion: remove a slide from the package atomically ──────────────

/** Escape a string so it can be embedded literally inside a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove one slide from the pptx package. Touches:
 *   - ppt/slides/slideN.xml                  (and its _rels file)
 *   - ppt/_rels/presentation.xml.rels        (drop the rId entry)
 *   - ppt/presentation.xml                   (drop the matching <p:sldId/>)
 *   - [Content_Types].xml                    (drop the Override for the part)
 *
 * Safe to call multiple times in one pass; later deletions don't shift
 * the surviving slide filenames, so the rels keep resolving.
 */
async function deleteSlideFromPackage(zip: JSZip, slidePath: string): Promise<void> {
  // 1. Find which rId in presentation rels points at this slide.
  const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels');
  const presFile     = zip.file('ppt/presentation.xml');
  const ctFile       = zip.file('[Content_Types].xml');
  if (!presRelsFile || !presFile || !ctFile) return;

  let presRelsXml = await presRelsFile.async('string');
  let presXml     = await presFile.async('string');
  let ctXml       = await ctFile.async('string');

  // Slide rels reference is relative to ppt/, so "slides/slideN.xml".
  const relativeTarget = slidePath.replace(/^ppt\//, '');

  // 1a. BEFORE touching anything, read the slide's own rels file to find any
  //     notesSlide that this slide links to. PowerPoint templates often have a
  //     1-to-1 speaker-notes-per-slide setup; if we delete the slide but leave
  //     the notesSlide behind, the notesSlide's own rels still references the
  //     deleted slide, the [Content_Types].xml still has the Override, and
  //     PowerPoint refuses to open the deck. Cascade-delete the notesSlide.
  const slideRelsPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
  let notesSlidePath:     string | null = null;
  let notesSlideRelsPath: string | null = null;
  const slideRelsEntry = zip.file(slideRelsPath);
  if (slideRelsEntry) {
    const slideRelsXml = await slideRelsEntry.async('string');
    const m = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/i.exec(slideRelsXml);
    if (m) {
      notesSlidePath     = `ppt/notesSlides/${m[1]}`;
      notesSlideRelsPath = `ppt/notesSlides/_rels/${m[1]}.rels`;
    }
  }

  // 2. Resolve rId by Target. Attribute order isn't guaranteed; use indexOf.
  const targetMarker = `Target="${relativeTarget}"`;
  const tIdx = presRelsXml.indexOf(targetMarker);
  if (tIdx < 0) return;
  const tagStart = presRelsXml.lastIndexOf('<Relationship', tIdx);
  const tagEnd   = presRelsXml.indexOf('/>', tIdx);
  if (tagStart < 0 || tagEnd < 0) return;
  const relFullTag = presRelsXml.slice(tagStart, tagEnd + 2);
  const rid = /Id="([^"]+)"/.exec(relFullTag)?.[1];

  // 3. Remove the <p:sldId/> from presentation.xml.
  //    Use [^>]*? (excludes only `>`, lazy) so attribute values that contain
  //    `/` (theoretically possible) don't trip the regex.
  if (rid) {
    const ridEsc = escapeRegex(rid);
    presXml = presXml.replace(
      new RegExp(`<p:sldId\\b[^>]*?\\br:id="${ridEsc}"[^>]*?/>`, 'g'),
      '',
    );
    zip.file('ppt/presentation.xml', presXml);
  }

  // 4. Remove the Relationship from presentation rels.
  presRelsXml = presRelsXml.slice(0, tagStart) + presRelsXml.slice(tagEnd + 2);
  zip.file('ppt/_rels/presentation.xml.rels', presRelsXml);

  // 5. Drop the slide's content-types Override AND the notesSlide's Override
  //    (if a notes slide was linked). The [^>]*? (lazy, excludes only `>`) is
  //    required because Override carries ContentType="application/vnd..." and
  //    a `/`-excluding class can never match across the MIME type.
  const slidePathEsc = escapeRegex(slidePath);
  ctXml = ctXml.replace(
    new RegExp(`<Override\\b[^>]*?\\bPartName="/${slidePathEsc}"[^>]*?/>`, 'g'),
    '',
  );
  if (notesSlidePath) {
    const notesPathEsc = escapeRegex(notesSlidePath);
    ctXml = ctXml.replace(
      new RegExp(`<Override\\b[^>]*?\\bPartName="/${notesPathEsc}"[^>]*?/>`, 'g'),
      '',
    );
  }
  zip.file('[Content_Types].xml', ctXml);

  // 6. Remove the slide xml + its rels file from the zip.
  zip.remove(slidePath);
  if (slideRelsEntry) zip.remove(slideRelsPath);

  // 7. Cascade-remove the orphaned notesSlide + its rels (if any).
  if (notesSlidePath && zip.file(notesSlidePath))         zip.remove(notesSlidePath);
  if (notesSlideRelsPath && zip.file(notesSlideRelsPath)) zip.remove(notesSlideRelsPath);
}

/**
 * Generate a populated pptx for a given customer's xlsx.
 *
 * Optionally takes an extraValues map (e.g. AI-extracted values from
 * the customer's uploads). Excel sheet values take precedence over
 * extraValues — calculations + admin-edited questionnaire inputs are
 * always more trusted than AI-extracted text.
 */
export async function generatePopulatedPptx(opts: {
  templatePptxPath: string;
  customerXlsxPath: string;
  outputPptxPath: string;
  /**
   * Customer key id -- used to gather extracted text from any files the
   * customer dropped into the partner-portal dropzone so Claude can pull
   * qualitative content (founders, market thesis, etc.) from them.
   */
  customerKeyId?: string;
  /**
   * Phase 4 LLM rewrite of partially-filled slides. Default true.
   * Disable for tests / environments without ANTHROPIC_API_KEY.
   */
  aiRewrite?: boolean;
}): Promise<PptxGenStats> {
  if (!fs.existsSync(opts.templatePptxPath)) {
    throw new Error(`PPTX template not found at ${opts.templatePptxPath}`);
  }
  if (!fs.existsSync(opts.customerXlsxPath)) {
    throw new Error(`Customer xlsx not found at ${opts.customerXlsxPath}`);
  }

  // Single Claude call: read every Excel sheet + every upload's extracted
  // text, see the placeholder list from the template, return one
  // ready-to-replace map with values already formatted ($12M / 73% / 3.5x).
  // No more rigid sheet-name + column-letter lookups.
  const uploadsText = opts.customerKeyId ? await gatherUploadsText(opts.customerKeyId) : '';
  const valueMap = await extractPlaceholdersWithClaude(
    opts.customerXlsxPath,
    opts.templatePptxPath,
    uploadsText,
  );

  const pptxBuf = await fs.promises.readFile(opts.templatePptxPath);
  const zip = await JSZip.loadAsync(pptxBuf);

  const stats: PptxGenStats = {
    replaced: 0, unmatched: [], slidesProcessed: 0,
    slidesDeleted: 0, emptyRunsStripped: 0,
  };
  const unmatchedSet = new Set<string>();
  const mut = { replaced: 0, unmatched: unmatchedSet };

  // Discover the ORIGINAL presentation order + which slide is the closing
  // ("final") slide. We protect the final slide from deletion regardless of
  // its placeholder fill ratio -- the deck must always end on the CTA /
  // thank-you slide so the customer sees a clean close.
  const originalOrder = await readPresentationSlideOrder(zip);
  const originalTotal = originalOrder.length;
  const finalSlidePath: string | null =
    originalOrder.length > 0 ? originalOrder[originalOrder.length - 1] : null;

  // ── PHASE 1: per-slide replace (no cleanup yet) ──────────────────────────
  // We need the post-replacement XML still containing unfilled {{X}} tokens
  // so Phase 1.5 can see WHICH placeholders went unfilled and rewrite the
  // surrounding prose. Cleanup runs after rewrite so we don't strip the
  // tokens before the LLM sees them.
  const SLIDE_DELETE_THRESHOLD = 0.7;
  const slideEntries = Object.keys(zip.files).filter(
    (k) => /^ppt\/slides\/slide\d+\.xml$/.test(k),
  );

  interface SlideState {
    key:             string;
    originalCount:   number;
    afterReplace:    string;
    /** Marked true if Phase 1 left ≥70% of placeholders unfilled. */
    willBeDeleted:   boolean;
    /** Affected paragraphs queued for Phase 1.5 rewrite. */
    affectedParas:   Array<{ id: string; idx: number; text: string }>;
    title:           string;
    contextText:     string;
  }

  const slideStates: SlideState[] = [];

  for (const key of slideEntries) {
    const xml           = await zip.file(key)!.async('string');
    const originalCount = countOriginalPlaceholders(xml);
    const afterReplace  = applyReplacementsToSlideXml(xml, valueMap, mut);
    const unfilledHere  = countOriginalPlaceholders(afterReplace);
    // The final (closing) slide is always kept. Every deck must end on the
    // CTA / thank-you slide regardless of how empty its placeholders are.
    const isFinalSlide  = key === finalSlidePath;
    const willBeDeleted = !isFinalSlide && originalCount > 0 &&
                          unfilledHere / originalCount > SLIDE_DELETE_THRESHOLD;

    let affectedParas: SlideState['affectedParas'] = [];
    let title = '';
    let contextText = '';
    // Only collect rewrite candidates for slides that will survive AND have
    // at least one unfilled placeholder. Sparse slides (>70% unfilled) get
    // deleted in Phase 2, so spending tokens to rewrite them is wasteful.
    if (unfilledHere > 0 && !willBeDeleted) {
      const content = extractSlideContent(afterReplace);
      title       = content.title;
      contextText = content.contextText;
      const slideTag = key.replace(/^ppt\/slides\//, '').replace(/\.xml$/, '');
      affectedParas = content.paragraphs
        .filter((p) => p.hasPlaceholder && p.text.trim())
        .map((p) => ({ id: `${slideTag}_p${p.idx}`, idx: p.idx, text: p.text }));
    }

    slideStates.push({ key, originalCount, afterReplace, willBeDeleted, affectedParas, title, contextText });
  }

  // ── PHASE 1.5: LLM rewrite of partially-filled slides (best-effort) ──────
  // Batched into a single Claude call across all affected paragraphs. If the
  // call fails or returns garbage, we log and continue with cleanup-only
  // output — Phase 4 is an enhancement, never a blocker.
  const aiRewriteEnabled = opts.aiRewrite !== false;
  const slidesForRewrite: SlideRewriteInput[] = slideStates
    .filter((s) => s.affectedParas.length > 0)
    .map((s) => ({
      slideKey:    s.key,
      title:       s.title,
      contextText: s.contextText,
      affected:    s.affectedParas.map((p) => ({ id: p.id, currentText: p.text })),
    }));

  if (!aiRewriteEnabled) {
    stats.aiRewrite = {
      slidesRewritten: 0, paragraphsRewritten: 0, paragraphsCleared: 0,
      skippedReason: 'aiRewrite=false',
    };
  } else if (slidesForRewrite.length === 0) {
    stats.aiRewrite = {
      slidesRewritten: 0, paragraphsRewritten: 0, paragraphsCleared: 0,
      skippedReason: 'no partially-filled slides',
    };
  } else if (!process.env.ANTHROPIC_API_KEY) {
    stats.aiRewrite = {
      slidesRewritten: 0, paragraphsRewritten: 0, paragraphsCleared: 0,
      skippedReason: 'ANTHROPIC_API_KEY not set',
    };
  } else {
    try {
      const { rewrites, model } = await rewriteAffectedParagraphs(slidesForRewrite);
      let slidesRewritten     = 0;
      let paragraphsRewritten = 0;
      let paragraphsCleared   = 0;
      for (const slide of slideStates) {
        if (slide.affectedParas.length === 0) continue;
        let xml = slide.afterReplace;
        let touched = 0;
        for (const para of slide.affectedParas) {
          if (!rewrites.has(para.id)) continue;
          const newText = rewrites.get(para.id) || '';
          xml = replaceParagraphText(xml, para.idx, newText);
          touched += 1;
          if (newText.trim()) paragraphsRewritten += 1;
          else                paragraphsCleared   += 1;
        }
        if (touched > 0) {
          slide.afterReplace = xml;
          slidesRewritten += 1;
        }
      }
      stats.aiRewrite = { slidesRewritten, paragraphsRewritten, paragraphsCleared, model };
      console.log(`[pptx-gen] Phase 4 rewrite: ${slidesRewritten} slide(s), ` +
                  `${paragraphsRewritten} paragraph(s) rewritten, ` +
                  `${paragraphsCleared} cleared (model=${model})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[pptx-gen] Phase 4 rewrite failed (continuing with cleanup-only):', msg);
      stats.aiRewrite = {
        slidesRewritten: 0, paragraphsRewritten: 0, paragraphsCleared: 0,
        failureMessage: msg,
      };
    }
  }

  // ── PHASE 2: per-slide cleanup → validate → mark for deletion ────────────
  // Each surviving slide is parsed as XML at the end. Any slide that's still
  // malformed (a Phase-4 rewrite or cleanup edge case we didn't anticipate)
  // is dropped from the deck rather than shipped: better to omit a slide than
  // ship a deck PowerPoint refuses to open at all.
  const slidesToDelete: string[] = [];
  let invalidSlidesDropped = 0;
  for (const slide of slideStates) {
    const { xml: cleaned, stats: slideStats } =
      cleanupSlideXml(slide.afterReplace, slide.originalCount);
    zip.file(slide.key, cleaned);
    stats.slidesProcessed   += 1;
    stats.emptyRunsStripped  = (stats.emptyRunsStripped || 0) + slideStats.emptyRunsStripped;

    // Safety gate: drop any slide whose XML doesn't parse cleanly.
    const validation = XMLValidator.validate(cleaned);
    if (validation !== true) {
      console.warn(`[pptx-gen] slide ${slide.key} failed XML validation, dropping: ` +
                   `${JSON.stringify(validation)}`);
      slidesToDelete.push(slide.key);
      invalidSlidesDropped += 1;
      continue;
    }

    // The final (closing) slide is exempt from the unfilled-threshold drop;
    // we always want the deck to end on the CTA / thank-you slide.
    if (slide.key !== finalSlidePath && slide.originalCount > 0) {
      const unfilledRatio = slideStats.unfilledPlaceholders / slide.originalCount;
      if (unfilledRatio > SLIDE_DELETE_THRESHOLD) {
        slidesToDelete.push(slide.key);
      }
    }
  }
  if (invalidSlidesDropped > 0) {
    console.warn(`[pptx-gen] dropped ${invalidSlidesDropped} slide(s) due to XML validation failure`);
  }

  // ── PHASE 3: delete sparse slides ────────────────────────────────────────
  // Done after all in-place edits so presentation.xml / rels / content-types
  // are only touched once per deletion.
  for (const slidePath of slidesToDelete) {
    await deleteSlideFromPackage(zip, slidePath);
    stats.slidesDeleted = (stats.slidesDeleted || 0) + 1;
  }

  // ── PHASE 4: renumber slide-number footers ───────────────────────────────
  // Templates often hard-code page-number text like "03 / 20" in slide
  // footers. After deletion the original totals are wrong AND the indices
  // skip (you'd see 02, 03, 07, 11 instead of 02, 03, 04, 05). Walk the
  // surviving slides in their new presentation order and rewrite any
  // "NN / <originalTotal>" pattern to "NEW_INDEX / NEW_TOTAL".
  if (originalTotal > 0 && (stats.slidesDeleted || 0) > 0) {
    try {
      await renumberSlideFooters(zip, originalTotal);
    } catch (err) {
      console.warn('[pptx-gen] slide renumber failed (continuing):',
                   err instanceof Error ? err.message : err);
    }
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
