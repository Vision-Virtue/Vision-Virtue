/* ============================================================
   CF — Manual sections service (spec §7 Other Adjustments,
   §8 Financing, §9 Capex).

   All three sections share the same data shape: free-form
   description + per-period signed amounts. FY column = sum
   of the period amounts. A footer "Total" row sums across
   all rows per period and FY.
   ============================================================ */

import {
  BudgetRow,
  CfManualKind,
  cfManualRowRepo,
  periodKeysFor,
} from '../db/visibility.repository';

export interface ManualGridRow {
  id: string;
  description: string;
  orderIndex: number;
  amounts: Record<string, number>;   // period_key → signed amount
  fy: number;                        // sum of the period amounts
}

export interface ManualGrid {
  kind:         CfManualKind;
  granularity:  BudgetRow['granularity'];
  periodKeys:   string[];
  rows:         ManualGridRow[];
  totals:       Record<string, number>;  // per period
  totalFy:      number;
}

export function computeManualGrid(
  budget: BudgetRow,
  cashFlowId: string,
  kind: CfManualKind,
): ManualGrid {
  const periodKeys = periodKeysFor(budget.granularity);
  const rows = cfManualRowRepo.listByCfAndKind(cashFlowId, kind);

  const enriched: ManualGridRow[] = rows.map(r => {
    let fy = 0;
    for (const p of periodKeys) fy += Number(r.amounts[p]) || 0;
    return {
      id:          r.id,
      description: r.description,
      orderIndex:  r.orderIndex,
      amounts:     r.amounts,
      fy,
    };
  });

  const totals: Record<string, number> = {};
  for (const p of periodKeys) totals[p] = 0;
  let totalFy = 0;
  for (const r of enriched) {
    for (const p of periodKeys) totals[p] += Number(r.amounts[p]) || 0;
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
