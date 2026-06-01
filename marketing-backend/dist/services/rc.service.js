"use strict";
/* ============================================================
   Revenues & COGS service (Phase 3c).
   Pivots rc_rows into Budget Structure lines.
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pivotRcRows = pivotRcRows;
const MONTHS = ['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];
function emptyPeriodCells(granularity) {
    if (granularity === 'monthly') return Object.fromEntries(MONTHS.map(m => [m, 0]));
    if (granularity === 'quarterly') return { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    return { FY: 0 };
}
function addAmountsFromQty(cells, qty, unitPrice, granularity) {
    if (granularity === 'monthly') {
        for (const m of MONTHS) {
            cells[m] = (cells[m] || 0) + (Number(qty[m]) || 0) * unitPrice;
        }
    } else if (granularity === 'quarterly') {
        cells['Q1'] += ((Number(qty['M01'])||0) + (Number(qty['M02'])||0) + (Number(qty['M03'])||0)) * unitPrice;
        cells['Q2'] += ((Number(qty['M04'])||0) + (Number(qty['M05'])||0) + (Number(qty['M06'])||0)) * unitPrice;
        cells['Q3'] += ((Number(qty['M07'])||0) + (Number(qty['M08'])||0) + (Number(qty['M09'])||0)) * unitPrice;
        cells['Q4'] += ((Number(qty['M10'])||0) + (Number(qty['M11'])||0) + (Number(qty['M12'])||0)) * unitPrice;
    } else {
        const totalQty = MONTHS.reduce((s, m) => s + (Number(qty[m]) || 0), 0);
        cells['FY'] = (cells['FY'] || 0) + totalQty * unitPrice;
    }
}
function pivotRcRows(rows, granularity) {
    const revMap  = new Map();
    const cogsMap = new Map();
    for (const row of rows) {
        const qty = row.cells || {};
        if (row.revGlId) {
            const key = [row.companyId ?? '', row.divisionId ?? '', row.departmentId ?? '',
                         row.productId ?? '', row.activityId ?? '', row.revGlId].join('|');
            if (!revMap.has(key)) {
                revMap.set(key, {
                    companyId: row.companyId, divisionId: row.divisionId, departmentId: row.departmentId,
                    productId: row.productId, activityId: row.activityId, glAccountId: row.revGlId,
                    cells: emptyPeriodCells(granularity),
                });
            }
            // Revenues are credit movements in accounting → stored as negative amounts
        addAmountsFromQty(revMap.get(key).cells, qty, -row.price, granularity);
        }
        if (row.cogsGlId) {
            const key = [row.companyId ?? '', row.divisionId ?? '', row.departmentId ?? '',
                         row.productId ?? '', row.activityId ?? '', row.cogsGlId].join('|');
            if (!cogsMap.has(key)) {
                cogsMap.set(key, {
                    companyId: row.companyId, divisionId: row.divisionId, departmentId: row.departmentId,
                    productId: row.productId, activityId: row.activityId, glAccountId: row.cogsGlId,
                    cells: emptyPeriodCells(granularity),
                });
            }
            addAmountsFromQty(cogsMap.get(key).cells, qty, row.cost, granularity);
        }
    }
    return [...revMap.values(), ...cogsMap.values()];
}
