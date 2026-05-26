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

import {
  budgetLineRepo,
  budgetCellRepo,
  glAccountRepo,
  BudgetRow,
  GLAccountRow,
  cfSalariesSectionRepo,
  periodKeysFor,
} from '../db/visibility.repository';

const SALARIES_CATEGORY = 'Salaries and benefits';

export interface SalariesGrid {
  granularity: BudgetRow['granularity'];
  periodKeys: string[];
  openingBalance: number;     // positive magnitude (credit)
  januaryPayment: number;     // positive magnitude (the only free input)
  summary: {
    ob:       Record<string, number>;  // positive magnitudes
    expenses: Record<string, number>;  // positive magnitudes (credit movement)
    payment:  Record<string, number>;  // positive magnitudes (debit movement)
    cb:       Record<string, number>;  // positive magnitudes
  };
}

function emptyPeriodMap(periodKeys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of periodKeys) out[p] = 0;
  return out;
}

function isSalariesCategory(gl: GLAccountRow): boolean {
  if (gl.budgetCategory === SALARIES_CATEGORY) return true;
  if (gl.budgetCategory === 'Your Budget Category' && gl.budgetCategoryCustom === SALARIES_CATEGORY) {
    return true;
  }
  return false;
}

export function computeSalariesGrid(
  budget: BudgetRow,
  cashFlowId: string,
  customerKeyId: string,
): SalariesGrid {
  const periodKeys = periodKeysFor(budget.granularity);

  // ── Expenses: sum of S&B budget cells per period ─────────
  const lines = budgetLineRepo.listByBudget(budget.id);
  const glRows = glAccountRepo.listByCustomer(customerKeyId);
  const glById = new Map<string, GLAccountRow>();
  for (const g of glRows) glById.set(g.id, g);

  const expenses = emptyPeriodMap(periodKeys);
  for (const l of lines) {
    if (!l.glAccountId) continue;
    const gl = glById.get(l.glAccountId);
    if (!gl || !isSalariesCategory(gl)) continue;
    const cells = budgetCellRepo.listByLine(l.id);
    for (const p of periodKeys) {
      expenses[p] += Number(cells[p]) || 0;
    }
  }

  // ── Persisted inputs ──────────────────────────────────────
  const { openingBalance, januaryPayment } = cfSalariesSectionRepo.get(cashFlowId);

  // ── Payment: Jan = user input, Feb… = previous Expenses ───
  const payment = emptyPeriodMap(periodKeys);
  for (let idx = 0; idx < periodKeys.length; idx++) {
    const p = periodKeys[idx];
    if (idx === 0) {
      payment[p] = januaryPayment;
    } else {
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
    granularity:    budget.granularity,
    periodKeys,
    openingBalance,
    januaryPayment,
    summary: { ob, expenses, payment, cb },
  };
}
