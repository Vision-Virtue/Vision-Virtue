"use strict";
/* ============================================================
   Business Presentation Calcs — supplemental xlsx sheet builder

   Triggered after the personalized Financial Model xlsx is built,
   when the customer has uploaded supporting materials (PDF, DOCX,
   PPTX) via the capitaflow portal drag-and-drop. Reads those docs,
   asks Claude for business-presentation-relevant numbers/metrics
   that are NOT already represented in the workbook, and appends
   them as a new "Business Presentation Calcs" sheet.

   Why a separate sheet (not merged into existing ones):
     * Keeps the Financial Model formulas/charts untouched.
     * Keeps the source-of-truth split clear — the standard
       sheets carry the quantitative model; this sheet carries
       narrative numbers from uploaded documents.
     * Lets the admin (Raphael) review and selectively promote
       items into the model before finalizing.

   Implementation choices:
     * Claude call uses the same Sonnet 4 model the pptx
       extractor uses, with a 4K-token output cap and ~30K-char
       input cap so we stay comfortably under the tier limit.
     * Sheet appender uses JSZip + string manipulation (no
       ExcelJS — peak ~30 MB). Adds the new sheet by editing
       workbook.xml, workbook.xml.rels, [Content_Types].xml
       and writing a new ppt/worksheets/sheet{N}.xml.
   ============================================================ */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBusinessCalcs = extractBusinessCalcs;
exports.listWorkbookSheetNames = listWorkbookSheetNames;
exports.appendBusinessCalcsSheet = appendBusinessCalcsSheet;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const jszip_1 = __importDefault(require("jszip"));
const fs_1 = __importDefault(require("fs"));
const deck_upload_service_1 = require("./deck-upload.service");
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const UPLOADS_TEXT_CAP = 30000;
const PER_UPLOAD_CAP = 8000;
const SHEET_NAME = 'Business Presentation Calcs';
/**
 * Pull business-presentation-relevant calculations from the customer's
 * uploaded documents that the standard Financial Model sheets don't
 * already capture. Empty array if no uploads, no extracted text, the
 * API key is missing, or the model returns nothing material.
 *
 * Best-effort: failures (rate limits, parse errors, missing API key)
 * are logged and resolve as []. Never throws.
 */
async function extractBusinessCalcs(opts) {
    const uploads = (0, deck_upload_service_1.listUploads)(opts.customerKeyId);
    if (uploads.length === 0)
        return [];
    const parts = [];
    for (const u of uploads) {
        try {
            const text = await (0, deck_upload_service_1.getOrExtractText)(opts.customerKeyId, u.id);
            if (!text || text.length < 80)
                continue;
            parts.push(`=== ${u.originalName} ===\n${text.slice(0, PER_UPLOAD_CAP)}`);
        }
        catch (err) {
            console.warn('[business-calcs] extract failed for', u.originalName, err);
        }
    }
    if (parts.length === 0)
        return [];
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.warn('[business-calcs] ANTHROPIC_API_KEY not set — skipping');
        return [];
    }
    const sheetList = opts.workbookSheetNames.join(', ');
    const uploadsBlock = parts.join('\n\n').slice(0, UPLOADS_TEXT_CAP);
    const customerHdr = opts.customerName ? `Customer: ${opts.customerName}\n` : '';
    const prompt = `${customerHdr}You are extracting business-presentation-relevant calculations and metrics from customer-uploaded documents that are NOT already represented in their Financial Model spreadsheet.

WORKBOOK SHEETS (already in the customer's Financial Model):
${sheetList}

UPLOADED DOCUMENTS:
${uploadsBlock}

EXTRACT calculations, metrics, or business-model assumptions that:
1. Appear in the uploaded documents
2. Would be material to a business model investor presentation (sector dynamics, market sizing — TAM/SAM/SOM, unit economics — CAC/LTV/payback, growth assumptions, use of proceeds, comparable transaction multiples, regulatory milestones, retention / NDR, gross margin trajectory, headcount build, ARR targets, etc.)
3. Are NOT already captured in the workbook sheets

Return ONLY a JSON array (no preamble, no code fences). Each item must have:
{
  "label": "Short name, e.g. 'TAM', 'CAC payback', 'Use of proceeds — R&D', 'Y1 ARR target', 'NDR'",
  "value": "Formatted value as written, e.g. '$84B', '$42,000', '40%', '11 months', '118%'",
  "unit": "USD | % | x | months | FTE | ratio | count | other",
  "source_file": "Exact filename as shown above",
  "excerpt": "Short verbatim quote (max 150 chars) supporting the value",
  "calculation_logic": "(optional) one-sentence summary of how it was computed, if the document explains it"
}

If the uploads add nothing material beyond what the workbook captures, return [].`;
    const anthropic = new sdk_1.default({ apiKey });
    try {
        const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [{ role: 'user', content: prompt }],
        });
        const block = response.content[0];
        if (!block || block.type !== 'text')
            return [];
        const raw = block.text.trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch (err) {
            console.warn('[business-calcs] JSON parse failed; raw head=', raw.slice(0, 200));
            return [];
        }
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .map((p) => {
            const r = p;
            return {
                label: String(r.label ?? '').slice(0, 200),
                value: String(r.value ?? '').slice(0, 100),
                unit: String(r.unit ?? '').slice(0, 50),
                source_file: String(r.source_file ?? '').slice(0, 200),
                excerpt: String(r.excerpt ?? '').slice(0, 500),
                calculation_logic: r.calculation_logic ? String(r.calculation_logic).slice(0, 500) : undefined,
            };
        })
            .filter((p) => p.label && p.value);
    }
    catch (err) {
        console.warn('[business-calcs] Claude call failed:', err);
        return [];
    }
}
// ─── Workbook sheet appender (JSZip + XML surgery) ───────────────────────────
/**
 * List the existing sheet names in the workbook so the LLM knows what's
 * already covered. Reads workbook.xml without parsing the whole file.
 */
