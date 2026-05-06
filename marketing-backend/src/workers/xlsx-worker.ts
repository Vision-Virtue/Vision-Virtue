/* ============================================================
   xlsx generation worker — JSZip + XML surgical editor.

   Background: ExcelJS loaded the v5 template at ~500 MB peak
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

import JSZip from 'jszip';
import fs from 'fs/promises';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const SHEET_NAME = "Customer's Questionnaire";

// Cell layout — matches the v5 template.
//
// Section 1–5 sit in column I, sections 6.a / 6.b in columns H–J,
// and section 7 splits Let's-Scale rows by revenueType into three
// blocks (7.a HW, 7.b SW, 7.c Other), each in columns I/L/M.
const CELLS = {
  customerName: 'I6',
  sector:        'I8',   // Section 1
  round:         'I9',   // Section 2
  capitalGoal:   'I10',  // Section 3
  yearsSince:    'I11',  // Section 4
  firstYear:     'I12',  // Section 5
};

// Section 6.a Customers — rows 17–26 (max 10).
const CUSTOMERS = {
  startRow: 17, maxRows: 10,
  cols: { name: 'H', type: 'I', territory: 'J' },
};

// Section 6.b Products — rows 30–39 (max 10).
const PRODUCTS = {
  startRow: 30, maxRows: 10,
  cols: { name: 'H', revenueType: 'I', price: 'J' },
};

// Section 7 Let's Scale — split by revenueType.
// Each block fills customerName in col I, productName in col L,
// price in col M.
const LETSSCALE_HW = {
  startRow: 44, maxRows: 6,
  cols: { customerName: 'I', productName: 'L', price: 'M' },
};
const LETSSCALE_SW = {
  startRow: 52, maxRows: 6,
  cols: { customerName: 'I', productName: 'L', price: 'M' },
};
const LETSSCALE_OTHER = {
  startRow: 60, maxRows: 5,
  cols: { customerName: 'I', productName: 'L', price: 'M' },
};

interface SubmissionFormData {
  general?: {
    sector?: string; round?: string; capitalGoal?: string;
    yearsSinceFound?: string; firstYear?: string;
  };
  customers?: Array<{ name?: string; type?: string; territory?: string }>;
  products?: Array<{ name?: string; revenueType?: string; price?: string }>;
  letsScale?: Array<{
    customerName?: string; type?: string; territory?: string;
    productName?: string; revenueType?: string; price?: string;
    q1?: string; q2?: string; q3?: string; q4?: string; y2?: string;
  }>;
  unitCosts?: Array<{ productName?: string; cost?: string }>;
  fte?: {
    cogs_y1?: string; cogs_y2?: string;
    rd_y1?: string;   rd_y2?: string;
    sm_y1?: string;   sm_y2?: string;
    ga_y1?: string;   ga_y2?: string;
  };
}

interface WorkerInput {
  customerName: string;
  formData: SubmissionFormData;
  templatePath: string;
  filePath: string;
}

// ─── Value coercion ─────────────────────────────────────────────────────────

function toNumOrText(v: unknown): number | string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (Number.isFinite(n) && /^[-+]?\d+(\.\d+)?$/.test(cleaned)) return n;
  return s;
}

// ─── Cell-address helpers ───────────────────────────────────────────────────

function parseAddr(addr: string): { col: string; row: number; colNum: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!m) throw new Error(`Bad cell address: ${addr}`);
  let colNum = 0;
  for (const ch of m[1]) colNum = colNum * 26 + (ch.charCodeAt(0) - 64);
  return { col: m[1], row: parseInt(m[2], 10), colNum };
}

function arr<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

// ─── XML parser/builder configuration ───────────────────────────────────────
//
// We only force `row`, `c`, `sheet`, and `Relationship` to be arrays so
// single/multi handling is consistent. Everything else stays as parsed.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => (
    name === 'row' || name === 'c' || name === 'sheet' || name === 'Relationship'
  ),
});
const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: false,
  suppressEmptyNode: false,
});

// ─── Sheet manipulation ─────────────────────────────────────────────────────

interface CellNode {
  '@_r': string;
  '@_t'?: string;
  '@_s'?: string;
  v?: string | number;
  f?: unknown;
  is?: { t: { '#text': string } | string };
  [k: string]: unknown;
}
interface RowNode {
  '@_r': string;
  c?: CellNode[];
  [k: string]: unknown;
}

function setCellValue(
  rows: RowNode[],
  rowMap: Map<number, RowNode>,
  addr: string,
  value: number | string | null,
): void {
  const { row: rowNum, colNum } = parseAddr(addr);
  let row = rowMap.get(rowNum);
  if (!row) {
    if (value === null) return;
    row = { '@_r': String(rowNum), c: [] };
    rows.push(row);
    rowMap.set(rowNum, row);
  }
  if (!row.c) row.c = [];
  const cells = row.c;

  let cell = cells.find((c) => c['@_r'] === addr);
  if (!cell) {
    if (value === null) return;
    cell = { '@_r': addr };
    cells.push(cell);
  }

  // Wipe value-related fields (preserving style `s` and any other attrs).
  delete cell.v;
  delete cell.is;
  delete cell.f;
  delete cell['@_t'];

  if (value === null) return;

  if (typeof value === 'number') {
    // Numeric — default cell type is 'n', no @_t needed.
    cell.v = value;
  } else {
    // String — use inline strings so we don't have to mutate sharedStrings.xml.
    cell['@_t'] = 'inlineStr';
    cell.is = { t: { '#text': value } };
  }

  // Keep cells in column order for Excel-compatibility.
  cells.sort((a, b) => parseAddr(a['@_r']).colNum - parseAddr(b['@_r']).colNum);
}

// ─── Workbook recalc hint ───────────────────────────────────────────────────
//
// Excel caches calculated values inside the xlsx. After we change input
// cells, the cached values for downstream formulas are stale. We tell
// Excel to fully recalc on open and drop the calcChain so it can rebuild
// the dependency order.

function forceRecalcOnOpen(workbookXml: string): string {
  // Add or update <calcPr fullCalcOnLoad="1" .../>.
  if (/<calcPr\b[^/>]*\/>/i.test(workbookXml)) {
    return workbookXml.replace(
      /<calcPr\b([^/>]*)\/>/i,
      (_m, attrs: string) => {
        if (/fullCalcOnLoad\s*=/.test(attrs)) {
          return `<calcPr${attrs.replace(/fullCalcOnLoad\s*=\s*"[^"]*"/, 'fullCalcOnLoad="1"')}/>`;
        }
        return `<calcPr${attrs} fullCalcOnLoad="1"/>`;
      },
    );
  }
  if (/<calcPr\b[^>]*>[\s\S]*?<\/calcPr>/i.test(workbookXml)) {
    // Rare — treat the open-tag attributes the same as self-closing.
    return workbookXml.replace(
      /<calcPr\b([^>]*)>/i,
      (_m, attrs: string) => {
        if (/fullCalcOnLoad\s*=/.test(attrs)) {
          return `<calcPr${attrs.replace(/fullCalcOnLoad\s*=\s*"[^"]*"/, 'fullCalcOnLoad="1"')}>`;
        }
        return `<calcPr${attrs} fullCalcOnLoad="1">`;
      },
    );
  }
  // No calcPr present — inject one before </workbook>.
  return workbookXml.replace(
    /<\/workbook>/i,
    '<calcPr fullCalcOnLoad="1"/></workbook>',
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run(input: WorkerInput): Promise<void> {
  const mb = (n: number): number => Math.round(n / 1024 / 1024);
  const heap = (): string => `${mb(process.memoryUsage().heapUsed)}/${mb(process.memoryUsage().heapTotal)} MB`;

  console.log(`[xlsx-worker] start  heap=${heap()}`);

  const buf = await fs.readFile(input.templatePath);
  const zip = await JSZip.loadAsync(buf);
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
  const sheets = arr<{ '@_name'?: string; '@_r:id'?: string; '@_sheetId'?: string }>(
    wbObj?.workbook?.sheets?.sheet,
  );
  const sheetEntry = sheets.find((s) => s['@_name'] === SHEET_NAME);
  if (!sheetEntry || !sheetEntry['@_r:id']) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in workbook`);
  }

  const relsObj = parser.parse(workbookRelsXml);
  const relList = arr<{ '@_Id'?: string; '@_Target'?: string }>(
    relsObj?.Relationships?.Relationship,
  );
  const rel = relList.find((r) => r['@_Id'] === sheetEntry['@_r:id']);
  if (!rel || !rel['@_Target']) {
    throw new Error(`Relationship ${sheetEntry['@_r:id']} not found`);
  }
  const sheetPath = rel['@_Target'].startsWith('/')
    ? rel['@_Target'].slice(1)
    : `xl/${rel['@_Target'].replace(/^\.\//, '')}`;

  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) throw new Error(`Sheet file ${sheetPath} not present in zip`);
  const sheetXml = await sheetFile.async('string');
  console.log(`[xlsx-worker] read   heap=${heap()}`);

  // Parse just this one sheet.
  const sheetObj = parser.parse(sheetXml);
  const ws = sheetObj.worksheet;
  if (!ws) throw new Error('worksheet root missing');
  if (!ws.sheetData) ws.sheetData = {};
  const rows: RowNode[] = arr<RowNode>(ws.sheetData.row);
  const rowMap = new Map<number, RowNode>();
  for (const r of rows) rowMap.set(parseInt(r['@_r'], 10), r);

  // ─── Apply input updates ─────────────────────────────────────────────────

  const set = (addr: string, v: unknown): void =>
    setCellValue(rows, rowMap, addr, toNumOrText(v));

  set(CELLS.customerName, input.customerName);
  const g = input.formData.general || {};
  set(CELLS.sector,      g.sector);
  set(CELLS.round,       g.round);
  set(CELLS.capitalGoal, g.capitalGoal);
  set(CELLS.yearsSince,  g.yearsSinceFound);
  set(CELLS.firstYear,   g.firstYear);

  // 6.a Customers — rows 17–26
  for (let i = 0; i < CUSTOMERS.maxRows; i++) {
    const r = CUSTOMERS.startRow + i;
    const c = (input.formData.customers || [])[i] || {};
    set(`${CUSTOMERS.cols.name}${r}`,      c.name);
    set(`${CUSTOMERS.cols.type}${r}`,      c.type);
    set(`${CUSTOMERS.cols.territory}${r}`, c.territory);
  }

  // 6.b Products — rows 30–39
  for (let i = 0; i < PRODUCTS.maxRows; i++) {
    const r = PRODUCTS.startRow + i;
    const p = (input.formData.products || [])[i] || {};
    set(`${PRODUCTS.cols.name}${r}`,        p.name);
    set(`${PRODUCTS.cols.revenueType}${r}`, p.revenueType);
    set(`${PRODUCTS.cols.price}${r}`,       p.price);
  }

  // 7 Let's Scale — split rows by revenueType.
  const all = input.formData.letsScale || [];
  const hwRows    = all.filter((l) => l.revenueType === 'HW');
  const swRows    = all.filter((l) => l.revenueType === 'SW');
  const otherRows = all.filter((l) => l.revenueType === 'Other');

  const writeBlock = (
    block: { startRow: number; maxRows: number; cols: { customerName: string; productName: string; price: string } },
    items: Array<{ customerName?: string; productName?: string; price?: string }>,
  ): void => {
    for (let i = 0; i < block.maxRows; i++) {
      const r = block.startRow + i;
      const l = items[i] || {};
      set(`${block.cols.customerName}${r}`, l.customerName);
      set(`${block.cols.productName}${r}`,  l.productName);
      set(`${block.cols.price}${r}`,        l.price);
    }
  };

  writeBlock(LETSSCALE_HW,    hwRows);     // 7.a — rows 44–49
  writeBlock(LETSSCALE_SW,    swRows);     // 7.b — rows 52–57
  writeBlock(LETSSCALE_OTHER, otherRows);  // 7.c — rows 60–64

  // Sort rows by row number (Excel requires ascending) and write back.
  rows.sort((a, b) => parseInt(a['@_r'], 10) - parseInt(b['@_r'], 10));
  ws.sheetData.row = rows;
  console.log(`[xlsx-worker] populated heap=${heap()}`);

  let newSheetXml = builder.build(sheetObj);
  if (!/^<\?xml/i.test(newSheetXml)) {
    newSheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newSheetXml;
  }
  zip.file(sheetPath, newSheetXml);

  // Force recalc on open.
  workbookXml = forceRecalcOnOpen(workbookXml);
  zip.file('xl/workbook.xml', workbookXml);

  // Drop calcChain — it can be stale after edits and Excel rebuilds it on open.
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    // Also remove its relationship so the package validator stays happy.
    const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
    const cleaned = rels.replace(
      /<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/gi,
      '',
    );
    if (cleaned !== rels) zip.file('xl/_rels/workbook.xml.rels', cleaned);
    // And from [Content_Types].xml.
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      const ct = await ctFile.async('string');
      const ctCleaned = ct.replace(
        /<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/gi,
        '',
      );
      if (ctCleaned !== ct) zip.file('[Content_Types].xml', ctCleaned);
    }
  }

  // Stream the zip out to disk.
  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  await fs.writeFile(input.filePath, out);
  console.log(`[xlsx-worker] wrote  heap=${heap()} (${out.length} bytes)`);
}

process.on('message', (input: WorkerInput) => {
  run(input)
    .then(() => {
      process.send?.({ ok: true });
      setImmediate(() => process.exit(0));
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[xlsx-worker] error:', message);
      process.send?.({ ok: false, error: message });
      setImmediate(() => process.exit(1));
    });
});
