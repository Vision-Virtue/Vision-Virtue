"use strict";
/* ============================================================
   Salaries & Benefits — validation + pivot (spec §7).

   Validates per-employee Product-Activity % sums (with auto-split
   when surplus rows blow past 100%) + Co/Div/Dept consistency,
   then pivot-aggregates rows by
     (company_id, division_id, department_id, product_id,
      activity_id, gl_account_id)
   so each pivot key becomes one Budget Structure line.
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pivotEntryToCells = pivotEntryToCells;
exports.validateAndPivotSalaries = validateAndPivotSalaries;
const EPSILON = 0.001; // small tolerance for FP comparisons
/** Compute period cell amounts for one pivot entry given the budget granularity.
 *  Rounds to the nearest integer — Budget Structure does not store decimals. */
function pivotEntryToCells(allocatedMonthly, granularity) {
    const m = Math.round(allocatedMonthly);
    if (granularity === 'monthly') {
        const out = {};
        for (let i = 1; i <= 12; i++) {
            out[`M${String(i).padStart(2, '0')}`] = m;
        }
        return out;
    }
    if (granularity === 'quarterly') {
        return { Q1: m * 3, Q2: m * 3, Q3: m * 3, Q4: m * 3 };
    }
    // yearly
    return { FY: m * 12 };
}
function validateAndPivotSalaries(rows) {
    const errors = [];
    const warnings = [];
    const instancesByName = new Map();
    for (const row of rows) {
        const name = row.employeeName.trim();
        if (!name) {
            errors.push({
                code: 'MISSING_EMPLOYEE_NAME',
                message: 'Every salary row needs an employee name.',
                rowIds: [row.id],
            });
            continue;
        }
        let list = instancesByName.get(name);
        if (!list) {
            list = [];
            instancesByName.set(name, list);
        }
        let current = list[list.length - 1];
        // Start a new instance when the row would push current beyond 100%.
        const addsTo = current ? current.pctTotal + row.productActivityPct : row.productActivityPct;
        if (!current || addsTo > 100 + EPSILON) {
            if (current) {
                warnings.push({
                    code: 'EMPLOYEE_SPLIT',
                    message: `"${name}" exceeds 100% — treating the remainder as a separate employee with the same name.`,
                });
            }
            current = {
                employeeName: name,
                instanceIndex: list.length,
                companyId: row.companyId,
                divisionId: row.divisionId,
                departmentId: row.departmentId,
                rows: [],
                pctTotal: 0,
            };
            list.push(current);
        }
        else {
            // Co/Div/Dept must match the existing instance (spec §7.4).
            const sameCo = current.companyId === row.companyId;
            const sameDiv = current.divisionId === row.divisionId;
            const sameDept = current.departmentId === row.departmentId;
            if (!sameCo || !sameDiv || !sameDept) {
                errors.push({
                    code: 'EMPLOYEE_INCONSISTENT',
                    message: `"${name}" has rows with mismatched Company / Division / Department. An employee must share those three values across all rows.`,
                    rowIds: [row.id, ...current.rows.map(r => r.id)],
                });
            }
        }
        current.rows.push(row);
        current.pctTotal += row.productActivityPct;
    }
    // Each instance must sum to ≥ 100% (spec §7.4 wording: "must = 100%").
    // We accept ≥100 - EPSILON to absorb floating-point noise.
    for (const list of instancesByName.values()) {
        for (const inst of list) {
            if (inst.pctTotal < 100 - EPSILON) {
                errors.push({
                    code: 'EMPLOYEE_UNDER_100',
                    message: `"${inst.employeeName}"${inst.instanceIndex > 0 ? ' (instance ' + (inst.instanceIndex + 1) + ')' : ''} only allocates ${inst.pctTotal.toFixed(2)}% across its rows. Each employee must total 100%.`,
                    rowIds: inst.rows.map(r => r.id),
                });
            }
        }
    }
    // Pivot: aggregate by (company, division, department, product, activity, gl).
    const pivotMap = new Map();
    for (const row of rows) {
        if (!row.glAccountId)
            continue; // skip rows missing a GL — they wouldn't land anywhere
        const key = [
            row.companyId ?? '',
            row.divisionId ?? '',
            row.departmentId ?? '',
            row.productId ?? '',
            row.activityId ?? '',
            row.glAccountId,
        ].join('|');
        const allocated = (row.monthlySalary || 0) * ((row.productActivityPct || 0) / 100);
        let entry = pivotMap.get(key);
        if (!entry) {
            entry = {
                companyId: row.companyId,
                divisionId: row.divisionId,
                departmentId: row.departmentId,
                productId: row.productId,
                activityId: row.activityId,
                glAccountId: row.glAccountId,
                allocatedMonthlySalary: 0,
                contributingRowIds: [],
            };
            pivotMap.set(key, entry);
        }
        entry.allocatedMonthlySalary += allocated;
        entry.contributingRowIds.push(row.id);
    }
    // A row with no GL is an error (we can't pivot it into Budget Structure).
    const rowsMissingGl = rows.filter(r => !r.glAccountId);
    if (rowsMissingGl.length > 0) {
        errors.push({
            code: 'MISSING_GL',
            message: `${rowsMissingGl.length} salary row${rowsMissingGl.length === 1 ? '' : 's'} need an Account/GL Name before the group can be finalized.`,
            rowIds: rowsMissingGl.map(r => r.id),
        });
    }
    return { errors, warnings, pivot: [...pivotMap.values()] };
}
