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

import {
  BudgetRow,
  budgetCellRepo,
  budgetLineRepo,
  cashFlowRepo,
  cfManualRowRepo,
  glAccountRepo,
  GLAccountRow,
  periodKeysFor,
  CfManualKind,
} from '../db/visibility.repository';
import { computePayablesGrid }    from './cf-payables.service';
import { computeReceivablesGrid } from './cf-receivables.service';
import { computeInventoryGrid }   from './cf-inventory.service';
import { computeSalariesGrid }    from './cf-salaries.service';

const EBITDA_SECTIONS = new Set(['Revenues', 'COGS', 'R&D', 'S&M', 'G&A']);

export interface ForecastGrid {
  granularity: BudgetRow['granularity'];
  periodKeys:  string[];
  rows: {
    ob:        Record<string, number>;
    ebitda:    Record<string, number>;
    wc:        Record<string, number>;
    salaries:  Record<string, number>;
    otherAdj:  Record<string, number>;
    financing: Record<string, number>;
    capex:     Record<string, number>;
    cb:        Record<string, number>;
  };
  wcBreakdown: {
    payables:    Record<string, number>;
    receivables: Record<string, number>;
    inventory:   Record<string, number>;
    total:       Record<string, number>;
  };
}

function emptyMap(periodKeys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of periodKeys) out[p] = 0;
  return out;
}

/** Cash impact from a section's CB roll-forward.
 *  sign = +1 for liabilities (Payables, Salaries), −1 for assets
 *  (Receivables, Inventory). Jan uses the section O.B as the m−1 CB. */
function cashImpactFromRoll(
  cb: Record<string, number>,
  ob: number,
  periodKeys: string[],
  sign: 1 | -1,
): Record<string, number> {
  const out = emptyMap(periodKeys);
  let prev = ob;
  for (const p of periodKeys) {
    const cur = Number(cb[p]) || 0;
    out[p] = sign * (cur - prev);
    prev = cur;
  }
  return out;
}

function sumManual(
  cfId: string,
  kind: CfManualKind,
  periodKeys: string[],
): Record<string, number> {
  const out = emptyMap(periodKeys);
  const rows = cfManualRowRepo.listByCfAndKind(cfId, kind);
  for (const r of rows) {
    for (const p of periodKeys) {
      out[p] += Number(r.amounts[p]) || 0;
    }
  }
  return out;
}

export function computeForecast(
  budget: BudgetRow,
  cashFlowId: string,
  customerKeyId: string,
): ForecastGrid {
  const periodKeys = periodKeysFor(budget.granularity);
  const cf = cashFlowRepo.getByBudget(budget.id);
  const openingCash = cf?.openingCash ?? 0;

  // ── Adjusted EBITDA (cash-impact form) ─────────────────────
  const lines  = budgetLineRepo.listByBudget(budget.id);
  const glRows = glAccountRepo.listByCustomer(customerKeyId);
  const glById = new Map<string, GLAccountRow>();
  for (const g of glRows) glById.set(g.id, g);

  const ebitdaRaw = emptyMap(periodKeys);  // sum of cells (rev-neg + cost-pos = burn form)
  for (const l of lines) {
    if (!l.glAccountId) continue;
    const gl = glById.get(l.glAccountId);
    if (!gl || !EBITDA_SECTIONS.has(gl.plSection)) continue;
    const cells = budgetCellRepo.listByLine(l.id);
    for (const p of periodKeys) {
      ebitdaRaw[p] += Number(cells[p]) || 0;
    }
  }
  // Negate to get cash impact: positive = profit (cash inflow).
  const ebitda = emptyMap(periodKeys);
  for (const p of periodKeys) ebitda[p] = -ebitdaRaw[p];

  // ── WC components ──────────────────────────────────────────
  const payablesGrid    = computePayablesGrid(budget,    cashFlowId, customerKeyId);
  const receivablesGrid = computeReceivablesGrid(budget, cashFlowId, customerKeyId);
  const inventoryGrid   = computeInventoryGrid(budget,   cashFlowId, customerKeyId);
  const salariesGrid    = computeSalariesGrid(budget,    cashFlowId, customerKeyId);

  const payablesMov    = cashImpactFromRoll(payablesGrid.summary.cb,    payablesGrid.openingBalance,    periodKeys, -1);
  const receivablesMov = cashImpactFromRoll(receivablesGrid.summary.cb, receivablesGrid.openingBalance, periodKeys, -1);
  const inventoryMov   = cashImpactFromRoll(inventoryGrid.summary.cb,   inventoryGrid.openingBalance,   periodKeys, -1);
  const salariesMov    = cashImpactFromRoll(salariesGrid.summary.cb,    salariesGrid.openingBalance,    periodKeys, +1);

  const wc = emptyMap(periodKeys);
  for (const p of periodKeys) wc[p] = payablesMov[p] + receivablesMov[p] + inventoryMov[p];

  // ── Manual sections ────────────────────────────────────────
  const otherAdj  = sumManual(cashFlowId, 'other_adj', periodKeys);
  const financing = sumManual(cashFlowId, 'financing', periodKeys);
  const capex     = sumManual(cashFlowId, 'capex',     periodKeys);

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
      payables:    payablesMov,
      receivables: receivablesMov,
      inventory:   inventoryMov,
      total:       wc,
    },
  };
}
