"use strict";
/* ============================================================
   CF — Manual sections service (spec §7 Other Adjustments,
   §8 Financing, §9 Capex).

   All three sections share the same data shape: free-form
   description + per-period signed amounts. FY column = sum
   of the period amounts. A footer "Total" row sums across
   all rows per period and FY.
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeManualGrid = computeManualGrid;
const visibility_repository_1 = require("../db/visibility.repository");
function computeManualGrid(budget, cashFlowId, kind) {
    const periodKeys = (0, visibility_repository_1.periodKeysFor)(budget.granularity);
    const rows = visibility_repository_1.cfManualRowRepo.listByCfAndKind(cashFlowId, kind);
    const enriched = rows.map(r => {
        let fy = 0;
        for (const p of periodKeys)
            fy += Number(r.amounts[p]) || 0;
        return {
            id: r.id,
            description: r.description,
            orderIndex: r.orderIndex,
            amounts: r.amounts,
            fy,
        };
    });
    const totals = {};
    for (const p of periodKeys)
        totals[p] = 0;
    let totalFy = 0;
    for (const r of enriched) {
        for (const p of periodKeys)
            totals[p] += Number(r.amounts[p]) || 0;
        totalFy += r.fy;
    }
    return {
        kind,
        granularity: budget.granularity,
        periodKeys,
        rows: enriched,
        totals,
        totalFy,
    };
}