async function listWorkbookSheetNames(xlsxPath) {
    const buf = await fs_1.default.promises.readFile(xlsxPath);
    const zip = await jszip_1.default.loadAsync(buf);
    const wb = zip.file('xl/workbook.xml');
    if (!wb)
        return [];
    const xml = await wb.async('string');
    const out = [];
    const re = /<sheet\b[^>]*\bname="([^"]+)"/g;
    let m;
    while ((m = re.exec(xml)) !== null)
        out.push(m[1]);
    return out;
}
/**
 * Append a new "Business Presentation Calcs" sheet to the xlsx in place.
 * No-op if `calcs` is empty. Uses inline strings (no sharedStrings.xml
 * mutation) and avoids touching any existing sheet — formulas, charts and
 * named ranges in the customer's Financial Model are preserved.
 */
async function appendBusinessCalcsSheet(xlsxPath, calcs) {
    if (!calcs.length)
        return;
    const buf = await fs_1.default.promises.readFile(xlsxPath);
    const zip = await jszip_1.default.loadAsync(buf);
    // ── Read the three index files we have to edit ─────────────────────────
    const wbEntry = zip.file('xl/workbook.xml');
    if (!wbEntry)
        throw new Error('xl/workbook.xml not found in xlsx');
    let workbookXml = await wbEntry.async('string');
    const relsEntry = zip.file('xl/_rels/workbook.xml.rels');
    if (!relsEntry)
        throw new Error('xl/_rels/workbook.xml.rels not found');
    let relsXml = await relsEntry.async('string');
    const ctEntry = zip.file('[Content_Types].xml');
    if (!ctEntry)
        throw new Error('[Content_Types].xml not found');
    let ctXml = await ctEntry.async('string');
    // ── Compute new sheet number, sheetId, and rId ─────────────────────────
    const existingSheetFiles = Object.keys(zip.files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
    const sheetNums = existingSheetFiles.map((k) => Number(k.match(/sheet(\d+)\.xml$/)[1]));
    const newSheetNum = (sheetNums.length ? Math.max(...sheetNums) : 0) + 1;
    const newSheetPart = `xl/worksheets/sheet${newSheetNum}.xml`;
    // sheetId (Excel-internal id) — max of existing sheetId attrs + 1.
    let maxSheetId = 0;
    const sheetIdRe = /\bsheetId="(\d+)"/g;
    let m;
    while ((m = sheetIdRe.exec(workbookXml)) !== null) {
        const n = parseInt(m[1], 10);
        if (n > maxSheetId)
            maxSheetId = n;
    }
    const newSheetId = maxSheetId + 1;
    // rId — max numeric rId in the workbook rels + 1.
    let maxRId = 0;
    const rIdRe = /\bId="rId(\d+)"/g;
    while ((m = rIdRe.exec(relsXml)) !== null) {
        const n = parseInt(m[1], 10);
        if (n > maxRId)
            maxRId = n;
    }
    const newRId = `rId${maxRId + 1}`;
    // Avoid sheet-name collision (Excel disallows duplicates).
    let chosenName = SHEET_NAME;
    const existingNames = new Set();
    const nameRe = /<sheet\b[^>]*\bname="([^"]+)"/g;
    while ((m = nameRe.exec(workbookXml)) !== null)
        existingNames.add(m[1]);
    if (existingNames.has(chosenName)) {
        let i = 2;
        while (existingNames.has(`${chosenName} ${i}`))
            i++;
        chosenName = `${chosenName} ${i}`;
    }
    // ── Build the new sheet XML ───────────────────────────────────────────
    const sheetXml = buildSheetXml(calcs);
    // ── Insert the new <sheet/> into workbook.xml's <sheets> block ────────
    const sheetTag = `<sheet name="${xmlAttr(chosenName)}" sheetId="${newSheetId}" r:id="${newRId}"/>`;
    if (/<\/sheets>/.test(workbookXml)) {
        workbookXml = workbookXml.replace('</sheets>', `${sheetTag}</sheets>`);
    }
    else {
        // Tolerate self-closing <sheets/> (rare but possible)
        workbookXml = workbookXml.replace(/<sheets\s*\/>/, `<sheets>${sheetTag}</sheets>`);
    }
    // ── Insert the new <Relationship/> into workbook.xml.rels ─────────────
    const relTag = `<Relationship Id="${newRId}" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
        `Target="worksheets/sheet${newSheetNum}.xml"/>`;
    relsXml = relsXml.replace('</Relationships>', `${relTag}</Relationships>`);
    // ── Add Override to [Content_Types].xml ───────────────────────────────
    const overrideTag = `<Override PartName="/xl/worksheets/sheet${newSheetNum}.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    ctXml = ctXml.replace('</Types>', `${overrideTag}</Types>`);
    // ── Write all edits back to the zip ───────────────────────────────────
    zip.file('xl/workbook.xml', workbookXml);
    zip.file('xl/_rels/workbook.xml.rels', relsXml);
    zip.file('[Content_Types].xml', ctXml);
    zip.file(newSheetPart, sheetXml);
    const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await fs_1.default.promises.writeFile(xlsxPath, outBuf);
}
// ─── XML helpers ────────────────────────────────────────────────────────────
function xmlAttr(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function xmlText(s) {
    return s
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function colLetter(idx) {
    // 0-based column index → A, B, ..., Z, AA, AB, ...
    let s = '';
    let n = idx;
    do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
}
function inlineStrCell(addr, value) {
    return `<c r="${addr}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}
function buildSheetXml(calcs) {
    const headers = ['Calculation', 'Value', 'Unit', 'Source File', 'Excerpt', 'Calculation Logic'];
    const lastCol = colLetter(headers.length - 1);
    const lastRow = calcs.length + 1;
    const rows = [];
    // Header row
    const headerCells = headers
        .map((h, i) => inlineStrCell(`${colLetter(i)}1`, h))
        .join('');
    rows.push(`<row r="1">${headerCells}</row>`);
    // Data rows
    calcs.forEach((c, i) => {
        const r = i + 2;
        const cells = [
            inlineStrCell(`A${r}`, c.label),
            inlineStrCell(`B${r}`, c.value),
            inlineStrCell(`C${r}`, c.unit),
            inlineStrCell(`D${r}`, c.source_file),
            inlineStrCell(`E${r}`, c.excerpt),
            inlineStrCell(`F${r}`, c.calculation_logic || ''),
        ].join('');
        rows.push(`<row r="${r}">${cells}</row>`);
    });
    // Column widths: keep the source-file and excerpt cols readable
    const cols = '<cols>' +
        '<col min="1" max="1" width="32" customWidth="1"/>' +
        '<col min="2" max="2" width="16" customWidth="1"/>' +
        '<col min="3" max="3" width="10" customWidth="1"/>' +
        '<col min="4" max="4" width="32" customWidth="1"/>' +
        '<col min="5" max="5" width="60" customWidth="1"/>' +
        '<col min="6" max="6" width="50" customWidth="1"/>' +
        '</cols>';
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<dimension ref="A1:${lastCol}${lastRow}"/>` +
        '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
        '<sheetFormatPr defaultRowHeight="15"/>' +
        cols +
        '<sheetData>' + rows.join('') + '</sheetData>' +
        '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
        '</worksheet>');
}
