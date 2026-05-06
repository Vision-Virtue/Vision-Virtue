/* ============================================================
   xlsx generation worker — runs as a child process.

   ExcelJS loading the Financial Model v5 template peaks a few
   hundred MB of heap. On Render's 512 MB Starter the main API
   process can't absorb that without OOM-crashing.

   Solution: the partner-xlsx service forks this script per
   request. The worker reads the template, populates the
   "Customer's Questionnaire" sheet, writes the output file,
   sends the result back over IPC, and exits — releasing all
   memory in the process. If ExcelJS blows up here it kills
   only this worker, never the API.
   ============================================================ */

import ExcelJS from 'exceljs';

const SHEET_NAME = "Customer's Questionnaire";

// Cell layout — kept in sync with the v5 template. If a cell
// is off by a row, adjust the constants here.
const CELLS = {
  customerName: 'C2',
  sector:        'C5',
  round:         'C6',
  capitalGoal:   'C7',
  yearsSince:    'C8',
  firstYear:     'C9',
};

const CUSTOMERS = {
  startRow: 13, maxRows: 50,
  cols: { name: 'B', type: 'C', territory: 'D' },
};
const PRODUCTS = {
  startRow: 13, maxRows: 50,
  cols: { name: 'F', revenueType: 'G', price: 'H' },
};
const LETSSCALE = {
  startRow: 67, maxRows: 100,
  cols: {
    customerName: 'B', type: 'C', territory: 'D',
    productName: 'E', revenueType: 'F', price: 'G',
    q1: 'H', q2: 'I', q3: 'J', q4: 'K', y2: 'L',
  },
};
const UNITCOSTS = {
  startRow: 175, maxRows: 50,
  cols: { name: 'B', cost: 'C' },
};
const FTE = {
  startRow: 188,
  cols: { y1: 'C', y2: 'D' },
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

function toNumOrText(v: unknown): number | string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (Number.isFinite(n) && /^[-+]?\d+(\.\d+)?$/.test(cleaned)) return n;
  return s;
}

function setCell(ws: ExcelJS.Worksheet, addr: string, value: unknown): void {
  const v = toNumOrText(value);
  ws.getCell(addr).value = v === null ? null : (v as ExcelJS.CellValue);
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

async function run(input: WorkerInput): Promise<void> {
  const mb = (n: number): number => Math.round(n / 1024 / 1024);
  const heap = (): string => `${mb(process.memoryUsage().heapUsed)}/${mb(process.memoryUsage().heapTotal)} MB`;

  console.log(`[xlsx-worker] start  heap=${heap()}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(input.templatePath);
  console.log(`[xlsx-worker] read   heap=${heap()}`);

  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" not found in template`);

  setCell(ws, CELLS.customerName, input.customerName);
  const g = input.formData.general || {};
  setCell(ws, CELLS.sector,      g.sector);
  setCell(ws, CELLS.round,       g.round);
  setCell(ws, CELLS.capitalGoal, g.capitalGoal);
  setCell(ws, CELLS.yearsSince,  g.yearsSinceFound);
  setCell(ws, CELLS.firstYear,   g.firstYear);

  clearRange(ws, CUSTOMERS.startRow, CUSTOMERS.startRow + CUSTOMERS.maxRows - 1,
    Object.values(CUSTOMERS.cols));
  (input.formData.customers || []).forEach((c, i) => {
    const r = CUSTOMERS.startRow + i;
    setCell(ws, `${CUSTOMERS.cols.name}${r}`,      c.name);
    setCell(ws, `${CUSTOMERS.cols.type}${r}`,      c.type);
    setCell(ws, `${CUSTOMERS.cols.territory}${r}`, c.territory);
  });

  clearRange(ws, PRODUCTS.startRow, PRODUCTS.startRow + PRODUCTS.maxRows - 1,
    Object.values(PRODUCTS.cols));
  (input.formData.products || []).forEach((p, i) => {
    const r = PRODUCTS.startRow + i;
    setCell(ws, `${PRODUCTS.cols.name}${r}`,        p.name);
    setCell(ws, `${PRODUCTS.cols.revenueType}${r}`, p.revenueType);
    setCell(ws, `${PRODUCTS.cols.price}${r}`,       p.price);
  });

  clearRange(ws, LETSSCALE.startRow, LETSSCALE.startRow + LETSSCALE.maxRows - 1,
    Object.values(LETSSCALE.cols));
  (input.formData.letsScale || []).forEach((l, i) => {
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

  clearRange(ws, UNITCOSTS.startRow, UNITCOSTS.startRow + UNITCOSTS.maxRows - 1,
    Object.values(UNITCOSTS.cols));
  (input.formData.unitCosts || []).forEach((u, i) => {
    const r = UNITCOSTS.startRow + i;
    setCell(ws, `${UNITCOSTS.cols.name}${r}`, u.productName);
    setCell(ws, `${UNITCOSTS.cols.cost}${r}`, u.cost);
  });

  const f = input.formData.fte || {};
  setCell(ws, `${FTE.cols.y1}${FTE.startRow + 0}`, f.cogs_y1);
  setCell(ws, `${FTE.cols.y2}${FTE.startRow + 0}`, f.cogs_y2);
  setCell(ws, `${FTE.cols.y1}${FTE.startRow + 1}`, f.rd_y1);
  setCell(ws, `${FTE.cols.y2}${FTE.startRow + 1}`, f.rd_y2);
  setCell(ws, `${FTE.cols.y1}${FTE.startRow + 2}`, f.sm_y1);
  setCell(ws, `${FTE.cols.y2}${FTE.startRow + 2}`, f.sm_y2);
  setCell(ws, `${FTE.cols.y1}${FTE.startRow + 3}`, f.ga_y1);
  setCell(ws, `${FTE.cols.y2}${FTE.startRow + 3}`, f.ga_y2);

  console.log(`[xlsx-worker] populated heap=${heap()}`);
  await wb.xlsx.writeFile(input.filePath);
  console.log(`[xlsx-worker] wrote  heap=${heap()}`);
}

process.on('message', (input: WorkerInput) => {
  run(input)
    .then(() => {
      process.send?.({ ok: true });
      // Allow IPC flush before exit.
      setImmediate(() => process.exit(0));
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.send?.({ ok: false, error: message });
      setImmediate(() => process.exit(1));
    });
});
