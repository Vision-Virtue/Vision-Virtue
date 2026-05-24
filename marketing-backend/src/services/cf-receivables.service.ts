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

import {
  budgetLineRepo,
  budgetCellRepo,
  glAccountRepo,
  BudgetRow,
  GLAccountRow,
  PaymentTerm,
  cfReceivablesRowRepo,
  cfReceivablesPriorCarryRepo,
  cfReceivablesSectionRepo,
  periodKeysFor,
} from '../db/visibility.repository';

const LAG_MONTHS: Record<PaymentTerm, number> = {
  'Cash':    0,
  'Current': 0,
  '30+':     1,
  '60+':     2,
  '90+':     3,
  '120+':    4,
  '180+':    5,
};

export interface ReceivablesGridRow {
  rowId: string;
  companyId: string | null;
  plSection: string;
  paymentTerm: PaymentTerm | null;
  revenue: Record<string, number>;             // signed (budget sign; typically negative)
  payment: Record<string, number>;             // signed (typically positive cash-in)
  paymentNeedsCarry: Record<string, boolean>;
  priorCarry: Record<string, number>;          // signed; trust user
  fyRevenue: number;
  fyPayment: number;
}

export interface ReceivablesGrid {
  granularity: BudgetRow['granularity'];
  periodKeys: string[];
  monthlySupported: boolean;
  openingBalance: number;                      // signed
  rows: ReceivablesGridRow[];
  summary: {
    ob:       Record<string, number>;          // signed
    revenues: Record<string, number>;          // positive magnitudes
    payment:  Record<string, number>;          // positive magnitudes
    cb:       Record<string, number>;          // signed
  };
}

function emptyPeriodMap(periodKeys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of periodKeys) out[p] = 0;
  return out;
}

function emptyBoolMap(periodKeys: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of periodKeys) out[p] = false;
  return out;
}

export function computeReceivablesGrid(
  budget: BudgetRow,
  cashFlowId: string,
  customerKeyId: string,
): ReceivablesGrid {
  const periodKeys = periodKeysFor(budget.granularity);
  const monthlySupported = budget.granularity === 'monthly';

  // ── Load budget data + GL mappings ────────────────────────
  const lines = budgetLineRepo.listByBudget(budget.id);
  const glRows = glAccountRepo.listByCustomer(customerKeyId);
  const glById = new Map<string, GLAccountRow>();
  for (const g of glRows) glById.set(g.id, g);

  // ── Group lines per §4.2 ──────────────────────────────────
  // Default-level grid groups by Company only.
  type Group = {
    companyId: string | null;
    revenue: Record<string, number>;
  };
  const groups = new Map<string, Group>();

  for (const l of lines) {
    if (!l.glAccountId) continue;
    const gl = glById.get(l.glAccountId);
    if (!gl || gl.plSection !== 'Revenues') continue;

    const key = `${l.companyId ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { companyId: l.companyId, revenue: emptyPeriodMap(periodKeys) };
      groups.set(key, g);
    }
    const cells = budgetCellRepo.listByLine(l.id);
    for (const p of periodKeys) {
      g.revenue[p] += Number(cells[p]) || 0;       // preserves negative budget sign
    }
  }

  // ── Ensure cf_receivables_rows for every combo + load configs ─
  const orderedKeys = [...groups.keys()].sort();
  const outRows: ReceivablesGridRow[] = [];
  let i = 0;
  for (const key of orderedKeys) {
    const g = groups.get(key)!;
    const cfRow = cfReceivablesRowRepo.findOrCreateDefault(cashFlowId, g.companyId, i++);
    const priorCarry = cfReceivablesPriorCarryRepo.listByRow(cfRow.id);
    const payment    = emptyPeriodMap(periodKeys);
    const needsCarry = emptyBoolMap(periodKeys);
    const term       = cfRow.paymentTerm;

    if (term && monthlySupported) {
      const lag = LAG_MONTHS[term];
      for (let idx = 0; idx < periodKeys.length; idx++) {
        const p = periodKeys[idx];
        const srcIdx = idx - lag;
        if (srcIdx >= 0) {
          const srcKey = periodKeys[srcIdx];
          // Revenue is negative; -Revenue yields the positive
          // cash-in for the Payment row (§4.5).
          payment[p] = -(g.revenue[srcKey] || 0);
        } else if (lag > 0) {
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
      rowId:             cfRow.id,
      companyId:         g.companyId,
      plSection:         'Revenues',
      paymentTerm:       term,
      revenue:           g.revenue,
      payment,
      paymentNeedsCarry: needsCarry,
      priorCarry,
      fyRevenue,
      fyPayment,
    });
  }

  // ── Customers summary (§4.6) ──────────────────────────────
  const section        = cfReceivablesSectionRepo.get(cashFlowId);
  const openingBalance = section.openingBalance;     // signed
  const ob       = emptyPeriodMap(periodKeys);
  const revenues = emptyPeriodMap(periodKeys);
  const payment  = emptyPeriodMap(periodKeys);
  const cb       = emptyPeriodMap(periodKeys);

  for (const r of outRows) {
    for (const p of periodKeys) {
      revenues[p] += Math.abs(r.revenue[p] || 0);    // positive magnitude
      payment[p]  += Math.abs(r.payment[p] || 0);    // positive magnitude
    }
  }
  // Asset roll-forward: revenues ADD to A/R, payments REDUCE A/R.
  let prevCb = openingBalance;
  for (const p of periodKeys) {
    ob[p] = prevCb;
    cb[p] = prevCb + revenues[p] - payment[p];
    prevCb = cb[p];
  }

  return {
    granularity:      budget.granularity,
    periodKeys,
    monthlySupported,
    openingBalance,
    rows: outRows,
    summary: { ob, revenues, payment, cb },
  };
}
