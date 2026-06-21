"use strict";
/* ============================================================
   Visibility offering — DB repositories.
   Tables: gl_accounts, financial_structure_state.
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cfManualRowRepo = exports.CF_MANUAL_KINDS = exports.cfSalariesSectionRepo = exports.cfInventoryPurchasesRepo = exports.cfInventorySectionRepo = exports.cfReceivablesPriorCarryRepo = exports.cfReceivablesRowRepo = exports.cfReceivablesSectionRepo = exports.cfPayablesPriorCarryRepo = exports.cfPayablesRowRepo = exports.cfPayablesSectionRepo = exports.PAYMENT_TERMS = exports.cashFlowRepo = exports.rcStateRepo = exports.rcRowRepo = exports.salariesStateRepo = exports.salariesRowRepo = exports.budgetCellRepo = exports.budgetLineRepo = exports.budgetRepo = exports.BUDGET_CAP_PER_CUSTOMER = exports.SCALES = exports.CURRENCIES = exports.GRANULARITIES = exports.orgStructureRepo = exports.orgEntityRepo = exports.ORG_DIMENSIONS = exports.financialStructureRepo = exports.glAccountRepo = void 0;
exports.periodKeysFor = periodKeysFor;
const uuid_1 = require("uuid");
const database_1 = require("./database");
function toDomain(r) {
    return {
        id: r.id,
        customerKeyId: r.customer_key_id,
        glNumber: r.gl_number,
        glName: r.gl_name,
        plSection: r.pl_section,
        budgetCategory: r.budget_category,
        budgetCategoryCustom: r.budget_category_custom,
        inventoryRelated: r.inventory_related === 1,
        orderIndex: r.order_index,
        orphan: r.orphan === 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
exports.glAccountRepo = {
    listByCustomer(customerKeyId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT * FROM gl_accounts WHERE customer_key_id = ?
                ORDER BY order_index ASC, gl_number ASC`)
            .all(customerKeyId);
        return rows.map(toDomain);
    },
    getById(id) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT * FROM gl_accounts WHERE id = ?`)
            .get(id);
        return row ? toDomain(row) : null;
    },
    /**
     * Apply an upload to a customer's GL list.
     *
     * - Rows whose gl_number is in the upload are kept; their gl_name is
     *   refreshed and previously-assigned pl_section / budget_category /
     *   budget_category_custom are preserved (re-upload memory per spec §2.1).
     * - Rows whose gl_number is in the upload but did NOT exist before are
     *   inserted with empty mappings and orphan = 0.
     * - Rows whose gl_number existed but is NOT in the upload are flagged
     *   as orphans (kept, mappings preserved). Spec §2.1: "remain in the
     *   system as orphan GLs — non-blocking notification banner".
     *
     * Returns the resulting list and counts.
     */
    applyUpload(customerKeyId, upload) {
        const db = (0, database_1.getDb)();
        const now = new Date().toISOString();
        const existing = this.listByCustomer(customerKeyId);
        const byNumber = new Map();
        for (const r of existing)
            byNumber.set(r.glNumber, r);
        const uploadSet = new Set(upload.map(u => u.glNumber));
        const insert = db.prepare(`INSERT INTO gl_accounts
         (id, customer_key_id, gl_number, gl_name, pl_section, budget_category,
          budget_category_custom, order_index, orphan, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 0, ?, ?)`);
        const updateName = db.prepare(`UPDATE gl_accounts
          SET gl_name = ?, order_index = ?, orphan = 0, updated_at = ?
        WHERE id = ?`);
        const flagOrphan = db.prepare(`UPDATE gl_accounts SET orphan = 1, updated_at = ? WHERE id = ?`);
        let inserted = 0;
        let updated = 0;
        let orphaned = 0;
        const tx = db.transaction(() => {
            let i = 0;
            for (const u of upload) {
                const existingRow = byNumber.get(u.glNumber);
                if (existingRow) {
                    updateName.run(u.glName, i, now, existingRow.id);
                    updated++;
                }
                else {
                    insert.run((0, uuid_1.v4)(), customerKeyId, u.glNumber, u.glName, i, now, now);
                    inserted++;
                }
                i++;
            }
            // Existing rows not in the upload → orphan.
            for (const r of existing) {
                if (!uploadSet.has(r.glNumber)) {
                    flagOrphan.run(now, r.id);
                    if (!r.orphan)
                        orphaned++;
                }
            }
        });
        tx();
        return { all: this.listByCustomer(customerKeyId), inserted, updated, orphaned };
    },
    updateMapping(id, fields) {
        const sets = [];
        const vals = [];
        if (fields.plSection !== undefined) {
            sets.push('pl_section = ?');
            vals.push(fields.plSection);
        }
        if (fields.budgetCategory !== undefined) {
            sets.push('budget_category = ?');
            vals.push(fields.budgetCategory);
        }
        if (fields.budgetCategoryCustom !== undefined) {
            sets.push('budget_category_custom = ?');
            vals.push(fields.budgetCategoryCustom);
        }
        if (fields.inventoryRelated !== undefined) {
            sets.push('inventory_related = ?');
            vals.push(fields.inventoryRelated ? 1 : 0);
        }
        if (sets.length === 0)
            return this.getById(id);
        sets.push('updated_at = ?');
        vals.push(new Date().toISOString());
        vals.push(id);
        (0, database_1.getDb)()
            .prepare(`UPDATE gl_accounts SET ${sets.join(', ')} WHERE id = ?`)
            .run(...vals);
        return this.getById(id);
    },
    deleteById(id) {
        (0, database_1.getDb)().prepare(`DELETE FROM gl_accounts WHERE id = ?`).run(id);
    },
};
exports.financialStructureRepo = {
    getStatus(customerKeyId) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT status FROM financial_structure_state WHERE customer_key_id = ?`)
            .get(customerKeyId);
        return row?.status ?? 'editing';
    },
    setStatus(customerKeyId, status) {
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`INSERT INTO financial_structure_state (customer_key_id, status, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(customer_key_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`)
            .run(customerKeyId, status, now);
    },
};
// ─── Org Structure (Phase 2) ────────────────────────────────────────────────
exports.ORG_DIMENSIONS = ['company', 'division', 'department', 'product', 'activity'];
function toOrgDomain(r) {
    return {
        id: r.id,
        customerKeyId: r.customer_key_id,
        dimension: r.dimension,
        name: r.name,
        orderIndex: r.order_index,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
exports.orgEntityRepo = {
    listByCustomer(customerKeyId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT * FROM org_entities WHERE customer_key_id = ?
                ORDER BY dimension ASC, order_index ASC, created_at ASC`)
            .all(customerKeyId);
        return rows.map(toOrgDomain);
    },
    getById(id) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT * FROM org_entities WHERE id = ?`)
            .get(id);
        return row ? toOrgDomain(row) : null;
    },
    create(customerKeyId, dimension, name) {
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        // Place new entries at the end of their dimension list.
        const maxIdx = (0, database_1.getDb)()
            .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m
                  FROM org_entities WHERE customer_key_id = ? AND dimension = ?`)
            .get(customerKeyId, dimension).m;
        (0, database_1.getDb)()
            .prepare(`INSERT INTO org_entities
           (id, customer_key_id, dimension, name, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(id, customerKeyId, dimension, name, maxIdx + 1, now, now);
        return this.getById(id);
    },
    rename(id, name) {
        (0, database_1.getDb)()
            .prepare(`UPDATE org_entities SET name = ?, updated_at = ? WHERE id = ?`)
            .run(name, new Date().toISOString(), id);
        return this.getById(id);
    },
    deleteById(id) {
        (0, database_1.getDb)().prepare(`DELETE FROM org_entities WHERE id = ?`).run(id);
    },
    /**
     * Count of budget rows / Salaries rows currently referencing this org
     * entity. Until Phase 3 ships those tables don't exist yet — return 0
     * so the delete-confirmation modal can already be wired on the
     * frontend without blocking on the budget layer.
     */
    countReferences(_id) {
        // Placeholder for Phase 3 — wire up to BudgetLine / SalariesRow once
        // those tables are introduced.
        return 0;
    },
};
exports.orgStructureRepo = {
    getStatus(customerKeyId) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT status FROM org_structure_state WHERE customer_key_id = ?`)
            .get(customerKeyId);
        return row?.status ?? 'editing';
    },
    setStatus(customerKeyId, status) {
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`INSERT INTO org_structure_state (customer_key_id, status, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(customer_key_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`)
            .run(customerKeyId, status, now);
    },
};
// ─── Budgets (Phase 3a) ─────────────────────────────────────────────────────
exports.GRANULARITIES = ['monthly', 'quarterly', 'yearly'];
exports.CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS'];
exports.SCALES = ['standard', 'thousands'];
exports.BUDGET_CAP_PER_CUSTOMER = 5; // spec §5.4
/** Period keys for a given granularity. */
function periodKeysFor(granularity) {
    switch (granularity) {
        case 'monthly': return ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M12'];
        case 'quarterly': return ['Q1', 'Q2', 'Q3', 'Q4'];
        case 'yearly': return ['FY'];
    }
}
function toBudgetDomain(r) {
    return {
        id: r.id,
        customerKeyId: r.customer_key_id,
        name: r.name,
        year: r.year,
        granularity: r.granularity,
        currency: r.currency,
        scale: r.scale,
        sbEnabled: r.sb_enabled === 1,
        rcEnabled: (r.rc_enabled ?? 0) === 1,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
function toBudgetLineDomain(r) {
    return {
        id: r.id,
        budgetId: r.budget_id,
        companyId: r.company_id,
        serviceProviderName: r.service_provider_name,
        serviceDescription: r.service_description,
        divisionId: r.division_id,
        departmentId: r.department_id,
        productId: r.product_id,
        activityId: r.activity_id,
        glAccountId: r.gl_account_id,
        source: r.source,
        orderIndex: r.order_index,
    };
}
exports.budgetRepo = {
    listByCustomer(customerKeyId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT * FROM budgets WHERE customer_key_id = ?
                ORDER BY updated_at DESC`)
            .all(customerKeyId);
        return rows.map(toBudgetDomain);
    },
    countByCustomer(customerKeyId) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT COUNT(*) AS n FROM budgets WHERE customer_key_id = ?`)
            .get(customerKeyId);
        return row.n;
    },
    getById(id) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT * FROM budgets WHERE id = ?`)
            .get(id);
        return row ? toBudgetDomain(row) : null;
    },
    create(customerKeyId, setup) {
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`INSERT INTO budgets
           (id, customer_key_id, name, year, granularity, currency, scale,
            sb_enabled, rc_enabled, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
            .run(id, customerKeyId, setup.name ?? '', setup.year, setup.granularity, setup.currency, setup.scale, setup.sbEnabled ? 1 : 0, setup.rcEnabled ? 1 : 0, now, now);
        return this.getById(id);
    },
    /** Partial update — pass only fields you want to change. */
    update(id, fields) {
        const sets = [];
        const vals = [];
        if (fields.name !== undefined) {
            sets.push('name = ?');
            vals.push(fields.name);
        }
        if (fields.year !== undefined) {
            sets.push('year = ?');
            vals.push(fields.year);
        }
        if (fields.granularity !== undefined) {
            sets.push('granularity = ?');
            vals.push(fields.granularity);
        }
        if (fields.currency !== undefined) {
            sets.push('currency = ?');
            vals.push(fields.currency);
        }
        if (fields.scale !== undefined) {
            sets.push('scale = ?');
            vals.push(fields.scale);
        }
        if (fields.sbEnabled !== undefined) {
            sets.push('sb_enabled = ?');
            vals.push(fields.sbEnabled ? 1 : 0);
        }
        if (fields.rcEnabled !== undefined) {
            sets.push('rc_enabled = ?');
            vals.push(fields.rcEnabled ? 1 : 0);
        }
        if (fields.status !== undefined) {
            sets.push('status = ?');
            vals.push(fields.status);
        }
        if (sets.length === 0)
            return this.getById(id);
        sets.push('updated_at = ?');
        vals.push(new Date().toISOString());
        vals.push(id);
        (0, database_1.getDb)()
            .prepare(`UPDATE budgets SET ${sets.join(', ')} WHERE id = ?`)
            .run(...vals);
        return this.getById(id);
    },
    deleteById(id) {
        (0, database_1.getDb)().prepare(`DELETE FROM budgets WHERE id = ?`).run(id);
    },
};
exports.budgetLineRepo = {
    listByBudget(budgetId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT * FROM budget_lines WHERE budget_id = ?
                ORDER BY order_index ASC, created_at ASC`)
            .all(budgetId);
        return rows.map(toBudgetLineDomain);
    },
    getById(id) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT * FROM budget_lines WHERE id = ?`)
            .get(id);
        return row ? toBudgetLineDomain(row) : null;
    },
    create(budgetId, source = 'manual', afterId) {
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        let insertAt;
        if (afterId) {
            const ex = (0, database_1.getDb)()
                .prepare(`SELECT order_index FROM budget_lines WHERE id = ? AND budget_id = ?`)
                .get(afterId, budgetId);
            if (ex) {
                insertAt = ex.order_index + 1;
                (0, database_1.getDb)()
                    .prepare(`UPDATE budget_lines SET order_index = order_index + 1 WHERE budget_id = ? AND order_index >= ?`)
                    .run(budgetId, insertAt);
            }
            else {
                insertAt = ((0, database_1.getDb)()
                    .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM budget_lines WHERE budget_id = ?`)
                    .get(budgetId).m) + 1;
            }
        }
        else {
            insertAt = ((0, database_1.getDb)()
                .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM budget_lines WHERE budget_id = ?`)
                .get(budgetId).m) + 1;
        }
        (0, database_1.getDb)()
            .prepare(`INSERT INTO budget_lines
           (id, budget_id, source, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`)
            .run(id, budgetId, source, insertAt, now, now);
        return this.getById(id);
    },
    update(id, fields) {
        const sets = [];
        const vals = [];
        const norm = (v) => (v === '' || v == null ? null : v);
        if (fields.companyId !== undefined) {
            sets.push('company_id = ?');
            vals.push(norm(fields.companyId));
        }
        if (fields.serviceProviderName !== undefined) {
            sets.push('service_provider_name = ?');
            vals.push(fields.serviceProviderName);
        }
        if (fields.serviceDescription !== undefined) {
            sets.push('service_description = ?');
            vals.push(fields.serviceDescription);
        }
        if (fields.divisionId !== undefined) {
            sets.push('division_id = ?');
            vals.push(norm(fields.divisionId));
        }
        if (fields.departmentId !== undefined) {
            sets.push('department_id = ?');
            vals.push(norm(fields.departmentId));
        }
        if (fields.productId !== undefined) {
            sets.push('product_id = ?');
            vals.push(norm(fields.productId));
        }
        if (fields.activityId !== undefined) {
            sets.push('activity_id = ?');
            vals.push(norm(fields.activityId));
        }
        if (fields.glAccountId !== undefined) {
            sets.push('gl_account_id = ?');
            vals.push(norm(fields.glAccountId));
        }
        if (sets.length === 0)
            return this.getById(id);
        sets.push('updated_at = ?');
        vals.push(new Date().toISOString());
        vals.push(id);
        (0, database_1.getDb)()
            .prepare(`UPDATE budget_lines SET ${sets.join(', ')} WHERE id = ?`)
            .run(...vals);
        return this.getById(id);
    },
    deleteById(id) {
        (0, database_1.getDb)().prepare(`DELETE FROM budget_lines WHERE id = ?`).run(id);
    },
};
exports.budgetCellRepo = {
    listByLine(lineId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT period_key, amount FROM budget_cells WHERE budget_line_id = ?`)
            .all(lineId);
        const out = {};
        for (const r of rows)
            out[r.period_key] = r.amount;
        return out;
    },
    /** Upsert one cell. */
    setCell(lineId, periodKey, amount) {
        (0, database_1.getDb)()
            .prepare(`INSERT INTO budget_cells (budget_line_id, period_key, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(budget_line_id, period_key)
         DO UPDATE SET amount = excluded.amount`)
            .run(lineId, periodKey, amount);
    },
    /** Replace all cells for a line in one transaction. */
    setAllForLine(lineId, cells) {
        const db = (0, database_1.getDb)();
        const tx = db.transaction(() => {
            db.prepare(`DELETE FROM budget_cells WHERE budget_line_id = ?`).run(lineId);
            const insert = db.prepare(`INSERT INTO budget_cells (budget_line_id, period_key, amount) VALUES (?, ?, ?)`);
            for (const [k, v] of Object.entries(cells)) {
                insert.run(lineId, k, v);
            }
        });
        tx();
    },
    /** Re-aggregate cells when the budget granularity changes (spec §6). */
    remapForGranularity(lineId, from, to) {
        if (from === to)
            return;
        const existing = this.listByLine(lineId);
        let next = {};
        if (from === 'monthly' && to === 'quarterly') {
            next = {
                Q1: (existing.M01 || 0) + (existing.M02 || 0) + (existing.M03 || 0),
                Q2: (existing.M04 || 0) + (existing.M05 || 0) + (existing.M06 || 0),
                Q3: (existing.M07 || 0) + (existing.M08 || 0) + (existing.M09 || 0),
                Q4: (existing.M10 || 0) + (existing.M11 || 0) + (existing.M12 || 0),
            };
        }
        else if (from === 'monthly' && to === 'yearly') {
            const fy = ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M12']
                .reduce((s, k) => s + (existing[k] || 0), 0);
            next = { FY: fy };
        }
        else if (from === 'quarterly' && to === 'yearly') {
            next = { FY: (existing.Q1 || 0) + (existing.Q2 || 0) + (existing.Q3 || 0) + (existing.Q4 || 0) };
        }
        else if (from === 'quarterly' && to === 'monthly') {
            // Even-split within each quarter (spec §6 / §11).
            const split = (q) => [q / 3, q / 3, q / 3];
            const [a, b, c] = split(existing.Q1 || 0);
            const [d, e, f] = split(existing.Q2 || 0);
            const [g, h, i] = split(existing.Q3 || 0);
            const [j, k, l] = split(existing.Q4 || 0);
            next = { M01: a, M02: b, M03: c, M04: d, M05: e, M06: f, M07: g, M08: h, M09: i, M10: j, M11: k, M12: l };
        }
        else if (from === 'yearly' && to === 'quarterly') {
            const q = (existing.FY || 0) / 4;
            next = { Q1: q, Q2: q, Q3: q, Q4: q };
        }
        else if (from === 'yearly' && to === 'monthly') {
            const m = (existing.FY || 0) / 12;
            next = { M01: m, M02: m, M03: m, M04: m, M05: m, M06: m, M07: m, M08: m, M09: m, M10: m, M11: m, M12: m };
        }
        this.setAllForLine(lineId, next);
    },
};
function toSalariesDomain(r) {
    return {
        id: r.id,
        budgetId: r.budget_id,
        companyId: r.company_id,
        employeeName: r.employee_name,
        divisionId: r.division_id,
        departmentId: r.department_id,
        productId: r.product_id,
        activityId: r.activity_id,
        productActivityPct: r.product_activity_pct,
        monthlySalary: r.monthly_salary,
        glAccountId: r.gl_account_id,
        orderIndex: r.order_index,
    };
}
exports.salariesRowRepo = {
    listByBudget(budgetId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT * FROM salaries_rows WHERE budget_id = ?
                ORDER BY order_index ASC, created_at ASC`)
            .all(budgetId);
        return rows.map(toSalariesDomain);
    },
    getById(id) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT * FROM salaries_rows WHERE id = ?`)
            .get(id);
        return row ? toSalariesDomain(row) : null;
    },
    create(budgetId, seed, afterId) {
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        let insertAt;
        if (afterId) {
            const ex = (0, database_1.getDb)()
                .prepare(`SELECT order_index FROM salaries_rows WHERE id = ? AND budget_id = ?`)
                .get(afterId, budgetId);
            if (ex) {
                insertAt = ex.order_index + 1;
                (0, database_1.getDb)()
                    .prepare(`UPDATE salaries_rows SET order_index = order_index + 1 WHERE budget_id = ? AND order_index >= ?`)
                    .run(budgetId, insertAt);
            }
            else {
                insertAt = ((0, database_1.getDb)()
                    .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM salaries_rows WHERE budget_id = ?`)
                    .get(budgetId).m) + 1;
            }
        }
        else {
            insertAt = ((0, database_1.getDb)()
                .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM salaries_rows WHERE budget_id = ?`)
                .get(budgetId).m) + 1;
        }
        (0, database_1.getDb)()
            .prepare(`INSERT INTO salaries_rows
           (id, budget_id, company_id, employee_name, division_id, department_id,
            product_id, activity_id, product_activity_pct, monthly_salary,
            gl_account_id, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, budgetId, seed?.companyId ?? null, seed?.employeeName ?? '', seed?.divisionId ?? null, seed?.departmentId ?? null, seed?.productId ?? null, seed?.activityId ?? null, seed?.productActivityPct ?? 0, seed?.monthlySalary ?? 0, seed?.glAccountId ?? null, insertAt, now, now);
        return this.getById(id);
    },
    update(id, fields) {
        const norm = (v) => (v === '' || v == null ? null : v);
        const sets = [];
        const vals = [];
        if (fields.companyId !== undefined) {
            sets.push('company_id = ?');
            vals.push(norm(fields.companyId));
        }
        if (fields.employeeName !== undefined) {
            sets.push('employee_name = ?');
            vals.push(fields.employeeName);
        }
        if (fields.divisionId !== undefined) {
            sets.push('division_id = ?');
            vals.push(norm(fields.divisionId));
        }
        if (fields.departmentId !== undefined) {
            sets.push('department_id = ?');
            vals.push(norm(fields.departmentId));
        }
        if (fields.productId !== undefined) {
            sets.push('product_id = ?');
            vals.push(norm(fields.productId));
        }
        if (fields.activityId !== undefined) {
            sets.push('activity_id = ?');
            vals.push(norm(fields.activityId));
        }
        if (fields.productActivityPct !== undefined) {
            sets.push('product_activity_pct = ?');
            vals.push(fields.productActivityPct);
        }
        if (fields.monthlySalary !== undefined) {
            sets.push('monthly_salary = ?');
            vals.push(fields.monthlySalary);
        }
        if (fields.glAccountId !== undefined) {
            sets.push('gl_account_id = ?');
            vals.push(norm(fields.glAccountId));
        }
        if (sets.length === 0)
            return this.getById(id);
        sets.push('updated_at = ?');
        vals.push(new Date().toISOString());
        vals.push(id);
        (0, database_1.getDb)()
            .prepare(`UPDATE salaries_rows SET ${sets.join(', ')} WHERE id = ?`)
            .run(...vals);
        return this.getById(id);
    },
    deleteById(id) {
        (0, database_1.getDb)().prepare(`DELETE FROM salaries_rows WHERE id = ?`).run(id);
    },
    bulkInsert(budgetId, items) {
        const created = [];
        for (const it of items)
            created.push(this.create(budgetId, it));
        return created;
    },
};
exports.salariesStateRepo = {
    getStatus(budgetId) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT status FROM salaries_state WHERE budget_id = ?`)
            .get(budgetId);
        return row?.status ?? 'editing';
    },
    setStatus(budgetId, status) {
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`INSERT INTO salaries_state (budget_id, status, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(budget_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`)
            .run(budgetId, status, now);
    },
};
function toRcDomain(r) {
    let cells = {};
    try {
        cells = JSON.parse(r.cells || '{}');
    }
    catch { /* */ }
    return {
        id: r.id,
        budgetId: r.budget_id,
        companyId: r.company_id,
        divisionId: r.division_id,
        departmentId: r.department_id,
        productId: r.product_id,
        activityId: r.activity_id,
        revGlId: r.rev_gl_id,
        price: r.price,
        cogsGlId: r.cogs_gl_id,
        cost: r.cost,
        cells,
        orderIndex: r.order_index,
    };
}
exports.rcRowRepo = {
    listByBudget(budgetId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT * FROM rc_rows WHERE budget_id = ? ORDER BY order_index ASC, created_at ASC`)
            .all(budgetId);
        return rows.map(toRcDomain);
    },
    getById(id) {
        const row = (0, database_1.getDb)().prepare(`SELECT * FROM rc_rows WHERE id = ?`).get(id);
        return row ? toRcDomain(row) : null;
    },
    create(budgetId) {
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        const insertAt = ((0, database_1.getDb)()
            .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM rc_rows WHERE budget_id = ?`)
            .get(budgetId).m) + 1;
        (0, database_1.getDb)()
            .prepare(`INSERT INTO rc_rows
           (id, budget_id, company_id, division_id, department_id, product_id,
            activity_id, rev_gl_id, price, cogs_gl_id, cost, cells,
            order_index, created_at, updated_at)
         VALUES (?, ?, null, null, null, null, null, null, 0, null, 0, '{}', ?, ?, ?)`)
            .run(id, budgetId, insertAt, now, now);
        return this.getById(id);
    },
    update(id, fields) {
        const norm = (v) => (v === '' || v == null ? null : v);
        const sets = [];
        const vals = [];
        if (fields.companyId !== undefined) {
            sets.push('company_id = ?');
            vals.push(norm(fields.companyId));
        }
        if (fields.divisionId !== undefined) {
            sets.push('division_id = ?');
            vals.push(norm(fields.divisionId));
        }
        if (fields.departmentId !== undefined) {
            sets.push('department_id = ?');
            vals.push(norm(fields.departmentId));
        }
        if (fields.productId !== undefined) {
            sets.push('product_id = ?');
            vals.push(norm(fields.productId));
        }
        if (fields.activityId !== undefined) {
            sets.push('activity_id = ?');
            vals.push(norm(fields.activityId));
        }
        if (fields.revGlId !== undefined) {
            sets.push('rev_gl_id = ?');
            vals.push(norm(fields.revGlId));
        }
        if (fields.price !== undefined) {
            sets.push('price = ?');
            vals.push(fields.price);
        }
        if (fields.cogsGlId !== undefined) {
            sets.push('cogs_gl_id = ?');
            vals.push(norm(fields.cogsGlId));
        }
        if (fields.cost !== undefined) {
            sets.push('cost = ?');
            vals.push(fields.cost);
        }
        if (fields.cells !== undefined) {
            sets.push('cells = ?');
            vals.push(JSON.stringify(fields.cells));
        }
        if (sets.length === 0)
            return this.getById(id);
        sets.push('updated_at = ?');
        vals.push(new Date().toISOString());
        vals.push(id);
        (0, database_1.getDb)().prepare(`UPDATE rc_rows SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        return this.getById(id);
    },
    deleteById(id) {
        (0, database_1.getDb)().prepare(`DELETE FROM rc_rows WHERE id = ?`).run(id);
    },
};
exports.rcStateRepo = {
    getStatus(budgetId) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT status FROM rc_state WHERE budget_id = ?`)
            .get(budgetId);
        return row?.status ?? 'editing';
    },
    setStatus(budgetId, status) {
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`INSERT INTO rc_state (budget_id, status, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(budget_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`)
            .run(budgetId, status, now);
    },
};
function toCashFlowDomain(r) {
    return {
        id: r.id,
        budgetId: r.budget_id,
        openingCash: r.opening_cash,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
exports.cashFlowRepo = {
    getByBudget(budgetId) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT * FROM cash_flows WHERE budget_id = ?`)
            .get(budgetId);
        return row ? toCashFlowDomain(row) : null;
    },
    /** Returns the existing CF for this budget, creating a draft if none. */
    ensureForBudget(budgetId) {
        const existing = this.getByBudget(budgetId);
        if (existing)
            return existing;
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`INSERT INTO cash_flows (id, budget_id, opening_cash, status, created_at, updated_at)
         VALUES (?, ?, 0, 'draft', ?, ?)`)
            .run(id, budgetId, now, now);
        return {
            id, budgetId, openingCash: 0, status: 'draft',
            createdAt: now, updatedAt: now,
        };
    },
    updateOpeningCash(id, openingCash) {
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`UPDATE cash_flows SET opening_cash = ?, updated_at = ? WHERE id = ?`)
            .run(openingCash, now, id);
    },
    setStatus(id, status) {
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`UPDATE cash_flows SET status = ?, updated_at = ? WHERE id = ?`)
            .run(status, now, id);
    },
};
/* ============================================================
   CF — Payables sub-repos (spec §3)
   ============================================================ */
