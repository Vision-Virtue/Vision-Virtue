"use strict";
/* ============================================================
   CF — Salaries & Benefits grid service (spec §6).

   Single summary table. No per-vendor allocation.

   Rules:
   - O.B is positive in storage (credit balance / liability);
     the UI renders it as ($X,XXX).
   - Expenses per period = SUM of budget cells for every line
     whose GL's Budget Category is "Salaries and benefits"
     (across COGS / R&D / S&M / G&A). Free-text override
     "Your Budget Category" with custom name "Salaries and
     benefits" counts too. Stored positive.
   - Payment for the first period = user-entered (positive).
     Subsequent periods = previous period's Expenses (fixed
     30+ arrears — no per-row term). All payments rendered
     negative in the UI to match the credit→debit convention.
   - C.B[p] = O.B[p] + Expenses[p] − Payment[p]
     (liability roll-forward as a positive magnitude; credit-
     movement convention applied at render time).

   Quarterly/yearly support is symmetric to Inventory (§5):
   the same shape works, the granularity controls the period
   key set; "previous period" still means the period before.
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSalariesGrid = computeSalariesGrid;
const visibility_repository_1 = require("../db/visibility.repository");
const SALARIES_CATEGORY = 'Salaries and benefits';
function emptyPeriodMap(periodKeys) {
    const out = {};
    for (const p of periodKeys)
        out[p] = 0;
    return out;
}
function isSalariesCategory(gl) {
    if (gl.budgetCategory === SALARIES_CATEGORY)
        return true;
    if (gl.budgetCategory === 'Your Budget Category' && gl.budgetCategoryCustom === SALARIES_CATEGORY) {
        return true;
    }
    return false;
}
function computeSalariesGrid(budget, cashFlowId, customerKeyId) {
    const periodKeys = (0, visibility_repository_1.periodKeysFor)(budget.granularity);
    // ── Expenses: sum of S&B budget cells per period ─────────
    const lines = visibility_repository_1.budgetLineRepo.listByBudget(budget.id);
    const glRows = visibility_repository_1.glAccountRepo.listByCustomer(customerKeyId);
    const glById = new Map();
    for (const g of glRows)
        glById.set(g.id, g);
    const expenses = emptyPeriodMap(periodKeys);
    for (const l of lines) {
        if (!l.glAccountId)
            continue;
        const gl = glById.get(l.glAccountId);
        if (!gl || !isSalariesCategory(gl))
            continue;
        const cells = visibility_repository_1.budgetCellRepo.listByLine(l.id);
        for (const p of periodKeys) {
            expenses[p] += Number(cells[p]) || 0;
        }
    }
    // ── Persisted inputs ──────────────────────────────────────
    const { openingBalance, januaryPayment } = visibility_repository_1.cfSalariesSectionRepo.get(cashFlowId);
    // ── Payment: Jan = user input, Feb… = previous Expenses ───
    const payment = emptyPeriodMap(periodKeys);
    for (let idx = 0; idx < periodKeys.length; idx++) {
        const p = periodKeys[idx];
        if (idx === 0) {
            payment[p] = januaryPayment;
        }
        else {
            payment[p] = expenses[periodKeys[idx - 1]] || 0;
        }
    }
    // ── Roll-forward: ob + expenses − payment ─────────────────
    const ob = emptyPeriodMap(periodKeys);
    const cb = emptyPeriodMap(periodKeys);
    let prevCb = openingBalance;
    for (const p of periodKeys) {
        ob[p] = prevCb;
        cb[p] = prevCb + (expenses[p] || 0) - (payment[p] || 0);
        prevCb = cb[p];
    }
    return {
        granularity: budget.granularity,
        periodKeys,
        openingBalance,
        januaryPayment,
        summary: { ob, expenses, payment, cb },
    };
}
