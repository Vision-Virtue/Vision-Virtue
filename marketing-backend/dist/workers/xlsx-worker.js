"use strict";
/* ============================================================
   xlsx generation worker — JSZip + XML surgical editor.

   Background: ExcelJS loaded the v7 template at ~500 MB peak
   heap, which is more than Render's 512 MB Starter container
   can give us (kernel cgroup OOM-killed the process before V8
   even saw the limit). This worker avoids ExcelJS entirely.

   How it works:
   1. Open the xlsx as a zip with JSZip.
   2. Read just the "Customer's Questionnaire" sheet XML.
   3. Parse it with fast-xml-parser (one sheet, ~5–15 MB peak).
   4. Patch the input cells in-place (preserving styles, types
      and any other attributes already on the cell).
   5. Force Excel to recalc on open by setting
      <calcPr fullCalcOnLoad="1"/> in workbook.xml and removing
      the calcChain (its order may be stale after our edits).
   6. Save the zip.

   Peak memory ≈ 30–40 MB.
   ============================================================ */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jszip_1 = __importDefault(require("jszip"));
const promises_1 = __importDefault(require("fs/promises"));
const fast_xml_parser_1 = require("fast-xml-parser");
const investor_deck_schema_1 = require("../data/investor-deck-schema");
const SHEET_NAME = "Customer's Questionnaire";
const DECK_SHEET_NAME = 'Investor_Deck_Questionnaire_Inputs';
// Cell layout — matches the v7 template.
//
// Section 1–5 sit in column I, sections 6.a / 6.b in columns H–J,
// and section 7 splits Let's-Scale rows by revenueType into three
// blocks (7.a HW, 7.b SW, 7.c Other), each in columns I/L/M.
const CELLS = {
    customerName: 'I6',
    sector: 'I8', // Section 1
    round: 'I9', // Section 2
    capitalGoal: 'I10', // Section 3
    yearsSince: 'I11', // Section 4
    firstYear: 'I12', // Section 5
};
// Section 6.a Customers — v9 rows 17–28 (max 12).
const CUSTOMERS = {
    startRow: 17, maxRows: 12,
    cols: { name: 'H', type: 'I', territory: 'J' },
};
// Section 6.b Products — v9 rows 30–40 (max 11). Col K holds a per-product
// cost column the template ships with example data; we explicitly clear it
// per customer since cost is now collected per scaling row in Section 7.
const PRODUCTS = {
    startRow: 30, maxRows: 11,
    cols: { name: 'H', revenueType: 'I', price: 'J', cost: 'K' },
};
// Section 7 Let's Scale — v9 collapses the three v8 blocks (HW/SW/Other)
// into one continuous table at rows 44–63 (20 rows). New layout:
//   H = revenueType
//   I = customerName
//   J = type
//   K = territory
//   L = productName
//   M = price
//   N = cost           (NEW — was section 8 in v8)
//   O/P/Q/R = Q1/Q2/Q3/Q4
//   S       = Y2 (2027)
const LETSSCALE = {
    startRow: 44, maxRows: 20,
    cols: {
        revenueType: 'H', customerName: 'I', type: 'J', territory: 'K',
        productName: 'L', price: 'M', cost: 'N',
        q1: 'O', q2: 'P', q3: 'Q', q4: 'R', y2: 'S',
    },
};
// Section 8 (was Section 9 in v8) FTE — v9 rows 68–71.
// Col I = 2026 quantity (y1), col J = 2027 quantity (y2).
const FTE = {
    startRow: 68,
    cols: { y1: 'I', y2: 'J' },
};
// ─── Value coercion ─────────────────────────────────────────────────────────
function toNumOrText(v) {
    if (v === undefined || v === null)
        return null;
    const s = String(v).trim();
    if (s === '')
        return null;
    const cleaned = s.replace(/[$,\s]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n) && /^[-+]?\d+(\.\d+)?$/.test(cleaned))
        return n;
    return s;
}
// ─── Cell-address helpers ───────────────────────────────────────────────────
function parseAddr(addr) {
    const m = /^([A-Z]+)(\d+)$/.exec(addr);
    if (!m)
        throw new Error(`Bad cell address: ${addr}`);
    let colNum = 0;
    for (const ch of m[1])
        colNum = colNum * 26 + (ch.charCodeAt(0) - 64);
    return { col: m[1], row: parseInt(m[2], 10), colNum };
}
function arr(x) {
    if (x === undefined || x === null)
        return [];
    return Array.isArray(x) ? x : [x];
}
// ─── XML parser/builder configuration ───────────────────────────────────────
//
// We only force `row`, `c`, `sheet`, and `Relationship` to be arrays so
// single/multi handling is consistent. Everything else stays as parsed.
const parser = new fast_xml_parser_1.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
    isArray: (name) => (name === 'row' || name === 'c' || name === 'sheet' || name === 'Relationship'),
});
const builder = new fast_xml_parser_1.XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: false,
    suppressEmptyNode: false,
});
function setCellValue(rows, rowMap, addr, value) {
    const { row: rowNum, colNum } = parseAddr(addr);
    let row = rowMap.get(rowNum);
    if (!row) {
        if (value === null)
            return;
        row = { '@_r': String(rowNum), c: [] };
        rows.push(row);
        rowMap.set(rowNum, row);
    }
    if (!row.c)
        row.c = [];
    const cells = row.c;
    let cell = cells.find((c) => c['@_r'] === addr);
    if (!cell) {
        if (value === null)
            return;
        cell = { '@_r': addr };
        cells.push(cell);
    }
    // Wipe value-related fields (preserving style `s` and any other attrs).
    delete cell.v;
    delete cell.is;
    delete cell.f;
    delete cell['@_t'];
    if (value === null)
        return;
    if (typeof value === 'number') {
        // Numeric — default cell type is 'n', no @_t needed.
        cell.v = value;
    }
    else {
        // String — use inline strings so we don't have to mutate sharedStrings.xml.
        cell['@_t'] = 'inlineStr';
        cell.is = { t: { '#text': value } };
    }
    // Keep cells in column order for Excel-compatibility.
    cells.sort((a, b) => parseAddr(a['@_r']).colNum - parseAddr(b['@_r']).colNum);
}
// ─── Investor-Deck Questionnaire_Inputs sheet builder ────────────────────────
//
// We add a new worksheet to the existing template. This requires four
// coordinated edits to the package:
//
//   1.  xl/worksheets/sheetN.xml   — the new sheet's body
//   2.  xl/_rels/workbook.xml.rels — relationship from workbook → new sheet
//   3.  xl/workbook.xml            — <sheet name=... sheetId=... r:id=.../>
//   4.  [Content_Types].xml        — Override registering the new sheet part
//
// We re-use sharedStrings via inline strings (`<c t="inlineStr">`), so no
// sharedStrings.xml mutation is required.
const DECK_COLUMNS = [
    'Slide_Number',
    'Slide_Title',
    'Placeholder_Name',
    'Questionnaire_Question',
    'Answer_Value',
    'Input_Type',
    'Required_or_Optional',
    'Guidance_for_Customer',
    'Purpose_in_Investor_Deck',
    'Notes',
];
function xmlEscape(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function colLetter(n) {
    // 1 → A, 26 → Z, 27 → AA …
    let s = '';
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}
function inlineStrCell(addr, value) {
    // <c r="A1" t="inlineStr"><is><t xml:space="preserve">…</t></is></c>
    return `<c r="${addr}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}
function numericCell(addr, value) {
    return `<c r="${addr}"><v>${value}</v></c>`;
}
function buildDeckSheetRow(rowNum, values) {
    const cells = values
        .map((v, i) => {
        if (v === null || v === undefined || v === '')
            return '';
        const addr = `${colLetter(i + 1)}${rowNum}`;
        if (typeof v === 'number' && Number.isFinite(v))
            return numericCell(addr, v);
        return inlineStrCell(addr, String(v));
    })
        .join('');
    return `<row r="${rowNum}">${cells}</row>`;
}
function buildDeckSheetXml(fields, answers) {
    const rows = [];
    // Header row.
    rows.push(buildDeckSheetRow(1, DECK_COLUMNS));
    // One row per placeholder.
    fields.forEach((f, idx) => {
        const slideNum = f.slideNumbers.length === 1 ? f.slideNumbers[0] : f.slideNumbers.join(', ');
        const rowNum = idx + 2; // header is row 1
        const rawAns = answers?.[f.fieldKey];
        const ans = (rawAns === undefined || rawAns === null) ? '' : String(rawAns);
        rows.push(buildDeckSheetRow(rowNum, [
            slideNum, // 1 Slide_Number
            f.slideTitle, // 2 Slide_Title
            f.placeholder, // 3 Placeholder_Name
            f.question, // 4 Questionnaire_Question
            ans, // 5 Answer_Value
            f.inputType, // 6 Input_Type
            f.required ? 'Required' : 'Optional', // 7 Required_or_Optional
            f.guidance, // 8 Guidance_for_Customer
            f.purpose, // 9 Purpose_in_Investor_Deck
            f.notes || '', // 10 Notes
        ]));
    });
    const lastCol = colLetter(DECK_COLUMNS.length);
    const lastRow = rows.length;
    const dimensionRef = `A1:${lastCol}${lastRow}`;
    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ',
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        `<dimension ref="${dimensionRef}"/>`,
        '<sheetViews><sheetView workbookViewId="0"><pane xSplit="3" ySplit="1" topLeftCell="D2" state="frozen"/></sheetView></sheetViews>',
        '<sheetFormatPr defaultRowHeight="15"/>',
        '<cols>',
        '<col min="1" max="1" width="10" customWidth="1"/>', // Slide_Number
        '<col min="2" max="2" width="28" customWidth="1"/>', // Slide_Title
        '<col min="3" max="3" width="36" customWidth="1"/>', // Placeholder_Name
        '<col min="4" max="4" width="48" customWidth="1"/>', // Question
        '<col min="5" max="5" width="60" customWidth="1"/>', // Answer_Value
        '<col min="6" max="6" width="14" customWidth="1"/>', // Input_Type
        '<col min="7" max="7" width="14" customWidth="1"/>', // Required
        '<col min="8" max="8" width="48" customWidth="1"/>', // Guidance
        '<col min="9" max="9" width="48" customWidth="1"/>', // Purpose
        '<col min="10" max="10" width="32" customWidth="1"/>', // Notes
        '</cols>',
        '<sheetData>',
        rows.join(''),
        '</sheetData>',
        '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>',
        '</worksheet>',
    ].join('');
}
/**
 * Register a brand-new worksheet inside the xlsx zip. Idempotent — if a sheet
 * with the same name already exists we overwrite its body and leave the
 * workbook/rels/content-types entries alone.
 */
async function upsertDeckSheet(zip, fields, answers) {
    // ── Read package descriptors we may need to mutate ─────────────────────────
    const wbFile = zip.file('xl/workbook.xml');
    const wbRelsFile = zip.file('xl/_rels/workbook.xml.rels');
    const ctFile = zip.file('[Content_Types].xml');
    if (!wbFile || !wbRelsFile || !ctFile) {
        throw new Error('xlsx package missing required parts');
    }
    let wbXml = await wbFile.async('string');
    let relsXml = await wbRelsFile.async('string');
    let ctXml = await ctFile.async('string');
    // ── Does the sheet already exist? ──────────────────────────────────────────
    const nameRe = new RegExp(`<sheet\\b[^/>]*\\bname="${DECK_SHEET_NAME}"[^/>]*/>`);
    const existing = wbXml.match(nameRe);
    if (existing) {
        // Pull r:id from the matched <sheet/> tag and resolve its target.
        const ridMatch = /\br:id="([^"]+)"/.exec(existing[0]);
        if (ridMatch) {
            const rid = ridMatch[1];
            const targetRe = new RegExp(`<Relationship[^/>]*\\bId="${rid}"[^/>]*\\bTarget="([^"]+)"`);
            const tMatch = relsXml.match(targetRe);
            if (tMatch) {
                const target = tMatch[1].startsWith('/')
                    ? tMatch[1].slice(1)
                    : `xl/${tMatch[1].replace(/^\.\//, '')}`;
                zip.file(target, buildDeckSheetXml(fields, answers));
                return;
            }
        }
        // Fall through to fresh registration if we couldn't resolve the existing target.
    }
    // ── Allocate a fresh sheetN.xml filename ──────────────────────────────────
    const allSheets = Object.keys(zip.files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
    let n = allSheets.length + 1;
    while (zip.file(`xl/worksheets/sheet${n}.xml`))
        n++;
    const sheetPath = `xl/worksheets/sheet${n}.xml`;
    const sheetTargetRel = `worksheets/sheet${n}.xml`;
    // ── Allocate a fresh rId and sheetId ──────────────────────────────────────
    let maxRid = 0;
    for (const m of relsXml.matchAll(/\bId="rId(\d+)"/g)) {
        const v = parseInt(m[1], 10);
        if (v > maxRid)
            maxRid = v;
    }
    const newRid = `rId${maxRid + 1}`;
    let maxSheetId = 0;
    for (const m of wbXml.matchAll(/\bsheetId="(\d+)"/g)) {
        const v = parseInt(m[1], 10);
        if (v > maxSheetId)
            maxSheetId = v;
    }
    const newSheetId = maxSheetId + 1;
    // ── Write the four pieces ──────────────────────────────────────────────────
    // 1. New sheet body
    zip.file(sheetPath, buildDeckSheetXml(fields, answers));
    // 2. Workbook rels — append new Relationship inside <Relationships>
    const newRel = `<Relationship Id="${newRid}" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
        `Target="${sheetTargetRel}"/>`;
    relsXml = relsXml.replace(/<\/Relationships>/i, `${newRel}</Relationships>`);
    zip.file('xl/_rels/workbook.xml.rels', relsXml);
    // 3. Workbook — append new <sheet/> inside <sheets>
    const newSheet = `<sheet name="${DECK_SHEET_NAME}" sheetId="${newSheetId}" r:id="${newRid}"/>`;
    if (/<sheets\s*\/>/i.test(wbXml)) {
        wbXml = wbXml.replace(/<sheets\s*\/>/i, `<sheets>${newSheet}</sheets>`);
    }
    else {
        wbXml = wbXml.replace(/<\/sheets>/i, `${newSheet}</sheets>`);
    }
    zip.file('xl/workbook.xml', wbXml);
    // 4. [Content_Types].xml — add Override for the new sheet part
    const ctOverride = `<Override PartName="/${sheetPath}" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    // Avoid double-insert if somehow already present.
    if (!ctXml.includes(`PartName="/${sheetPath}"`)) {
        ctXml = ctXml.replace(/<\/Types>/i, `${ctOverride}</Types>`);
        zip.file('[Content_Types].xml', ctXml);
    }
}
// ─── Workbook recalc hint ───────────────────────────────────────────────────
//
// Excel caches calculated values inside the xlsx. After we change input
// cells, the cached values for downstream formulas are stale. We tell
// Excel to fully recalc on open and drop the calcChain so it can rebuild
// the dependency order.
function forceRecalcOnOpen(workbookXml) {
    // Add or update <calcPr fullCalcOnLoad="1" .../>.
    if (/<calcPr\b[^/>]*\/>/i.test(workbookXml)) {
        return workbookXml.replace(/<calcPr\b([^/>]*)\/>/i, (_m, attrs) => {
            if (/fullCalcOnLoad\s*=/.test(attrs)) {
                return `<calcPr${attrs.replace(/fullCalcOnLoad\s*=\s*"[^"]*"/, 'fullCalcOnLoad="1"')}/>`;
            }
            return `<calcPr${attrs} fullCalcOnLoad="1"/>`;
        });
    }
    if (/<calcPr\b[^>]*>[\s\S]*?<\/calcPr>/i.test(workbookXml)) {
        // Rare — treat the open-tag attributes the same as self-closing.
        return workbookXml.replace(/<calcPr\b([^>]*)>/i, (_m, attrs) => {
            if (/fullCalcOnLoad\s*=/.test(attrs)) {
                return `<calcPr${attrs.replace(/fullCalcOnLoad\s*=\s*"[^"]*"/, 'fullCalcOnLoad="1"')}>`;
            }
            return `<calcPr${attrs} fullCalcOnLoad="1">`;
        });
    }
    // No calcPr present — inject one before </workbook>.
    return workbookXml.replace(/<\/workbook>/i, '<calcPr fullCalcOnLoad="1"/></workbook>');
}
// ─── Main ────────────────────────────────────────────────────────────────────
async function run(input) {
    const mb = (n) => Math.round(n / 1024 / 1024);
    const heap = () => `${mb(process.memoryUsage().heapUsed)}/${mb(process.memoryUsage().heapTotal)} MB`;
    console.log(`[xlsx-worker] start  heap=${heap()}`);
    const buf = await promises_1.default.readFile(input.templatePath);
    const zip = await jszip_1.default.loadAsync(buf);
    console.log(`[xlsx-worker] zipped heap=${heap()}`);
    // Locate the target sheet via workbook.xml + its rels file.
    const workbookFile = zip.file('xl/workbook.xml');
    const workbookRelsFile = zip.file('xl/_rels/workbook.xml.rels');
    if (!workbookFile || !workbookRelsFile) {
        throw new Error('Template missing xl/workbook.xml or its rels file');
    }
    let workbookXml = await workbookFile.async('string');
    const workbookRelsXml = await workbookRelsFile.async('string');
    const wbObj = parser.parse(workbookXml);
    const sheets = arr(wbObj?.workbook?.sheets?.sheet);
    const sheetEntry = sheets.find((s) => s['@_name'] === SHEET_NAME);
    if (!sheetEntry || !sheetEntry['@_r:id']) {
        throw new Error(`Sheet "${SHEET_NAME}" not found in workbook`);
    }
    const relsObj = parser.parse(workbookRelsXml);
    const relList = arr(relsObj?.Relationships?.Relationship);
    const rel = relList.find((r) => r['@_Id'] === sheetEntry['@_r:id']);
    if (!rel || !rel['@_Target']) {
        throw new Error(`Relationship ${sheetEntry['@_r:id']} not found`);
    }
    const sheetPath = rel['@_Target'].startsWith('/')
        ? rel['@_Target'].slice(1)
        : `xl/${rel['@_Target'].replace(/^\.\//, '')}`;
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile)
        throw new Error(`Sheet file ${sheetPath} not present in zip`);
    const sheetXml = await sheetFile.async('string');
    console.log(`[xlsx-worker] read   heap=${heap()}`);
    // Parse just this one sheet.
    const sheetObj = parser.parse(sheetXml);
    const ws = sheetObj.worksheet;
    if (!ws)
        throw new Error('worksheet root missing');
    if (!ws.sheetData)
        ws.sheetData = {};
    const rows = arr(ws.sheetData.row);
    const rowMap = new Map();
    for (const r of rows)
        rowMap.set(parseInt(r['@_r'], 10), r);
    // ─── Apply input updates ─────────────────────────────────────────────────
    const set = (addr, v) => setCellValue(rows, rowMap, addr, toNumOrText(v));
    set(CELLS.customerName, input.customerName);
    const g = input.formData.general || {};
    set(CELLS.sector, g.sector);
    set(CELLS.round, g.round);
    set(CELLS.capitalGoal, g.capitalGoal);
    set(CELLS.yearsSince, g.yearsSinceFound);
    set(CELLS.firstYear, g.firstYear);
    // 6.a Customers — rows 17–26
    for (let i = 0; i < CUSTOMERS.maxRows; i++) {
        const r = CUSTOMERS.startRow + i;
        const c = (input.formData.customers || [])[i] || {};
        set(`${CUSTOMERS.cols.name}${r}`, c.name);
        set(`${CUSTOMERS.cols.type}${r}`, c.type);
        set(`${CUSTOMERS.cols.territory}${r}`, c.territory);
    }
    // 6.b Products — rows 30–40. v9 has a per-product cost column at K;
    // we explicitly write null when the customer hasn't entered one so the
    // template's example values don't leak into the customer's file.
    for (let i = 0; i < PRODUCTS.maxRows; i++) {
        const r = PRODUCTS.startRow + i;
        const p = (input.formData.products || [])[i] || {};
        set(`${PRODUCTS.cols.name}${r}`, p.name);
        set(`${PRODUCTS.cols.revenueType}${r}`, p.revenueType);
        set(`${PRODUCTS.cols.price}${r}`, p.price);
        set(`${PRODUCTS.cols.cost}${r}`, p.cost);
    }
    // 7 Let's Scale — v9 one continuous block, rows 44–63. Cost is per-row.
    for (let i = 0; i < LETSSCALE.maxRows; i++) {
        const r = LETSSCALE.startRow + i;
        const l = (input.formData.letsScale || [])[i] || {};
        set(`${LETSSCALE.cols.revenueType}${r}`, l.revenueType);
        set(`${LETSSCALE.cols.customerName}${r}`, l.customerName);
        set(`${LETSSCALE.cols.type}${r}`, l.type);
        set(`${LETSSCALE.cols.territory}${r}`, l.territory);
        set(`${LETSSCALE.cols.productName}${r}`, l.productName);
        set(`${LETSSCALE.cols.price}${r}`, l.price);
        set(`${LETSSCALE.cols.cost}${r}`, l.cost);
        set(`${LETSSCALE.cols.q1}${r}`, l.q1);
        set(`${LETSSCALE.cols.q2}${r}`, l.q2);
        set(`${LETSSCALE.cols.q3}${r}`, l.q3);
        set(`${LETSSCALE.cols.q4}${r}`, l.q4);
        set(`${LETSSCALE.cols.y2}${r}`, l.y2);
    }
    // 8 FTE — v9 rows 68–71: COGS, R&D, S&M, G&A
    const f = input.formData.fte || {};
    set(`${FTE.cols.y1}${FTE.startRow + 0}`, f.cogs_y1);
    set(`${FTE.cols.y2}${FTE.startRow + 0}`, f.cogs_y2);
    set(`${FTE.cols.y1}${FTE.startRow + 1}`, f.rd_y1);
    set(`${FTE.cols.y2}${FTE.startRow + 1}`, f.rd_y2);
    set(`${FTE.cols.y1}${FTE.startRow + 2}`, f.sm_y1);
    set(`${FTE.cols.y2}${FTE.startRow + 2}`, f.sm_y2);
    set(`${FTE.cols.y1}${FTE.startRow + 3}`, f.ga_y1);
    set(`${FTE.cols.y2}${FTE.startRow + 3}`, f.ga_y2);
    // Sort rows by row number (Excel requires ascending) and write back.
    rows.sort((a, b) => parseInt(a['@_r'], 10) - parseInt(b['@_r'], 10));
    ws.sheetData.row = rows;
    console.log(`[xlsx-worker] populated heap=${heap()}`);
    let newSheetXml = builder.build(sheetObj);
    if (!/^<\?xml/i.test(newSheetXml)) {
        newSheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newSheetXml;
    }
    zip.file(sheetPath, newSheetXml);
    // ── Investor deck questionnaire sheet ──────────────────────────────────────
    // Always (re)write the sheet with the latest schema + answers, so existing
    // submissions also get the sheet on regenerate.
    await upsertDeckSheet(zip, investor_deck_schema_1.INVESTOR_DECK_FIELDS, (input.formData.investorDeck || {}));
    // upsertDeckSheet may have rewritten workbook.xml; re-read it before
    // applying the recalc hint so we don't lose our new <sheet/> entry.
    const refreshedWb = zip.file('xl/workbook.xml');
    if (refreshedWb)
        workbookXml = await refreshedWb.async('string');
    console.log(`[xlsx-worker] deck-sheet heap=${heap()}`);
    // Force recalc on open.
    workbookXml = forceRecalcOnOpen(workbookXml);
    zip.file('xl/workbook.xml', workbookXml);
    // Drop calcChain — it can be stale after edits and Excel rebuilds it on open.
    if (zip.file('xl/calcChain.xml')) {
        zip.remove('xl/calcChain.xml');
        // Also remove its relationship so the package validator stays happy.
        const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
        const cleaned = rels.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/gi, '');
        if (cleaned !== rels)
            zip.file('xl/_rels/workbook.xml.rels', cleaned);
        // And from [Content_Types].xml.
        const ctFile = zip.file('[Content_Types].xml');
        if (ctFile) {
            const ct = await ctFile.async('string');
            const ctCleaned = ct.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/gi, '');
            if (ctCleaned !== ct)
                zip.file('[Content_Types].xml', ctCleaned);
        }
    }
    // Stream the zip out to disk.
    const out = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
    await promises_1.default.writeFile(input.filePath, out);
    console.log(`[xlsx-worker] wrote  heap=${heap()} (${out.length} bytes)`);
}
process.on('message', (input) => {
    run(input)
        .then(() => {
        process.send?.({ ok: true });
        setImmediate(() => process.exit(0));
    })
        .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[xlsx-worker] error:', message);
        process.send?.({ ok: false, error: message });
        setImmediate(() => process.exit(1));
    });
});