exports.PAYMENT_TERMS = ['Cash', 'Current', '30+', '60+', '90+', '120+', '180+'];
exports.cfPayablesSectionRepo = {
    get(cashFlowId) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT opening_balance FROM cf_payables_section WHERE cash_flow_id = ?`)
            .get(cashFlowId);
        return { openingBalance: row?.opening_balance ?? 0 };
    },
    upsert(cashFlowId, openingBalance) {
        (0, database_1.getDb)()
            .prepare(`INSERT INTO cf_payables_section (cash_flow_id, opening_balance)
         VALUES (?, ?)
         ON CONFLICT(cash_flow_id) DO UPDATE SET opening_balance = excluded.opening_balance`)
            .run(cashFlowId, openingBalance);
    },
};
function toPayablesRowDomain(r) {
    return {
        id: r.id,
        cashFlowId: r.cash_flow_id,
        companyId: r.company_id,
        plSection: r.pl_section,
        budgetCategory: r.budget_category,
        glAccountId: r.gl_account_id,
        serviceProviderName: r.service_provider_name,
        paymentTerm: r.payment_term,
        orderIndex: r.order_index,
    };
}
exports.cfPayablesRowRepo = {
    listByCf(cashFlowId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT * FROM cf_payables_rows WHERE cash_flow_id = ?
         ORDER BY order_index ASC, created_at ASC`)
            .all(cashFlowId);
        return rows.map(toPayablesRowDomain);
    },
    getById(id) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT * FROM cf_payables_rows WHERE id = ?`)
            .get(id);
        return row ? toPayablesRowDomain(row) : null;
    },
    /**
     * Find a default-level row (gl_account_id = NULL, service_provider_name
     * = NULL) for the given (cf, company, P&L, category) tuple. Creates it
     * if absent. Returns the row.
     */
    findOrCreateDefault(cashFlowId, companyId, plSection, budgetCategory, orderIndex) {
        const db = (0, database_1.getDb)();
        const existing = db
            .prepare(`SELECT * FROM cf_payables_rows
          WHERE cash_flow_id = ?
            AND (company_id IS ? OR company_id = ?)
            AND pl_section = ?
            AND budget_category = ?
            AND gl_account_id IS NULL
            AND service_provider_name IS NULL`)
            .get(cashFlowId, companyId, companyId, plSection, budgetCategory);
        if (existing)
            return toPayablesRowDomain(existing);
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO cf_payables_rows
         (id, cash_flow_id, company_id, pl_section, budget_category,
          gl_account_id, service_provider_name, payment_term,
          order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`).run(id, cashFlowId, companyId, plSection, budgetCategory, orderIndex, now, now);
        return this.getById(id);
    },
    updatePaymentTerm(id, term) {
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`UPDATE cf_payables_rows SET payment_term = ?, updated_at = ? WHERE id = ?`)
            .run(term, now, id);
    },
    deleteById(id) {
        (0, database_1.getDb)().prepare(`DELETE FROM cf_payables_rows WHERE id = ?`).run(id);
    },
    /**
     * Inventory-Purchases synthetic row. Reuses cf_payables_rows + the
     * existing prior-carry table by parking under sentinel keys so that
     * the regular (Company, P&L, Budget Category) lookup never collides.
     */
    findOrCreateInventoryPurchases(cashFlowId, orderIndex) {
        const db = (0, database_1.getDb)();
        const existing = db
            .prepare(`SELECT * FROM cf_payables_rows
          WHERE cash_flow_id = ?
            AND pl_section = '__INVENTORY__'
            AND company_id IS NULL
            AND gl_account_id IS NULL
            AND service_provider_name IS NULL`)
            .get(cashFlowId);
        if (existing)
            return toPayablesRowDomain(existing);
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO cf_payables_rows
         (id, cash_flow_id, company_id, pl_section, budget_category,
          gl_account_id, service_provider_name, payment_term,
          order_index, created_at, updated_at)
       VALUES (?, ?, NULL, '__INVENTORY__', '__PURCHASES__', NULL, NULL, NULL, ?, ?, ?)`).run(id, cashFlowId, orderIndex, now, now);
        return this.getById(id);
    },
};
exports.cfPayablesPriorCarryRepo = {
    listByRow(rowId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT period_key, amount FROM cf_payables_prior_carry WHERE cf_payables_row_id = ?`)
            .all(rowId);
        const out = {};
        for (const r of rows)
            out[r.period_key] = r.amount;
        return out;
    },
    upsert(rowId, periodKey, amount) {
        (0, database_1.getDb)()
            .prepare(`INSERT INTO cf_payables_prior_carry (cf_payables_row_id, period_key, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(cf_payables_row_id, period_key) DO UPDATE SET amount = excluded.amount`)
            .run(rowId, periodKey, amount);
    },
};
/* ============================================================
   CF — Receivables sub-repos (spec §4). Same shape as Payables
   with customer_name instead of service_provider_name and
   pl_section pinned to 'Revenues'.
   ============================================================ */
