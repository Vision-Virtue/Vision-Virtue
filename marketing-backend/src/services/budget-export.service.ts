/* ============================================================
   Budget → Excel export (spec §8.4).

   Produces a single .xlsx with two sheets:
     Sheet 1: Budget Structure (raw editable table from §5)
     Sheet 2: P&L Pivot       (with current filter applied)
   ============================================================ */

import ExcelJS from 'exceljs';
import { BudgetRow, BudgetLineRow, GLAccountRow, OrgEntityRow } from '../db/visibility.repository';
import { PivotResult } from './pivot.service';

const PERIOD_LABEL: Record<string, string> = {
  M01: 'Jan', M02: 'Feb', M03: 'Mar', M04: 'Apr', M05: 'May', M06: 'Jun',
  M07: 'Jul', M08: 'Aug', M09: 'Sep', M10: 'Oct', M11: 'Nov', M12: 'Dec',
  Q1:  'Q1',  Q2:  'Q2',  Q3:  'Q3',  Q4:  'Q4',
  FY:  'FY',
};

export interface ExportLineInput {
  line: BudgetLineRow;
  cells: Record<string, number>;
}

export async function buildBudgetExport(opts: {
  budget: BudgetRow;
  periodKeys: string[];        // budget's native granularity
  lines: ExportLineInput[];
  glById: Map<string, GLAccountRow>;
  orgById: Map<string, OrgEntityRow>;
  pivot: PivotResult;          // pivot result (which already encodes the
                               // user's filter + display granularity)
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vision & Virtue';
  wb.created = new Date();

  // ─── Sheet 1: Budget Structure ────────────────────────────
  const ws1 = wb.addWorksheet('Budget Structure');
  const periodLabels1 = opts.periodKeys.map(p => PERIOD_LABEL[p] ?? p);
  ws1.addRow([
    'Company', 'Service Provider Name', 'Service Description',
    'Division', 'Department', 'Product', 'Activity',
    'GL #', 'GL Name', 'P&L Section', 'Budget Category',
    ...periodLabels1, 'FY Total',
  ]);
  ws1.getRow(1).font = { bold: true };
  ws1.getRow(1).alignment = { vertical: 'middle' };

  const orgName = (id: string | null): string =>
    id ? (opts.orgById.get(id)?.name || '') : '';
  for (const { line, cells } of opts.lines) {
    const gl = line.glAccountId ? opts.glById.get(line.glAccountId) : undefined;
    const fyTotal = opts.periodKeys.reduce((s, p) => s + (Number(cells[p]) || 0), 0);
    ws1.addRow([
      orgName(line.companyId),
      line.serviceProviderName,
      line.serviceDescription,
      orgName(line.divisionId),
      orgName(line.departmentId),
      orgName(line.productId),
      orgName(line.activityId),
      gl?.glNumber || '',
      gl?.glName   || '',
      gl?.plSection || '',
      gl
        ? (gl.budgetCategory === 'Your Budget Category'
            ? (gl.budgetCategoryCustom || '')
            : (gl.budgetCategory || ''))
        : '',
      ...opts.periodKeys.map(p => Number(cells[p]) || 0),
      fyTotal,
    ]);
  }
  // Reasonable column widths
  ws1.columns.forEach((col, i) => {
    col.width = i < 11 ? 18 : 13;
  });

  // ─── Sheet 2: P&L Pivot ───────────────────────────────────
  const ws2 = wb.addWorksheet('P&L Pivot');
  const periodLabels2 = opts.pivot.periodKeys.map(p => PERIOD_LABEL[p] ?? p);
  const periodKeys = opts.pivot.periodKeys;
  ws2.addRow([
    'P&L Section', 'Budget Category',
    ...periodLabels2, 'FY Total',
  ]);
  ws2.getRow(1).font = { bold: true };

  const sumGroup = (sec: string, p: string): number => {
    const g = opts.pivot.groups.find(gr => gr.plSection === sec);
    return g ? (g.cells[p] || 0) : 0;
  };
  const sumGroupFy = (sec: string): number => {
    const g = opts.pivot.groups.find(gr => gr.plSection === sec);
    return g ? g.fyTotal : 0;
  };

  // Helper that writes a section with categories.
  const writeSection = (sectionName: string): void => {
    const group = opts.pivot.groups.find(g => g.plSection === sectionName);
    if (!group) return;
    const totalRow = ws2.addRow([
      group.plSection, '— total —',
      ...periodKeys.map(p => group.cells[p] || 0),
      group.fyTotal,
    ]);
    totalRow.font = { bold: true };
    for (const c of group.categories) {
      ws2.addRow([
        '', c.name,
        ...periodKeys.map(p => c.cells[p] || 0),
        c.fyTotal,
      ]);
    }
  };

  // 1) Revenues + 2) COGS
  writeSection('Revenues');
  writeSection('COGS');

  // 3) Gross Margin % row (above GP, then row, then below)
  const gmAbove = ws2.addRow([
    'Gross Margin %', '',
    ...periodKeys.map(p => Number((opts.pivot.grossMargin[p] || 0).toFixed(2))),
    Number((opts.pivot.grossMargin.fyTotal || 0).toFixed(2)),
  ]);
  gmAbove.font = { bold: true, color: { argb: 'FF2E7D32' } };

  // Gross Profit = Revenues - COGS
  const gpCells: Record<string, number> = {};
  for (const p of periodKeys) gpCells[p] = sumGroup('Revenues', p) - sumGroup('COGS', p);
  const gpFy = sumGroupFy('Revenues') - sumGroupFy('COGS');
  const gpRow = ws2.addRow([
    'Gross Profit', '',
    ...periodKeys.map(p => gpCells[p]),
    gpFy,
  ]);
  gpRow.font = { bold: true };

  const gmBelow = ws2.addRow([
    'Gross Margin %', '',
    ...periodKeys.map(p => Number((opts.pivot.grossMargin[p] || 0).toFixed(2))),
    Number((opts.pivot.grossMargin.fyTotal || 0).toFixed(2)),
  ]);
  gmBelow.font = { bold: true, color: { argb: 'FF2E7D32' } };

  // 4) OPEX sections
  writeSection('R&D');
  writeSection('S&M');
  writeSection('G&A');

  // Total OPEX = R&D + S&M + G&A
  const opexCells: Record<string, number> = {};
  for (const p of periodKeys) {
    opexCells[p] = sumGroup('R&D', p) + sumGroup('S&M', p) + sumGroup('G&A', p);
  }
  const opexFy = sumGroupFy('R&D') + sumGroupFy('S&M') + sumGroupFy('G&A');
  const opexRow = ws2.addRow([
    'Total OPEX', '',
    ...periodKeys.map(p => opexCells[p]),
    opexFy,
  ]);
  opexRow.font = { bold: true };

  // Adjusted EBITDA = Gross Profit - Total OPEX
  const ebitdaCells: Record<string, number> = {};
  for (const p of periodKeys) ebitdaCells[p] = gpCells[p] - opexCells[p];
  const ebitdaFy = gpFy - opexFy;
  const ebitdaRow = ws2.addRow([
    'Adjusted EBITDA', '',
    ...periodKeys.map(p => ebitdaCells[p]),
    ebitdaFy,
  ]);
  ebitdaRow.font = { bold: true, color: { argb: 'FF1565C0' } };

  // Adjusted EBITDA % = EBITDA / Revenues × 100
  const pctOf = (num: number, denom: number): number =>
    denom > 0 ? (num / denom) * 100 : 0;
  const ebitdaPctRow = ws2.addRow([
    'Adjusted EBITDA %', '',
    ...periodKeys.map(p => Number(pctOf(ebitdaCells[p], sumGroup('Revenues', p)).toFixed(2))),
    Number(pctOf(ebitdaFy, sumGroupFy('Revenues')).toFixed(2)),
  ]);
  ebitdaPctRow.font = { bold: true, color: { argb: 'FF1565C0' } };

  // 5) Below-the-line sections (Financial, Tax, Other Income/(Expenses))
  for (const s of ['Financial Income/(Expenses)', 'Tax', 'Other Income/(Expenses)']) {
    writeSection(s);
  }

  ws2.columns.forEach((col, i) => {
    col.width = i < 2 ? 26 : 13;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
