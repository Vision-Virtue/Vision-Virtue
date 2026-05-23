"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.computePivot = computePivot;
exports.rollUpCells = rollUpCells;
exports.periodKeysForDisplay = periodKeysForDisplay;
const PL_SECTION_ORDER = [
    'Revenues',
    'COGS',
    'R&D',
    'S&M',
    'G&A',
    'Financial Income/(Expenses)',
    'Tax',
    'Other Income/(Expenses)',
];
function emptyPeriodMap(periodKeys) {
    const out = {};
    for (const p of periodKeys)
        out[p] = 0;
    return out;
}
function matches(ids, fk) {
    if (!ids || ids.length === 0)
        return true;
    if (fk === null)
        return false;
    return ids.includes(fk);
}
function computePivot(lines, glById, filters, periodKeys) {
    const filtered = lines.filter(l => matches(filters.companyIds, l.companyId) &&
        matches(filters.divisionIds, l.divisionId) &&
        matches(filters.departmentIds, l.departmentId) &&
        matches(filters.productIds, l.productId) &&
        matches(filters.activityIds, l.activityId) &&
        matches(filters.glAccountIds, l.glAccountId));
    // section → category → { cells, fyTotal }
    const sections = new Map();
    for (const l of filtered) {
        if (!l.glAccountId)
            continue;
        const gl = glById.get(l.glAccountId);
        if (!gl || !gl.plSection || !gl.budgetCategory)
            continue;
        const catName = gl.budgetCategory === 'Your Budget Category'
            ? (gl.budgetCategoryCustom || 'Your Budget Category')
            : gl.budgetCategory;
        let bySection = sections.get(gl.plSection);
        if (!bySection) {
            bySection = new Map();
            sections.set(gl.plSection, bySection);
        }
        let entry = bySection.get(catName);
        if (!entry) {
            entry = { cells: emptyPeriodMap(periodKeys), fyTotal: 0 };
            bySection.set(catName, entry);
        }
        for (const p of periodKeys) {
            const v = Number(l.cells[p]) || 0;
            entry.cells[p] += v;
            entry.fyTotal += v;
        }
    }
    // Build the result in P&L Section spec order. Unknown sections (shouldn't
    // happen with valid data) are appended at the end alphabetically.
    const groups = [];
    const known = new Set(PL_SECTION_ORDER);
    const ordered = [
        ...PL_SECTION_ORDER.filter(s => sections.has(s)),
        ...[...sections.keys()].filter(s => !known.has(s)).sort(),
    ];
    for (const plSection of ordered) {
        const bySection = sections.get(plSection);
        if (!bySection)
            continue;
        const categories = [];
        const sectionCells = emptyPeriodMap(periodKeys);
        let sectionFy = 0;
        // Categories within a section sorted alphabetically for stable display.
        const sortedCats = [...bySection.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        for (const [name, entry] of sortedCats) {
            categories.push({ name, cells: entry.cells, fyTotal: entry.fyTotal });
            for (const p of periodKeys)
                sectionCells[p] += entry.cells[p];
            sectionFy += entry.fyTotal;
        }
        groups.push({ plSection, categories, cells: sectionCells, fyTotal: sectionFy });
    }
    // Grand totals.
    const grandTotal = Object.assign(emptyPeriodMap(periodKeys), { fyTotal: 0 });
    for (const g of groups) {
        for (const p of periodKeys)
            grandTotal[p] += g.cells[p];
        grandTotal.fyTotal += g.fyTotal;
    }
    // Gross Margin %: (Revenues - COGS) / Revenues × 100 per period.
    const rev = groups.find(g => g.plSection === 'Revenues');
    const cogs = groups.find(g => g.plSection === 'COGS');
    const grossMargin = Object.assign(emptyPeriodMap(periodKeys), { fyTotal: 0 });
    for (const p of periodKeys) {
        const r = rev?.cells[p] || 0;
        const c = cogs?.cells[p] || 0;
        grossMargin[p] = r > 0 ? ((r - c) / r) * 100 : 0;
    }
    const totalR = rev?.fyTotal || 0;
    const totalC = cogs?.fyTotal || 0;
    grossMargin.fyTotal = totalR > 0 ? ((totalR - totalC) / totalR) * 100 : 0;
    return { periodKeys, groups, grandTotal, grossMargin };
}
const MONTHS = ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M12'];
function sum(obj, keys) {
    let s = 0;
    for (const k of keys)
        s += obj[k] || 0;
    return s;
}
/** Re-aggregate a row of cells from the source granularity to `to`.
 *  Returns a fresh map keyed by the destination period keys. */
function rollUpCells(cells, from, to) {
    if (from === to)
        return { ...cells };
    if (to === 'yearly') {
        if (from === 'monthly')
            return { FY: sum(cells, MONTHS) };
        if (from === 'quarterly')
            return { FY: sum(cells, ['Q1', 'Q2', 'Q3', 'Q4']) };
    }
    if (to === 'quarterly') {
        if (from === 'monthly') {
            return {
                Q1: sum(cells, ['M01', 'M02', 'M03']),
                Q2: sum(cells, ['M04', 'M05', 'M06']),
                Q3: sum(cells, ['M07', 'M08', 'M09']),
                Q4: sum(cells, ['M10', 'M11', 'M12']),
            };
        }
    }
    // Cannot split coarser → finer (no info to redistribute) — return zeros.
    if (to === 'monthly') {
        const z = {};
        for (const m of MONTHS)
            z[m] = 0;
        return z;
    }
    return { ...cells };
}
function periodKeysForDisplay(g) {
    if (g === 'monthly')
        return MONTHS.slice();
    if (g === 'quarterly')
        return ['Q1', 'Q2', 'Q3', 'Q4'];
    return ['FY'];
}