exports.cfReceivablesSectionRepo = {
    get(cashFlowId) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT opening_balance FROM cf_receivables_section WHERE cash_flow_id = ?`)
            .get(cashFlowId);
        return { openingBalance: row?.opening_balance ?? 0 };
    },
    upsert(cashFlowId, openingBalance) {
        (0, database_1.getDb)()
            .prepare(`INSERT INTO cf_receivables_section (cash_flow_id, opening_balance)
         VALUES (?, ?)
         ON CONFLICT(cash_flow_id) DO UPDATE SET opening_balance = excluded.opening_balance`)
            .run(cashFlowId, openingBalance);
    },
};
function toReceivablesRowDomain(r) {
    return {
        id: r.id,
        cashFlowId: r.cash_flow_id,
        companyId: r.company_id,
        plSection: r.pl_section,
        budgetCategory: r.budget_category,
        glAccountId: r.gl_account_id,
        customerName: r.customer_name,
        paymentTerm: r.payment_term,
        orderIndex: r.order_index,
    };
}
exports.cfReceivablesRowRepo = {
    listByCf(cashFlowId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT * FROM cf_receivables_rows WHERE cash_flow_id = ?
         ORDER BY order_index ASC, created_at ASC`)
            .all(cashFlowId);
        return rows.map(toReceivablesRowDomain);
    },
    getById(id) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT * FROM cf_receivables_rows WHERE id = ?`)
            .get(id);
        return row ? toReceivablesRowDomain(row) : null;
    },
    /** Find or create the default-level (no GL, no Customer) row for
     *  (cf, company, budget category) — Receivables groups by Company
     *  × Budget Category at the default level (P&L is always
     *  'Revenues'). */
    findOrCreateDefault(cashFlowId, companyId, budgetCategory, orderIndex) {
        const db = (0, database_1.getDb)();
        const existing = db
            .prepare(`SELECT * FROM cf_receivables_rows
          WHERE cash_flow_id = ?
            AND (company_id IS ? OR company_id = ?)
            AND budget_category = ?
            AND gl_account_id IS NULL
            AND customer_name IS NULL`)
            .get(cashFlowId, companyId, companyId, budgetCategory);
        if (existing)
            return toReceivablesRowDomain(existing);
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO cf_receivables_rows
         (id, cash_flow_id, company_id, pl_section, budget_category, gl_account_id,
          customer_name, payment_term, order_index, created_at, updated_at)
       VALUES (?, ?, ?, 'Revenues', ?, NULL, NULL, NULL, ?, ?, ?)`).run(id, cashFlowId, companyId, budgetCategory, orderIndex, now, now);
        return this.getById(id);
    },
    updatePaymentTerm(id, term) {
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`UPDATE cf_receivables_rows SET payment_term = ?, updated_at = ? WHERE id = ?`)
            .run(term, now, id);
    },
    deleteById(id) {
        (0, database_1.getDb)().prepare(`DELETE FROM cf_receivables_rows WHERE id = ?`).run(id);
    },
};
exports.cfReceivablesPriorCarryRepo = {
    listByRow(rowId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT period_key, amount FROM cf_receivables_prior_carry WHERE cf_receivables_row_id = ?`)
            .all(rowId);
        const out = {};
        for (const r of rows)
            out[r.period_key] = r.amount;
        return out;
    },
    upsert(rowId, periodKey, amount) {
        (0, database_1.getDb)()
            .prepare(`INSERT INTO cf_receivables_prior_carry (cf_receivables_row_id, period_key, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(cf_receivables_row_id, period_key) DO UPDATE SET amount = excluded.amount`)
            .run(rowId, periodKey, amount);
    },
};
/* ============================================================
   CF — Inventory sub-repos (spec §5). No per-row allocation;
   just O.B + per-period purchases.
   ============================================================ */
exports.cfInventorySectionRepo = {
    get(cashFlowId) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT opening_balance FROM cf_inventory_section WHERE cash_flow_id = ?`)
            .get(cashFlowId);
        return { openingBalance: row?.opening_balance ?? 0 };
    },
    upsert(cashFlowId, openingBalance) {
        (0, database_1.getDb)()
            .prepare(`INSERT INTO cf_inventory_section (cash_flow_id, opening_balance)
         VALUES (?, ?)
         ON CONFLICT(cash_flow_id) DO UPDATE SET opening_balance = excluded.opening_balance`)
            .run(cashFlowId, openingBalance);
    },
};
exports.cfInventoryPurchasesRepo = {
    listByCf(cashFlowId) {
        const rows = (0, database_1.getDb)()
            .prepare(`SELECT period_key, amount FROM cf_inventory_purchases WHERE cash_flow_id = ?`)
            .all(cashFlowId);
        const out = {};
        for (const r of rows)
            out[r.period_key] = r.amount;
        return out;
    },
    upsert(cashFlowId, periodKey, amount) {
        (0, database_1.getDb)()
            .prepare(`INSERT INTO cf_inventory_purchases (cash_flow_id, period_key, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(cash_flow_id, period_key) DO UPDATE SET amount = excluded.amount`)
            .run(cashFlowId, periodKey, amount);
    },
};
/* ============================================================
   CF — Salaries & Benefits sub-repo (spec §6).
   Only O.B + January payment are persisted. Feb–Dec payments
   auto-derive from the prior month's Salaries expense (fixed
   30+ arrears).
   ============================================================ */
