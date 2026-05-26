"use strict";
/* ============================================================
   CF — Forecast service (spec §11 + §12).

   Pulls the entire CF together from:
   - Opening Cash      (cash_flows.opening_cash)
   - Adjusted EBITDA   (sum of budget cells across Revenues, COGS,
                       R&D, S&M, G&A — including S&B rows)
   - WC components    (Payables / Receivables / Inventory grids)
   - Salaries         (Salaries grid CB roll)
   - Other Adj /      (manual_rows by kind, footer Totals)
     Financing /
     Capex

   Sign conventions:
   - Budget cells: revenues stored negative, costs stored positive
     (see visibility.js sumSection — "Revenues entered negative").
     SUM(EBITDA cells) = burn (positive = burning, negative = profit).
     Cash-impact form negates this: ebitdaCash = -SUM(cells).
   - WC component CBs: each section uses its own sign convention.
       Payables    — signed (negative = credit liability). CB grows more
                     negative as A/P grows.
       Receivables — signed (positive = debit asset). CB grows more
                     positive as A/R grows.
       Inventory   — signed (positive = debit asset). CB grows more
                     positive as inventory builds.
       Salaries    — positive magnitude (liability stored as +X). CB
                     grows more positive as accrual grows.
     Cash-impact formula uses sign = −1 for the three signed sections
     (matches spec §12: "−(CB[m] − CB[m−1])") and sign = +1 for
     Salaries (the magnitude-stored section): a growing positive CB
     means an unpaid accrual, which is a positive cash impact.
     For Jan, m−1 CB = OB of that section (per §3.8/§4.6/§5.3/§6.1).
   - Manual rows are stored with user-chosen sign (already cash-impact
     form): inflows positive, outflows negative.

   C.B[p] = O.B[p] + EBITDA[p] + WC[p] + Salaries[p]
            + OtherAdj[p] + Financing[p] + Capex[p]
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeForecast = computeForecast;
const visibility_repository_1 = require("../db/visibility.repository");
const cf_payables_service_1 = require("./cf-payables.service");
const cf_receivables_service_1 = require("./cf-receivables.service");
const cf_inventory_service_1 = require("./cf-inventory.service");
const cf_salaries_service_1 = require("./cf-salaries.service");
const EBITDA_SECTIONS = new Set(['Revenues', 'COGS', 'R&D', 'S&M', 'G&A']);
function emptyMap(periodKeys) {
    const out = {};
    for (const p of periodKeys)
        out[p] = 0;
    return out;
}
/** Cash impact from a section's CB roll-forward.
 *  sign = +1 for liabilities (Payables, Salaries), −1 for assets
 *  (Receivables, Inventory). Jan uses the section O.B as the m−1 CB. */
function cashImpactFromRoll(cb, ob, periodKeys, sign) {
    const out = emptyMap(periodKeys);
    let prev = ob;
    for (const p of periodKeys) {
        const cur = Number(cb[p]) || 0;
        out[p] = sign * (cur - prev);
        prev = cur;
    }
    return out;
}
function sumManual(cfId, kind, periodKeys) {
    const out = emptyMap(periodKeys);
    const rows = visibility_repository_1.cfManualRowRepo.listByCfAndKind(cfId, kind);
    for (const r of rows) {
        for (const p of periodKeys) {
            out[p] += Number(r.amounts[p]) || 0;
        }
    }
    return out;
}
function computeForecast(budget, cashFlowId, customerKeyId) {
    const periodKeys = (0, visibility_repository_1.periodKeysFor)(budget.granularity);
    const cf = visibility_repository_1.cashFlowRepo.getByBudget(budget.id);
    const openingCash = cf?.openingCash ?? 0;
    // ── Adjusted EBITDA (cash-impact form) ─────────────────────
    const lines = visibility_repository_1.budgetLineRepo.listByBudget(budget.id);
    const glRows = visibility_repository_1.glAccountRepo.listByCustomer(customerKeyId);
    const glById = new Map();
    for (const g of glRows)
        glById.set(g.id, g);
    const ebitdaRaw = emptyMap(periodKeys); // sum of cells (rev-neg + cost-pos = burn form)
    for (const l of lines) {
        if (!l.glAccountId)
            continue;
        const gl = glById.get(l.glAccountId);
        if (!gl || !EBITDA_SECTIONS.has(gl.plSection))
            continue;
        const cells = visibility_repository_1.budgetCellRepo.listByLine(l.id);
        for (const p of periodKeys) {
            ebitdaRaw[p] += Number(cells[p]) || 0;
        }
    }
    // Negate to get cash impact: positive = profit (cash inflow).
    const ebitda = emptyMap(periodKeys);
    for (const p of periodKeys)
        ebitda[p] = -ebitdaRaw[p];
    // ── WC components ──────────────────────────────────────────
    const payablesGrid = (0, cf_payables_service_1.computePayablesGrid)(budget, cashFlowId, customerKeyId);
    const receivablesGrid = (0, cf_receivables_service_1.computeReceivablesGrid)(budget, cashFlowId, customerKeyId);
    const inventoryGrid = (0, cf_inventory_service_1.computeInventoryGrid)(budget, cashFlowId, customerKeyId);
    const salariesGrid = (0, cf_salaries_service_1.computeSalariesGrid)(budget, cashFlowId, customerKeyId);
    const payablesMov = cashImpactFromRoll(payablesGrid.summary.cb, payablesGrid.openingBalance, periodKeys, -1);
    const receivablesMov = cashImpactFromRoll(receivablesGrid.summary.cb, receivablesGrid.openingBalance, periodKeys, -1);
    const inventoryMov = cashImpactFromRoll(inventoryGrid.summary.cb, inventoryGrid.openingBalance, periodKeys, -1);
    const salariesMov = cashImpactFromRoll(salariesGrid.summary.cb, salariesGrid.openingBalance, periodKeys, +1);
    const wc = emptyMap(periodKeys);
    for (const p of periodKeys)
        wc[p] = payablesMov[p] + receivablesMov[p] + inventoryMov[p];
    // ── Manual sections ────────────────────────────────────────
    const otherAdj = sumManual(cashFlowId, 'other_adj', periodKeys);
    const financing = sumManual(cashFlowId, 'financing', periodKeys);
    const capex = sumManual(cashFlowId, 'capex', periodKeys);
    // ── O.B chain and C.B ──────────────────────────────────────
    const ob = emptyMap(periodKeys);
    const cb = emptyMap(periodKeys);
    let prev = openingCash;
    for (const p of periodKeys) {
        ob[p] = prev;
        cb[p] = prev
            + ebitda[p]
            + wc[p]
            + salariesMov[p]
            + otherAdj[p]
            + financing[p]
            + capex[p];
        prev = cb[p];
    }
    return {
        granularity: budget.granularity,
        periodKeys,
        rows: {
            ob,
            ebitda,
            wc,
            salaries: salariesMov,
            otherAdj,
            financing,
            capex,
            cb,
        },
        wcBreakdown: {
            payables: payablesMov,
            receivables: receivablesMov,
            inventory: inventoryMov,
            total: wc,
        },
    };
}
