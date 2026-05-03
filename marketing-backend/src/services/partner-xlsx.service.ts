/* ============================================================
   Partner Customer Area — xlsx generator
   Loads the Financial Model v5 template, populates the
   "Customer's Questionnaire" sheet with the customer's
   responses, and saves it under the Render persistent disk.
   ============================================================ */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

// ─── Layout — cell coordinates inside the "Customer's Questionnaire" sheet ───
//
// These match the visible layout in the v5 template (column C is the value
// column for sections 1–5; column B begins the table headers; 6.a starts at
// row 13 etc.). If a cell is off by a row, adjust the constants here — no
// other code change needed.

const SHEET_NAME = "Customer's Questionnaire";

// Section 1–5: single-value cells in column C (value column on the right)
const CELLS = {
  customerName: 'C2',
  sector:        'C5',
  round:         'C6',
  capitalGoal:   'C7',
  yearsSince:    'C8',
  firstYear:     'C9',
};

// Tables — start row, row range to clear (so re-finalizing doesn't leave
// stale rows behind), and column letter for each field.
const CUSTOMERS = {
  startRow: 13,                  // first data row of 6.a
  maxRows:  50,                  // clear up to this many rows on each fill
  cols: { name: 'B', type: 'C', territory: 'D' },
};
const PRODUCTS = {
  startRow: 13,                  // first data row of 6.b (same template
                                 // layout has products to the right of customers)
  maxRows:  50,
  cols: { name: 'F', revenueType: 'G', price: 'H' },
};
const LETSSCALE = {
  startRow: 67,                  // first data row of section 7 (Let's Scale)
  maxRows:  100,
  cols: {
    customerName: 'B', type: 'C', territory: 'D',
    productName: 'E', revenueType: 'F', price: 'G',
    q1: 'H', q2: 'I', q3: 'J', q4: 'K', y2: 'L',
  },
};
const UNITCOSTS = {
  startRow: 175,                 // section 8 unit costs
  maxRows:  50,
  cols: { name: 'B', cost: 'C' },
};
const FTE = {
  startRow: 188,                 // 4 rows: COGS, R&D, S&M, G&A
  cols: { y1: 'C', y2: 'D' },
};

// ─── Storage location for generated xlsx ─────────────────────────────────────