exports.cfSalariesSectionRepo = {
    get(cashFlowId) {
        const row = (0, database_1.getDb)()
            .prepare(`SELECT opening_balance, january_payment FROM cf_salaries_section WHERE cash_flow_id = ?`)
            .get(cashFlowId);
        return {
            openingBalance: row?.opening_balance ?? 0,
            januaryPayment: row?.january_payment ?? 0,
        };
    },
    upsert(cashFlowId, fields) {
        const current = this.get(cashFlowId);
        const ob = fields.openingBalance !== undefined ? fields.openingBalance : current.openingBalance;
        const jp = fields.januaryPayment !== undefined ? fields.januaryPayment : current.januaryPayment;
        (0, database_1.getDb)()
            .prepare(`INSERT INTO cf_salaries_section (cash_flow_id, opening_balance, january_payment)
         VALUES (?, ?, ?)
         ON CONFLICT(cash_flow_id) DO UPDATE SET
            opening_balance = excluded.opening_balance,
            january_payment = excluded.january_payment`)
            .run(cashFlowId, ob, jp);
    },
};
/* ============================================================
   CF — Manual rows (Other Adjustments §7, Financing §8, Capex §9).
   All three sections share identical UX: free-text description
   + 12 monthly amounts (signed). FY column is computed at read
   time as the sum of the period amounts.
   ============================================================ */
