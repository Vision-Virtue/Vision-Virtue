"use strict";
/* ============================================================
   CF — Payables grid service (spec §3).

   Reads a finalized budget's lines + cells + GL mappings, filters
   per §3.2 (COGS+OPEX excluding "Salaries and benefits"), groups
   into the default-level (Company / P&L / Budget Category) grid,
   and joins each combo with its persisted CF row (payment term +
   prior-period carry inputs).

   Computes the Payment row per §3.7 and the Vendors summary per
   §3.8. All amounts are returned as positive magnitudes — sign
   convention (parens for credit, no parens for debit) is applied
   in the UI per §1.

   Monthly granularity is fully supported. Quarterly / yearly will
   land with §14 in a later phase.
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computePayablesGrid = computePayablesGrid;
const visibility_repository_1 = require("../db/visibility.repository");
const PL_INCLUDED = new Set(['COGS', 'R&D', 'S&M', 'G&A']);
const EXCLUDE_CATEGORY = 'Salaries and benefits';
const LAG_MONTHS = {
    'Cash': 0,
    'Current': 0,
    '30+': 1,
    '60+': 2,
    '90+': 3,
    '120+': 4,
    '180+': 5,
};
function emptyPeriodMap(periodKeys) {
    const out = {};
    for (const p of periodKeys)
        out[p] = 0;
    return out;
}
function emptyBoolMap(periodKeys) {
    const out = {};
    for (const p of periodKeys)
        out[p] = false;
    return out;
}
function categoryDisplayName(gl) {
    if (!gl.budgetCategory)
        return null;
    if (gl.budgetCategory === 'Your Budget Category') {
        return gl.budgetCategoryCustom || 'Your Budget Category';
    }
    return gl.budgetCategory;
}
/**
 * Compute the Payables grid for one CashFlow / Budget.
 * Side effect: inserts cf_payables_rows for any default-level
 * combo that doesn't yet have one (idempotent).
 */
function computePayablesGrid(budget, cashFlowId, customerKeyId) {
    const periodKeys = (0, visibility_repository_1.periodKeysFor)(budget.granularity);
    const monthlySupported = budget.granularity === 'monthly';
    // ── Load budget data + GL mappings ────────────────────────
    const lines = visibility_repository_1.budgetLineRepo.listByBudget(budget.id);
    const glRows = visibility_repository_1.glAccountRepo.listByCustomer(customerKeyId);
    const glById = new Map();
    for (const g of glRows)
        glById.set(g.id, g);
    const groups = new Map();
    for (const l of lines) {
        if (!l.glAccountId)
            continue;
        const gl = glById.get(l.glAccountId);
        if (!gl || !gl.plSection || !gl.budgetCategory)
            continue;
        if (!PL_INCLUDED.has(gl.plSection))
            continue;
        if (gl.budgetCategory === EXCLUDE_CATEGORY)
            continue;
        const catName = categoryDisplayName(gl);
        if (!catName)
            continue;
        const key = `${l.companyId ?? ''}|${gl.plSection}|${catName}`;
        let g = groups.get(key);
        if (!g) {
            g = {
                companyId: l.companyId,
                plSection: gl.plSection,
                budgetCategory: catName,
                expense: emptyPeriodMap(periodKeys),
            };
            groups.set(key, g);
        }
        const cells = visibility_repository_1.budgetCellRepo.listByLine(l.id);
        for (const p of periodKeys) {
            const v = Number(cells[p]) || 0;
            // Costs in the budget are stored positive (§1). Carry as-is.
            g.expense[p] += v;
        }
    }
    // ── Ensure cf_payables_rows for every combo + load configs ─
    const orderedKeys = [...groups.keys()].sort();
    const outRows = [];
    let i = 0;
    for (const key of orderedKeys) {
        const g = groups.get(key);
        const cfRow = visibility_repository_1.cfPayablesRowRepo.findOrCreateDefault(cashFlowId, g.companyId, g.plSection, g.budgetCategory, i++);
        const priorCarry = visibility_repository_1.cfPayablesPriorCarryRepo.listByRow(cfRow.id);
        const payment = emptyPeriodMap(periodKeys);
        const needsCarry = emptyBoolMap(periodKeys);
        const term = cfRow.paymentTerm;
        if (term && monthlySupported) {
            const lag = LAG_MONTHS[term];
            for (let idx = 0; idx < periodKeys.length; idx++) {
                const p = periodKeys[idx];
                const srcIdx = idx - lag;
                if (srcIdx >= 0) {
                    const srcKey = periodKeys[srcIdx];
                    payment[p] = -(g.expense[srcKey] || 0);
                }
                else if (lag > 0) {
                    needsCarry[p] = true;
                    // priorCarry is signed: a typical entry is negative
                    // (cash-out, credit movement on cash) and renders as
                    // ($X,XXX) in the grid. A positive value represents a
                    // rare cash-in (refund). We trust the user's sign.
                    payment[p] = priorCarry[p] || 0;
                }
            }
        }
        const fyExpense = periodKeys.reduce((s, p) => s + (g.expense[p] || 0), 0);
        const fyPayment = periodKeys.reduce((s, p) => s + (payment[p] || 0), 0);
        outRows.push({
            rowId: cfRow.id,
            companyId: g.companyId,
            plSection: g.plSection,
            budgetCategory: g.budgetCategory,
            paymentTerm: term,
            expense: g.expense,
            payment,
            paymentNeedsCarry: needsCarry,
            priorCarry,
            fyExpense,
            fyPayment,
        });
    }
    // ── Vendors summary (§3.8) ────────────────────────────────
    // openingBalance is signed: negative = credit balance (typical A/P),
    // positive = debit balance (rare; e.g. supplier prepayments). The
    // movement rows (expenses / payment) stay as positive magnitudes.
    // Roll-forward: a credit balance (negative O.B) grows MORE negative
    // with new expenses and LESS negative with payments. Same formula
    // works for a positive (debit) O.B in reverse, which is what we
    // want when prepayments are present.
    const section = visibility_repository_1.cfPayablesSectionRepo.get(cashFlowId);
    const openingBalance = section.openingBalance; // signed
    const ob = emptyPeriodMap(periodKeys);
    const expenses = emptyPeriodMap(periodKeys);
    const payment = emptyPeriodMap(periodKeys);
    const cb = emptyPeriodMap(periodKeys);
    for (const r of outRows) {
        for (const p of periodKeys) {
            expenses[p] += (r.expense[p] || 0); // positive magnitude
            payment[p] += Math.abs(r.payment[p] || 0); // positive magnitude
        }
    }
    let prevCb = openingBalance;
    for (const p of periodKeys) {
        ob[p] = prevCb;
        cb[p] = prevCb - expenses[p] + payment[p]; // signed roll-forward
        prevCb = cb[p];
    }
    return {
        granularity: budget.granularity,
        periodKeys,
        monthlySupported,
        openingBalance,
        rows: outRows,
        summary: { ob, expenses, payment, cb },
    };
}
