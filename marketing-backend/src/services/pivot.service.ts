/* ============================================================
   P&L Pivot service (spec §8.2 + §8.3).

   Aggregates budget_lines into P&L Section → Budget Category
   groups, with per-period totals, FY totals, and a Gross Margin %
   row computed from (Revenues - COGS) / Revenues × 100.

   Filters are multi-select per Org dimension (Company / Division /
   Department / Product / Activity). An empty filter list means
   "include all" for that dimension. A non-empty list restricts to
   the listed ids; lines whose Org FK is null are EXCLUDED from a
   non-empty filter (you can't filter to a value that isn't set).
   ============================================================ */

import { GLAccountRow } from '../db/visibility.repository';

const PL_SECTION_ORDER = [
  'Revenues',
  'COGS',
  'R&D',
  'S&M',
  'G&A',
  'Financial Income/(Expenses)',
  'Tax',
  'Other Income/(Expenses)',
] as const;

export interface BudgetLineWithCells {
  id: string;
  companyId: string | null;
  divisionId: string | null;
  departmentId: string | null;
  productId: string | null;
  activityId: string | null;
  glAccountId: string | null;
  cells: Record<string, number>;
}

export interface PivotFilters {
  companyIds?:    string[];
  divisionIds?:   string[];
  departmentIds?: string[];
  productIds?:    string[];
  activityIds?:   string[];
  glAccountIds?:  string[];
}

export interface PivotCategory {
  name: string;
  cells: Record<string, number>;
  fyTotal: number;
}

export interface PivotGroup {
  plSection: string;
  categories: PivotCategory[];
  cells: Record<string, number>;   // section subtotal per period
  fyTotal: number;
}

export interface PivotResult {
  periodKeys: string[];
  groups: PivotGroup[];
  grandTotal:  Record<string, number> & { fyTotal: number };
  grossMargin: Record<string, number> & { fyTotal: number };
}

function emptyPeriodMap(periodKeys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of periodKeys) out[p] = 0;
  return out;
}

function matches(ids: string[] | undefined, fk: string | null): boolean {
  if (!ids || ids.length === 0) return true;
  if (fk === null) return false;
  return ids.includes(fk);
}

