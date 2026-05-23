"use strict";
/* ============================================================
   Budget → Excel export (spec §8.4).

   Produces a single .xlsx with two sheets:
     Sheet 1: Budget Structure (raw editable table from §5)
     Sheet 2: P&L Pivot       (with current filter applied)
   ============================================================ */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBudgetExport = buildBudgetExport;
const exceljs_1 = __importDefault(require("exceljs"));
const PERIOD_LABEL = {
    M01: 'Jan', M02: 'Feb', M03: 'Mar', M04: 'Apr', M05: 'May', M06: 'Jun',
    M07: 'Jul', M08: 'Aug', M09: 'Sep', M10: 'Oct', M11: 'Nov', M12: 'Dec',
    Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4',
    FY: 'FY',
};
async function buildBudgetExport(opts) {
    const wb = new exceljs_1.default.Workbook();
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
    const orgName = (id) => id ? (opts.orgById.get(id)?.name || '') : '';
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
            gl?.glName || '',
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
    // P&L calculations use absolute values so a negative-signed Revenues
    // (entered as an accounting credit) still flows correctly through
    // Gross Profit / OPEX / EBITDA / GM% / EBITDA%. The signed amounts
    // themselves are still written into the underlying section subtotal
    // rows (the user explicitly asked for export to keep the original
    // signed value).
    const absGroup = (sec, p) => {
        const g = opts.pivot.groups.find(gr => gr.plSection === sec);
        return Math.abs(g ? (g.cells[p] || 0) : 0);
    };
    const absGroupFy = (sec) => {
        const g = opts.pivot.groups.find(gr => gr.plSection === sec);
        return Math.abs(g ? g.fyTotal : 0);
    };
    // Helper that writes a section with categories.
    const writeSection = (sectionName) => {
        const group = opts.pivot.groups.find(g => g.plSection === sectionName);
        if (!group)
            return;
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
    // Gross Profit = |Revenues| - |COGS|
    const gpCells = {};
    for (const p of periodKeys)
        gpCells[p] = absGroup('Revenues', p) - absGroup('COGS', p);
    const gpFy = absGroupFy('Revenues') - absGroupFy('COGS');
    const gpRow = ws2.addRow([
        'Gross Profit', '',
        ...periodKeys.map(p => gpCells[p]),
        gpFy,
    ]);
    gpRow.font = { bold: true };
    // Gross Margin % = Gross Profit / |Revenues| × 100  (placed below GP only)
    const gmCells = {};
    for (const p of periodKeys) {
        const rev = absGroup('Revenues', p);
        gmCells[p] = rev !== 0 ? (gpCells[p] / rev) * 100 : 0;
    }
    const gmFy = absGroupFy('Revenues') !== 0 ? (gpFy / absGroupFy('Revenues')) * 100 : 0;
    const gmRow = ws2.addRow([
        'Gross Margin %', '',
        ...periodKeys.map(p => Number(gmCells[p].toFixed(2))),
        Number(gmFy.toFixed(2)),
    ]);
    gmRow.font = { bold: true, italic: true, color: { argb: 'FF2E7D32' } };
    // 4) OPEX sections
    writeSection('R&D');
    writeSection('S&M');
    writeSection('G&A');
    // Total OPEX = |R&D| + |S&M| + |G&A|
    const opexCells = {};
    for (const p of periodKeys) {
        opexCells[p] = absGroup('R&D', p) + absGroup('S&M', p) + absGroup('G&A', p);
    }
    const opexFy = absGroupFy('R&D') + absGroupFy('S&M') + absGroupFy('G&A');
    const opexRow = ws2.addRow([
        'Total OPEX', '',
        ...periodKeys.map(p => opexCells[p]),
        opexFy,
    ]);
    opexRow.font = { bold: true };
    // Total OPEX % = Total OPEX / |Revenues| × 100
    const pctOf = (num, denom) => denom !== 0 ? (num / denom) * 100 : 0;
    const opexPctRow = ws2.addRow([
        'Total OPEX %', '',
        ...periodKeys.map(p => Number(pctOf(opexCells[p], absGroup('Revenues', p)).toFixed(2))),
        Number(pctOf(opexFy, absGroupFy('Revenues')).toFixed(2)),
    ]);
    opexPctRow.font = { bold: true, italic: true, color: { argb: 'FFC4863A' } };
    // Adjusted EBITDA = Gross Profit - Total OPEX
    const ebitdaCells = {};
    for (const p of periodKeys)
        ebitdaCells[p] = gpCells[p] - opexCells[p];
    const ebitdaFy = gpFy - opexFy;
    const ebitdaRow = ws2.addRow([
        'Adjusted EBITDA', '',
        ...periodKeys.map(p => ebitdaCells[p]),
        ebitdaFy,
    ]);
    ebitdaRow.font = { bold: true, color: { argb: 'FF1565C0' } };
    // Adjusted EBITDA % = EBITDA / |Revenues| × 100
    const ebitdaPctRow = ws2.addRow([
        'Adjusted EBITDA %', '',
        ...periodKeys.map(p => Number(pctOf(ebitdaCells[p], absGroup('Revenues', p)).toFixed(2))),
        Number(pctOf(ebitdaFy, absGroupFy('Revenues')).toFixed(2)),
    ]);
    ebitdaPctRow.font = { bold: true, italic: true, color: { argb: 'FF1565C0' } };
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
