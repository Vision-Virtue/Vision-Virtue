/* ============================================================
   CF — Inventory grid service (spec §5).

   No per-row allocation grid: just a single summary table.
   - O.B is signed (positive = debit balance, typical asset).
   - Purchases come from user input per period (positive
     magnitudes). They also feed the "Finished goods" Expense row
     in Payables (§3.5) — that wire-up will land when we also
     surface the Finished-goods exception in the Payables grid.
   - COGS is auto-pulled from the budget: lines whose GL has
     `P&L Section = COGS` and `Budget Category = Finished goods`
     (literal value or "Your Budget Category" with that custom
     name). Stored positive in the budget; rendered as a credit
     movement (parens) in the summary.
   - C.B = O.B + Purchases - COGS  (asset roll-forward).

   Spec §5.3 warning: if C.B would go below 0 in any month, the
   FE shows a non-blocking banner. Detection is done here.
   ============================================================ */

import {
  budgetLineRepo,
  budgetCellRepo,
  glAccountRepo,
  BudgetRow,
  GLAccountRow,
  cfInventorySectionRepo,
  cfInventoryPurchasesRepo,
  periodKeysFor,
} from '../db/visibility.repository';

const FINISHED_GOODS = 'Finished goods';

export interface InventoryGrid {
  granularity: BudgetRow['granularity'];
  periodKeys: string[];
  openingBalance: number;                        // signed
  purchases: Record<string, number>;             // positive magnitudes
  summary: {
    ob:        Record<string, number>;           // signed
    purchases: Record<string, number>;           // positive magnitudes (mirrors purchases)
    cogs:      Record<string, number>;           // positive magnitudes (credit movement)
    cb:        Record<string, number>;           // signed
  };
  /** Period keys where C.B is negative (non-blocking warning per §5.3). */
  negativeMonths: string[];
}

function emptyPeriodMap(periodKeys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of periodKeys) out[p] = 0;
  return out;
}

function isFinishedGoods(gl: GLAccountRow): boolean {
  if (gl.budgetCategory === FINISHED_GOODS) return true;
  if (gl.budgetCategory === 'Your Budget Category' && gl.budgetCategoryCustom === FINISHED_GOODS) {
    return true;
  }
  return false;
}

export function computeInventoryGrid(
  budget: BudgetRow,
  cashFlowId: string,
  customerKeyId: string,
): InventoryGrid {
  const periodKeys = periodKeysFor(budget.granularity);

  // ── Pull COGS Finished goods from the budget ──────────────
  const lines = budgetLineRepo.listByBudget(budget.id);
  const glRows = glAccountRepo.listByCustomer(customerKeyId);
  const glById = new Map<string, GLAccountRow>();
  for (const g of glRows) glById.set(g.id, g);

  const cogs = emptyPeriodMap(periodKeys);
  for (const l of lines) {
    if (!l.glAccountId) continue;
    const gl = glById.get(l.glAccountId);
    if (!gl || gl.plSection !== 'COGS' || !isFinishedGoods(gl)) continue;
    const cells = budgetCellRepo.listByLine(l.id);
    for (const p of periodKeys) {
      // Budget stores costs as positive; carry as-is (magnitude).
      cogs[p] += Number(cells[p]) || 0;
    }
  }

  // ── Load section state + per-period purchases ─────────────
  const { openingBalance } = cfInventorySectionRepo.get(cashFlowId);
  const purchasesRaw = cfInventoryPurchasesRepo.listByCf(cashFlowId);
  const purchases = emptyPeriodMap(periodKeys);
  for (const p of periodKeys) purchases[p] = purchasesRaw[p] || 0;

  // ── Summary roll-forward ──────────────────────────────────
  const ob = emptyPeriodMap(periodKeys);
  const cb = emptyPeriodMap(periodKeys);
  let prevCb = openingBalance;
  const negativeMonths: string[] = [];
  for (const p of periodKeys) {
    ob[p] = prevCb;
    cb[p] = prevCb + purchases[p] - cogs[p];     // asset: + purchases, - cogs
    if (cb[p] < 0) negativeMonths.push(p);
    prevCb = cb[p];
  }

  return {
    granularity:   budget.granularity,
    periodKeys,
    openingBalance,
    purchases,
    summary: { ob, purchases, cogs, cb },
    negativeMonths,
  };
}