function customerXlsxDir(): string {
  // Same parent as DB_PATH (the persistent disk on Render).
  const dbPath = process.env.DB_PATH || './data/marketing.db';
  return path.join(path.dirname(path.resolve(dbPath)), 'customer-xlsx');
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function templatePath(): string {
  // Always look relative to the backend root (one directory above /dist
  // when running compiled, or the cwd in dev — we resolve via cwd).
  return path.resolve(process.cwd(), 'templates', 'Financial Model v5.xlsx');
}

// ─── Types we accept (loose — must match the partner.js submission shape) ───

interface SubmissionFormData {
  general?: {
    sector?: string;
    round?: string;
    capitalGoal?: string;
    yearsSinceFound?: string;
    firstYear?: string;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a value to a number if it parses cleanly, otherwise the string. */
function toNumOrText(v: unknown): number | string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  // Strip $ and commas before parseFloat
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (Number.isFinite(n) && /^[-+]?\d+(\.\d+)?$/.test(cleaned)) return n;
  return s;
}

function setCell(ws: ExcelJS.Worksheet, addr: string, value: unknown): void {
  const v = toNumOrText(value);
  if (v === null) {
    ws.getCell(addr).value = null;
  } else {
    ws.getCell(addr).value = v as ExcelJS.CellValue;
  }
}

function clearRange(
  ws: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  cols: string[],
): void {
  for (let r = startRow; r <= endRow; r++) {
    for (const c of cols) ws.getCell(`${c}${r}`).value = null;
  }
}

// ─── Public entry point ──────────────────────────────────────────────────────

export interface PopulateResult {
  /** Absolute path to the saved file. */
  filePath: string;
  /** File name (no directory). */
  fileName: string;
}

export async function generateFinalizedXlsx(
  submissionId: string,
  customerName: string,
  formData: SubmissionFormData,
): Promise<PopulateResult> {
  const tplPath = templatePath();
  if (!fs.existsSync(tplPath)) {
    throw new Error(`Template not found at ${tplPath}`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(tplPath);

  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in template`);
  }

  // Section header: customer name + general (1–5)
  setCell(ws, CELLS.customerName, customerName);
  const g = formData.general || {};
  setCell(ws, CELLS.sector,      g.sector);
  setCell(ws, CELLS.round,       g.round);
  setCell(ws, CELLS.capitalGoal, g.capitalGoal);
  setCell(ws, CELLS.yearsSince,  g.yearsSinceFound);
  setCell(ws, CELLS.firstYear,   g.firstYear);

  // Section 6.a Customers
  clearRange(ws, CUSTOMERS.startRow, CUSTOMERS.startRow + CUSTOMERS.maxRows - 1,
    Object.values(CUSTOMERS.cols));
  (formData.customers || []).forEach((c, i) => {
    const r = CUSTOMERS.startRow + i;
    setCell(ws, `${CUSTOMERS.cols.name}${r}`,      c.name);
    setCell(ws, `${CUSTOMERS.cols.type}${r}`,      c.type);
    setCell(ws, `${CUSTOMERS.cols.territory}${r}`, c.territory);
  });

  // Section 6.b Products
  clearRange(ws, PRODUCTS.startRow, PRODUCTS.startRow + PRODUCTS.maxRows - 1,
    Object.values(PRODUCTS.cols));
  (formData.products || []).forEach((p, i) => {
    const r = PRODUCTS.startRow + i;
    setCell(ws, `${PRODUCTS.cols.name}${r}`,        p.name);
    setCell(ws, `${PRODUCTS.cols.revenueType}${r}`, p.revenueType);
    setCell(ws, `${PRODUCTS.cols.price}${r}`,       p.price);
  });

  // Section 7 Let's Scale
  clearRange(ws, LETSSCALE.startRow, LETSSCALE.startRow + LETSSCALE.maxRows - 1,
    Object.values(LETSSCALE.cols));
  (formData.letsScale || []).forEach((l, i) => {
    const r = LETSSCALE.startRow + i;
    setCell(ws, `${LETSSCALE.cols.customerName}${r}`, l.customerName);
    setCell(ws, `${LETSSCALE.cols.type}${r}`,         l.type);
    setCell(ws, `${LETSSCALE.cols.territory}${r}`,    l.territory);
    setCell(ws, `${LETSSCALE.cols.productName}${r}`,  l.productName);
    setCell(ws, `${LETSSCALE.cols.revenueType}${r}`,  l.revenueType);
    setCell(ws, `${LETSSCALE.cols.price}${r}`,        l.price);
    setCell(ws, `${LETSSCALE.cols.q1}${r}`,           l.q1);
    setCell(ws, `${LETSSCALE.cols.q2}${r}`,           l.q2);
    setCell(ws, `${LETSSCALE.cols.q3}${r}`,           l.q3);
    setCell(ws, `${LETSSCALE.cols.q4}${r}`,           l.q4);
    setCell(ws, `${LETSSCALE.cols.y2}${r}`,           l.y2);
  });

  // Section 8 Unit Costs
  clearRange(ws, UNITCOSTS.startRow, UNITCOSTS.startRow + UNITCOSTS.maxRows - 1,
    Object.values(UNITCOSTS.cols));
  (formData.unitCosts || []).forEach((u, i) => {
    const r = UNITCOSTS.startRow + i;
    setCell(ws, `${UNITCOSTS.cols.name}${r}`, u.productName);
    setCell(ws, `${UNITCOSTS.cols.cost}${r}`, u.cost);
  });

  // Section 9 FTE Headcount — fixed 4 rows: COGS, R&D, S&M, G&A
  const f = formData.fte || {};
  setCell(ws, `${FTE.cols.y1}${FTE.startRow + 0}`, f.cogs_y1);
  setCell(ws, `${FTE.cols.y2}${FTE.startRow + 0}`, f.cogs_y2);
  setCell(ws, `${FTE.cols.y1}${FTE.startRow + 1}`, f.rd_y1);
  setCell(ws, `${FTE.cols.y2}${FTE.startRow + 1}`, f.rd_y2);
  setCell(ws, `${FTE.cols.y1}${FTE.startRow + 2}`, f.sm_y1);
  setCell(ws, `${FTE.cols.y2}${FTE.startRow + 2}`, f.sm_y2);
  setCell(ws, `${FTE.cols.y1}${FTE.startRow + 3}`, f.ga_y1);
  setCell(ws, `${FTE.cols.y2}${FTE.startRow + 3}`, f.ga_y2);

  // Persist to disk
  const outDir = customerXlsxDir();
  ensureDir(outDir);
  const safeName = customerName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'customer';
  const fileName = `${safeName}__${submissionId}.xlsx`;
  const filePath = path.join(outDir, fileName);
  await wb.xlsx.writeFile(filePath);

  return { filePath, fileName };
}

/** Returns the absolute path for a stored xlsx (or null if missing). */
export function resolveStoredXlsx(filePath: string): string | null {
  if (!filePath) return null;
  // Accept both stored absolute paths (older) and bare filenames.
  const candidate = path.isAbsolute(filePath)
    ? filePath
    : path.join(customerXlsxDir(), filePath);
  return fs.existsSync(candidate) ? candidate : null;
}
