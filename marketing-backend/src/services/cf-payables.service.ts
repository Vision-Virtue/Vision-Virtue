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

import {
  budgetLineRepo,
  budgetCellRepo,
  glAccountRepo,
  BudgetRow,
  BudgetLineRow,
  GLAccountRow,
  CfPayablesRow,
  PaymentTerm,
  cfPayablesRowRepo,
  cfPayablesPriorCarryRepo,
  cfPayablesSectionRepo,
  periodKeysFor,
} from '../db/visibility.repository';

const PL_INCLUDED = new Set(['COGS', 'R&D', 'S&M', 'G&A']);
const EXCLUDE_CATEGORY = 'Salaries and benefits';

const LAG_MONTHS: Record<PaymentTerm, number> = {
  'Cash':    0,
  'Current': 0,
  '30+':     1,
  '60+':     2,
  '90+':     3,
  '120+':    4,
  '180+':    5,
};

export interface PayablesGridRow {
  rowId: string;
  companyId: string | null;
  plSection: string;
  budgetCategory: string;
  paymentTerm: PaymentTerm | null;
  expense: Record<string, number>;             // positive magnitudes
  payment: Record<string, number>;             // negative magnitudes (cash out)
  paymentNeedsCarry: Record<string, boolean>;  // true → cell renders as editable "Enter Free amount"
  priorCarry: Record<string, number>;          // user-input positive magnitudes
  fyExpense: number;
  fyPayment: number;
}

export interface PayablesGrid {
  granularity: BudgetRow['granularity'];
  periodKeys: string[];
  monthlySupported: boolean;
  openingBalance: number;                      // positive magnitude
  rows: PayablesGridRow[];
  summary: {
    ob:       Record<string, number>;          // positive magnitudes; UI shows as ($X,XXX)
    expenses: Record<string, number>;          // positive magnitudes; UI shows as ($X,XXX)
    payment:  Record<string, number>;          // positive magnitudes; UI shows as $X,XXX
    cb:       Record<string, number>;          // positive magnitudes; UI shows as ($X,XXX)
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

function categoryDisplayName(gl: GLAccountRow): string | null {
  if (!gl.budgetCategory) return null;
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
export function computePayablesGrid(
  budget: BudgetRow,
  cashFlowId: string,
  customerKeyId: string,
): PayablesGrid {
  const periodKeys = periodKeysFor(budget.granularity);
  const monthlySupported = budget.granularity === 'monthly';

  // ── Load budget data + GL mappings ────────────────────────
  const lines = budgetLineRepo.listByBudget(budget.id);
  const glRows = glAccountRepo.listByCustomer(customerKeyId);
  const glById = new Map<string, GLAccountRow>();
  for (const g of glRows) glById.set(g.id, g);

  // ── Group lines per §3.2 ──────────────────────────────────
  // Key: `${companyId ?? ''}|${plSection}|${budgetCategoryDisplay}`
  type Group = {
    companyId: string | null;
    plSection: string;
    budgetCategory: string;
    expense: Record<string, number>;
  };
  const groups = new Map<string, Group>();

  for (const l of lines) {
    if (!l.glAccountId) continue;
    const gl = glById.get(l.glAccountId);
    if (!gl || !gl.plSection || !gl.budgetCategory) continue;
    if (!PL_INCLUDED.has(gl.plSection)) continue;
    if (gl.budgetCategory === EXCLUDE_CATEGORY) continue;
    const catName = categoryDisplayName(gl);
    if (!catName) continue;

    const key = `${l.companyId ?? ''}|${gl.plSection}|${catName}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        companyId:      l.companyId,
        plSection:      gl.plSection,
        budgetCategory: catName,
        expense:        emptyPeriodMap(periodKeys),
      };
      groups.set(key, g);
    }
    const cells = budgetCellRepo.listByLine(l.id);
    for (const p of periodKeys) {
      const v = Number(cells[p]) || 0;
      // Costs in the budget are stored positive (§1). Carry as-is.
      g.expense[p] += v;
    }
  }

  // ── Ensure cf_payables_rows for every combo + load configs ─
  const orderedKeys = [...groups.keys()].sort();
  const outRows: PayablesGridRow[] = [];
  let i = 0;
  for (const key of orderedKeys) {
    const g = groups.get(key)!;
    const cfRow = cfPayablesRowRepo.findOrCreateDefault(
      cashFlowId,
      g.companyId,
      g.plSection,
      g.budgetCategory,
      i++,
    );
    const priorCarry = cfPayablesPriorCarryRepo.listByRow(cfRow.id);
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
          payment[p] = -(g.expense[srcKey] || 0);
        } else if (lag > 0) {
          needsCarry[p] = true;
          const carry = priorCarry[p] || 0;
          payment[p] = -carry;
        }
      }
    }

    const fyExpense = periodKeys.reduce((s, p) => s + (g.expense[p] || 0), 0);
    const fyPayment = periodKeys.reduce((s, p) => s + (payment[p] || 0), 0);

    outRows.push({
      rowId:             cfRow.id,
      companyId:         g.companyId,
      plSection:         g.plSection,
      budgetCategory:    g.budgetCategory,
      paymentTerm:       term,
      expense:           g.expense,
      payment,
      paymentNeedsCarry: needsCarry,
      priorCarry,
      fyExpense,
      fyPayment,
    });
  }

  // ── Vendors summary (§3.8) ────────────────────────────────
  const section        = cfPayablesSectionRepo.get(cashFlowId);
  const openingBalance = section.openingBalance;     // positive magnitude
  const ob       = emptyPeriodMap(periodKeys);
  const expenses = emptyPeriodMap(periodKeys);
  const payment  = emptyPeriodMap(periodKeys);
  const cb       = emptyPeriodMap(periodKeys);

  // Sum movements per period (positive magnitudes for both)
  for (const r of outRows) {
    for (const p of periodKeys) {
      expenses[p] += (r.expense[p] || 0);          // already positive
      payment[p]  += Math.abs(r.payment[p] || 0);  // cash-out magnitude
    }
  }
  // Roll the balance forward.
  let prevCb = openingBalance;
  for (const p of periodKeys) {
    ob[p] = prevCb;
    cb[p] = prevCb + expenses[p] - payment[p];
    prevCb = cb[p];
  }

  return {
    granularity:      budget.granularity,
    periodKeys,
    monthlySupported,
    openingBalance,
    rows: outRows,
    summary: { ob, expenses, payment, cb },
  };
}
