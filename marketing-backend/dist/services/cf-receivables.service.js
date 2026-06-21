"use strict";
/* ============================================================
   CF — Receivables grid service (spec §4).

   Reads a finalized budget's lines + cells + GL mappings, filters
   to P&L Section = 'Revenues' (§4.2), groups into the default-
   level grid (Company only — Section is always Revenues), and
   joins each combo with its persisted CF row (payment term +
   prior-period carry inputs).

   Computes the Payment row per §4.5 (mirror of §3.7 with sign
   flipped for cash-in) and the Customers summary per §4.6.

   Sign convention:
   - Revenues in the budget are stored negative (§1). The grid
     Revenue row preserves that sign. The Customers summary
     "Revenues" row uses the absolute magnitude (debit movement
     on the A/R asset).
   - Payment row is positive (cash in); the Customers summary
     "Payment" row also uses magnitude.
   - O.B / C.B are signed: positive = debit balance (typical
     A/R), negative = credit balance (rare; e.g. customer
     overpayments).
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeReceivablesGrid = computeReceivablesGrid;
const visibility_repository_1 = require("../db/visibility.repository");
/** Spec §14 — see cf-payables.service for the rationale. */
const LAG_DAYS = {
    'Cash': 0,
    'Current': 0,
    '30+': 30,
    '60+': 60,
    '90+': 90,
    '120+': 120,
    '180+': 180,
};
const DAYS_PER_PERIOD = {
    monthly: 30,
    quarterly: 90,
    yearly: 360,
};
function lagPeriods(granularity, term) {
    return Math.round(LAG_DAYS[term] / DAYS_PER_PERIOD[granularity]);
}
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
function computeReceivablesGrid(budget, cashFlowId, customerKeyId) {
    const periodKeys = (0, visibility_repository_1.periodKeysFor)(budget.granularity);
    // Spec §14 — all granularities now compute payment lag (in days).
    const monthlySupported = true;
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
        if (!gl || gl.plSection !== 'Revenues')
            continue;
        if (!gl.budgetCategory)
            continue;
        const catName = gl.budgetCategory === 'Your Budget Category'
            ? (gl.budgetCategoryCustom || 'Your Budget Category')
            : gl.budgetCategory;
        const key = `${l.companyId ?? ''}|${catName}`;
        let g = groups.get(key);
        if (!g) {
            g = {
                companyId: l.companyId,
                budgetCategory: catName,
                revenue: emptyPeriodMap(periodKeys),
            };
            groups.set(key, g);
        }
        const cells = visibility_repository_1.budgetCellRepo.listByLine(l.id);
        for (const p of periodKeys) {
            g.revenue[p] += Number(cells[p]) || 0; // preserves negative budget sign
        }
    }
    // ── Ensure cf_receivables_rows for every combo + load configs ─
    const orderedKeys = [...groups.keys()].sort();
    const outRows = [];
    let i = 0;
    for (const key of orderedKeys) {
        const g = groups.get(key);
        const cfRow = visibility_repository_1.cfReceivablesRowRepo.findOrCreateDefault(cashFlowId, g.companyId, g.budgetCategory, i++);
        const priorCarry = visibility_repository_1.cfReceivablesPriorCarryRepo.listByRow(cfRow.id);
        const payment = emptyPeriodMap(periodKeys);
        const needsCarry = emptyBoolMap(periodKeys);
        const term = cfRow.paymentTerm;
        if (term) {
            const lag = lagPeriods(budget.granularity, term);
            for (let idx = 0; idx < periodKeys.length; idx++) {
                const p = periodKeys[idx];
                const srcIdx = idx - lag;
                if (srcIdx >= 0) {
                    const srcKey = periodKeys[srcIdx];
                    // Revenue is negative; -Revenue yields the positive
                    // cash-in for the Payment row (§4.5).
                    payment[p] = -(g.revenue[srcKey] || 0);
                }
                else if (lag > 0) {
                    needsCarry[p] = true;
                    // priorCarry is signed: typical entry is positive
                    // (cash-in from prior-year invoices). Trust user sign.
                    payment[p] = priorCarry[p] || 0;
                }
            }
        }
        const fyRevenue = periodKeys.reduce((s, p) => s + (g.revenue[p] || 0), 0);
        const fyPayment = periodKeys.reduce((s, p) => s + (payment[p] || 0), 0);
        outRows.push({
            rowId: cfRow.id,
            companyId: g.companyId,
            plSection: 'Revenues',
            budgetCategory: g.budgetCategory,
            paymentTerm: term,
            revenue: g.revenue,
            payment,
            paymentNeedsCarry: needsCarry,
            priorCarry,
            fyRevenue,
            fyPayment,
        });
    }
    // ── Customers summary (§4.6) ──────────────────────────────
    const section = visibility_repository_1.cfReceivablesSectionRepo.get(cashFlowId);
    const openingBalance = section.openingBalance; // signed
    const ob = emptyPeriodMap(periodKeys);
    const revenues = emptyPeriodMap(periodKeys);
    const payment = emptyPeriodMap(periodKeys);
    const cb = emptyPeriodMap(periodKeys);
    for (const r of outRows) {
        for (const p of periodKeys) {
            revenues[p] += Math.abs(r.revenue[p] || 0); // positive magnitude
            payment[p] += Math.abs(r.payment[p] || 0); // positive magnitude
        }
    }
    // Asset roll-forward: revenues ADD to A/R, payments REDUCE A/R.
    let prevCb = openingBalance;
    for (const p of periodKeys) {
        ob[p] = prevCb;
        cb[p] = prevCb + revenues[p] - payment[p];
        prevCb = cb[p];
    }
    // ── Orphan detection (§16) ────────────────────────────────
    const liveKeys = new Set(orderedKeys);
    const allStoredRows = visibility_repository_1.cfReceivablesRowRepo.listByCf(cashFlowId);
    const orphans = [];
    for (const r of allStoredRows) {
        if (!r.plSection || !r.budgetCategory)
            continue;
        const key = `${r.companyId ?? ''}|${r.budgetCategory}`; // must match liveKeys (2-part: no plSection — always 'Revenues')
        if (!liveKeys.has(key)) {
            orphans.push({
                rowId: r.id,
                companyId: r.companyId,
                plSection: r.plSection,
                budgetCategory: r.budgetCategory,
            });
        }
    }
    return {
        granularity: budget.granularity,
        periodKeys,
        monthlySupported,
        openingBalance,
        rows: outRows,
        orphans,
        summary: { ob, revenues, payment, cb },
    };
}