exports.CF_MANUAL_KINDS = ['other_adj', 'financing', 'capex'];
function toClientManualRow(r, amounts) {
    return {
        id: r.id,
        cashFlowId: r.cash_flow_id,
        kind: r.kind,
        description: r.description,
        orderIndex: r.order_index,
        amounts,
    };
}
exports.cfManualRowRepo = {
    listByCfAndKind(cashFlowId, kind) {
        const db = (0, database_1.getDb)();
        const rows = db
            .prepare(`SELECT id, cash_flow_id, kind, description, order_index, created_at, updated_at
         FROM cf_manual_rows
         WHERE cash_flow_id = ? AND kind = ?
         ORDER BY order_index ASC, created_at ASC`)
            .all(cashFlowId, kind);
        if (rows.length === 0)
            return [];
        const ids = rows.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const amts = db
            .prepare(`SELECT cf_manual_row_id, period_key, amount
         FROM cf_manual_row_amounts
         WHERE cf_manual_row_id IN (${placeholders})`)
            .all(...ids);
        const byRow = new Map();
        for (const a of amts) {
            const m = byRow.get(a.cf_manual_row_id) || {};
            m[a.period_key] = a.amount;
            byRow.set(a.cf_manual_row_id, m);
        }
        return rows.map(r => toClientManualRow(r, byRow.get(r.id) || {}));
    },
    create(cashFlowId, kind, description = '') {
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        const db = (0, database_1.getDb)();
        const maxRow = db
            .prepare(`SELECT COALESCE(MAX(order_index), -1) AS max_idx
         FROM cf_manual_rows WHERE cash_flow_id = ? AND kind = ?`)
            .get(cashFlowId, kind);
        const orderIndex = (maxRow?.max_idx ?? -1) + 1;
        db.prepare(`INSERT INTO cf_manual_rows
         (id, cash_flow_id, kind, description, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, cashFlowId, kind, description, orderIndex, now, now);
        return {
            id, cashFlowId, kind, description, orderIndex, amounts: {},
        };
    },
    getById(id) {
        const db = (0, database_1.getDb)();
        const r = db
            .prepare(`SELECT id, cash_flow_id, kind, description, order_index, created_at, updated_at
         FROM cf_manual_rows WHERE id = ?`)
            .get(id);
        if (!r)
            return null;
        const amts = db
            .prepare(`SELECT cf_manual_row_id, period_key, amount FROM cf_manual_row_amounts WHERE cf_manual_row_id = ?`)
            .all(id);
        const map = {};
        for (const a of amts)
            map[a.period_key] = a.amount;
        return toClientManualRow(r, map);
    },
    updateDescription(id, description) {
        const now = new Date().toISOString();
        (0, database_1.getDb)()
            .prepare(`UPDATE cf_manual_rows SET description = ?, updated_at = ? WHERE id = ?`)
            .run(description, now, id);
    },
    upsertAmount(rowId, periodKey, amount) {
        (0, database_1.getDb)()
            .prepare(`INSERT INTO cf_manual_row_amounts (cf_manual_row_id, period_key, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(cf_manual_row_id, period_key) DO UPDATE SET amount = excluded.amount`)
            .run(rowId, periodKey, amount);
    },
    delete(id) {
        (0, database_1.getDb)().prepare(`DELETE FROM cf_manual_rows WHERE id = ?`).run(id);
    },
};