export function computePivot(
  lines: BudgetLineWithCells[],
  glById: Map<string, GLAccountRow>,
  filters: PivotFilters,
  periodKeys: string[],
): PivotResult {
  const filtered = lines.filter(l =>
    matches(filters.companyIds,    l.companyId) &&
    matches(filters.divisionIds,   l.divisionId) &&
    matches(filters.departmentIds, l.departmentId) &&
    matches(filters.productIds,    l.productId) &&
    matches(filters.activityIds,   l.activityId) &&
    matches(filters.glAccountIds,  l.glAccountId),
  );

  // section → category → { cells, fyTotal }
  const sections = new Map<string, Map<string, { cells: Record<string, number>; fyTotal: number }>>();

  for (const l of filtered) {
    if (!l.glAccountId) continue;
    const gl = glById.get(l.glAccountId);
    if (!gl || !gl.plSection || !gl.budgetCategory) continue;
    const catName =
      gl.budgetCategory === 'Your Budget Category'
        ? (gl.budgetCategoryCustom || 'Your Budget Category')
        : gl.budgetCategory;

    let bySection = sections.get(gl.plSection);
    if (!bySection) { bySection = new Map(); sections.set(gl.plSection, bySection); }
    let entry = bySection.get(catName);
    if (!entry) { entry = { cells: emptyPeriodMap(periodKeys), fyTotal: 0 }; bySection.set(catName, entry); }

    for (const p of periodKeys) {
      const v = Number(l.cells[p]) || 0;
      entry.cells[p] += v;
      entry.fyTotal += v;
    }
  }

  // Build the result in P&L Section spec order. Unknown sections (shouldn't
  // happen with valid data) are appended at the end alphabetically.
  const groups: PivotGroup[] = [];
  const known = new Set<string>(PL_SECTION_ORDER);
  const ordered: string[] = [
    ...PL_SECTION_ORDER.filter(s => sections.has(s)),
    ...[...sections.keys()].filter(s => !known.has(s)).sort(),
  ];

  for (const plSection of ordered) {
    const bySection = sections.get(plSection);
    if (!bySection) continue;
    const categories: PivotCategory[] = [];
    const sectionCells = emptyPeriodMap(periodKeys);
    let sectionFy = 0;
    // Categories within a section sorted alphabetically for stable display.
    const sortedCats = [...bySection.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, entry] of sortedCats) {
      categories.push({ name, cells: entry.cells, fyTotal: entry.fyTotal });
      for (const p of periodKeys) sectionCells[p] += entry.cells[p];
      sectionFy += entry.fyTotal;
    }
    groups.push({ plSection, categories, cells: sectionCells, fyTotal: sectionFy });
  }

  // Grand totals.
  const grandTotal: Record<string, number> & { fyTotal: number } = Object.assign(emptyPeriodMap(periodKeys), { fyTotal: 0 });
  for (const g of groups) {
    for (const p of periodKeys) grandTotal[p] += g.cells[p];
    grandTotal.fyTotal += g.fyTotal;
  }

  // Gross Margin %: (Revenues - COGS) / Revenues × 100 per period.
  const rev  = groups.find(g => g.plSection === 'Revenues');
  const cogs = groups.find(g => g.plSection === 'COGS');
  const grossMargin: Record<string, number> & { fyTotal: number } = Object.assign(emptyPeriodMap(periodKeys), { fyTotal: 0 });
  for (const p of periodKeys) {
    const r = rev?.cells[p]  || 0;
    const c = cogs?.cells[p] || 0;
    grossMargin[p] = r > 0 ? ((r - c) / r) * 100 : 0;
  }
  const totalR = rev?.fyTotal  || 0;
  const totalC = cogs?.fyTotal || 0;
  grossMargin.fyTotal = totalR > 0 ? ((totalR - totalC) / totalR) * 100 : 0;

  return { periodKeys, groups, grandTotal, grossMargin };
}

// ─── Period rollup ──────────────────────────────────────────
//
// Spec §8.3 period filter: as the user changes the display granularity
// the pivot rolls up months → quarters → FY. The underlying budget
// granularity is unchanged.

export type DisplayGranularity = 'monthly' | 'quarterly' | 'yearly';

const MONTHS = ['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];

function sum(obj: Record<string, number>, keys: string[]): number {
  let s = 0;
  for (const k of keys) s += obj[k] || 0;
  return s;
}

/** Re-aggregate a row of cells from the source granularity to `to`.
 *  Returns a fresh map keyed by the destination period keys. */
export function rollUpCells(
  cells: Record<string, number>,
  from: 'monthly' | 'quarterly' | 'yearly',
  to: DisplayGranularity,
): Record<string, number> {
  if (from === to) return { ...cells };
  if (to === 'yearly') {
    if (from === 'monthly')   return { FY: sum(cells, MONTHS) };
    if (from === 'quarterly') return { FY: sum(cells, ['Q1','Q2','Q3','Q4']) };
  }
  if (to === 'quarterly') {
    if (from === 'monthly') {
      return {
        Q1: sum(cells, ['M01','M02','M03']),
        Q2: sum(cells, ['M04','M05','M06']),
        Q3: sum(cells, ['M07','M08','M09']),
        Q4: sum(cells, ['M10','M11','M12']),
      };
    }
  }
  // Cannot split coarser → finer (no info to redistribute) — return zeros.
  if (to === 'monthly') {
    const z: Record<string, number> = {};
    for (const m of MONTHS) z[m] = 0;
    return z;
  }
  return { ...cells };
}

export function periodKeysForDisplay(g: DisplayGranularity): string[] {
  if (g === 'monthly')   return MONTHS.slice();
  if (g === 'quarterly') return ['Q1','Q2','Q3','Q4'];
  return ['FY'];
}
