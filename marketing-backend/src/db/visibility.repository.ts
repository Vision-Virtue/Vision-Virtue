/* ============================================================
   Visibility offering — DB repositories.
   Tables: gl_accounts, financial_structure_state.
   ============================================================ */

import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';

export interface GLAccountRow {
  id: string;
  customerKeyId: string;
  glNumber: string;
  glName: string;
  plSection: string | null;
  budgetCategory: string | null;
  budgetCategoryCustom: string | null;
  inventoryRelated: boolean;
  orderIndex: number;
  orphan: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DbGLAccountRow {
  id: string;
  customer_key_id: string;
  gl_number: string;
  gl_name: string;
  pl_section: string | null;
  budget_category: string | null;
  budget_category_custom: string | null;
  inventory_related: number;
  order_index: number;
  orphan: number;
  created_at: string;
  updated_at: string;
}

function toDomain(r: DbGLAccountRow): GLAccountRow {
  return {
    id:                   r.id,
    customerKeyId:        r.customer_key_id,
    glNumber:             r.gl_number,
    glName:               r.gl_name,
    plSection:            r.pl_section,
    budgetCategory:       r.budget_category,
    budgetCategoryCustom: r.budget_category_custom,
    inventoryRelated:     r.inventory_related === 1,
    orderIndex:           r.order_index,
    orphan:               r.orphan === 1,
    createdAt:            r.created_at,
    updatedAt:            r.updated_at,
  };
}

export const glAccountRepo = {
  listByCustomer(customerKeyId: string): GLAccountRow[] {
    const rows = getDb()
      .prepare(`SELECT * FROM gl_accounts WHERE customer_key_id = ?
                ORDER BY order_index ASC, gl_number ASC`)
      .all(customerKeyId) as DbGLAccountRow[];
    return rows.map(toDomain);
  },

  getById(id: string): GLAccountRow | null {
    const row = getDb()
      .prepare(`SELECT * FROM gl_accounts WHERE id = ?`)
      .get(id) as DbGLAccountRow | undefined;
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
  applyUpload(
    customerKeyId: string,
    upload: Array<{ glNumber: string; glName: string }>,
  ): { all: GLAccountRow[]; inserted: number; updated: number; orphaned: number } {
    const db   = getDb();
    const now  = new Date().toISOString();

    const existing = this.listByCustomer(customerKeyId);
    const byNumber = new Map<string, GLAccountRow>();
    for (const r of existing) byNumber.set(r.glNumber, r);

    const uploadSet = new Set(upload.map(u => u.glNumber));

    const insert = db.prepare(
      `INSERT INTO gl_accounts
         (id, customer_key_id, gl_number, gl_name, pl_section, budget_category,
          budget_category_custom, order_index, orphan, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 0, ?, ?)`,
    );
    const updateName = db.prepare(
      `UPDATE gl_accounts
          SET gl_name = ?, order_index = ?, orphan = 0, updated_at = ?
        WHERE id = ?`,
    );
    const flagOrphan = db.prepare(
      `UPDATE gl_accounts SET orphan = 1, updated_at = ? WHERE id = ?`,
    );

    let inserted = 0;
    let updated  = 0;
    let orphaned = 0;

    const tx = db.transaction(() => {
      let i = 0;
      for (const u of upload) {
        const existingRow = byNumber.get(u.glNumber);
        if (existingRow) {
          updateName.run(u.glName, i, now, existingRow.id);
          updated++;
        } else {
          insert.run(uuidv4(), customerKeyId, u.glNumber, u.glName, i, now, now);
          inserted++;
        }
        i++;
      }
      // Existing rows not in the upload → orphan.
      for (const r of existing) {
        if (!uploadSet.has(r.glNumber)) {
          flagOrphan.run(now, r.id);
          if (!r.orphan) orphaned++;
        }
      }
    });
    tx();

    return { all: this.listByCustomer(customerKeyId), inserted, updated, orphaned };
  },

  updateMapping(
    id: string,
    fields: {
      plSection?: string | null;
      budgetCategory?: string | null;
      budgetCategoryCustom?: string | null;
      inventoryRelated?: boolean;
    },
  ): GLAccountRow | null {
    const sets: string[] = [];
    const vals: Array<string | number | null> = [];
    if (fields.plSection !== undefined)            { sets.push('pl_section = ?');             vals.push(fields.plSection); }
    if (fields.budgetCategory !== undefined)       { sets.push('budget_category = ?');        vals.push(fields.budgetCategory); }
    if (fields.budgetCategoryCustom !== undefined) { sets.push('budget_category_custom = ?'); vals.push(fields.budgetCategoryCustom); }
    if (fields.inventoryRelated !== undefined)     { sets.push('inventory_related = ?');      vals.push(fields.inventoryRelated ? 1 : 0); }
    if (sets.length === 0) return this.getById(id);
    sets.push('updated_at = ?');
    vals.push(new Date().toISOString());
    vals.push(id);
    getDb()
      .prepare(`UPDATE gl_accounts SET ${sets.join(', ')} WHERE id = ?`)
      .run(...vals);
    return this.getById(id);
  },

  deleteById(id: string): void {
    getDb().prepare(`DELETE FROM gl_accounts WHERE id = ?`).run(id);
  },
};

// ─── Financial Structure status ─────────────────────────────────────────────

export type FSStatus = 'editing' | 'completed';

export const financialStructureRepo = {
  getStatus(customerKeyId: string): FSStatus {
    const row = getDb()
      .prepare(`SELECT status FROM financial_structure_state WHERE customer_key_id = ?`)
      .get(customerKeyId) as { status: FSStatus } | undefined;
    return row?.status ?? 'editing';
  },
  setStatus(customerKeyId: string, status: FSStatus): void {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO financial_structure_state (customer_key_id, status, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(customer_key_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      )
      .run(customerKeyId, status, now);
  },
};

// ─── Org Structure (Phase 2) ────────────────────────────────────────────────

export const ORG_DIMENSIONS = ['company', 'division', 'department', 'product', 'activity'] as const;
export type OrgDimension = typeof ORG_DIMENSIONS[number];

export interface OrgEntityRow {
  id: string;
  customerKeyId: string;
  dimension: OrgDimension;
  name: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

interface DbOrgEntityRow {
  id: string;
  customer_key_id: string;
  dimension: OrgDimension;
  name: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

function toOrgDomain(r: DbOrgEntityRow): OrgEntityRow {
  return {
    id:            r.id,
    customerKeyId: r.customer_key_id,
    dimension:     r.dimension,
    name:          r.name,
    orderIndex:    r.order_index,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  };
}

export const orgEntityRepo = {
  listByCustomer(customerKeyId: string): OrgEntityRow[] {
    const rows = getDb()
      .prepare(`SELECT * FROM org_entities WHERE customer_key_id = ?
                ORDER BY dimension ASC, order_index ASC, created_at ASC`)
      .all(customerKeyId) as DbOrgEntityRow[];
    return rows.map(toOrgDomain);
  },

  getById(id: string): OrgEntityRow | null {
    const row = getDb()
      .prepare(`SELECT * FROM org_entities WHERE id = ?`)
      .get(id) as DbOrgEntityRow | undefined;
    return row ? toOrgDomain(row) : null;
  },

  create(
    customerKeyId: string,
    dimension: OrgDimension,
    name: string,
  ): OrgEntityRow {
    const id = uuidv4();
    const now = new Date().toISOString();
    // Place new entries at the end of their dimension list.
    const maxIdx = (getDb()
      .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m
                  FROM org_entities WHERE customer_key_id = ? AND dimension = ?`)
      .get(customerKeyId, dimension) as { m: number }).m;
    getDb()
      .prepare(
        `INSERT INTO org_entities
           (id, customer_key_id, dimension, name, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, customerKeyId, dimension, name, maxIdx + 1, now, now);
    return this.getById(id)!;
  },

  rename(id: string, name: string): OrgEntityRow | null {
    getDb()
      .prepare(`UPDATE org_entities SET name = ?, updated_at = ? WHERE id = ?`)
      .run(name, new Date().toISOString(), id);
    return this.getById(id);
  },

  deleteById(id: string): void {
    getDb().prepare(`DELETE FROM org_entities WHERE id = ?`).run(id);
  },

  /**
   * Count of budget rows / Salaries rows currently referencing this org
   * entity. Until Phase 3 ships those tables don't exist yet — return 0
   * so the delete-confirmation modal can already be wired on the
   * frontend without blocking on the budget layer.
   */
  countReferences(_id: string): number {
    // Placeholder for Phase 3 — wire up to BudgetLine / SalariesRow once
    // those tables are introduced.
    return 0;
  },
};

// ─── Org Structure status ───────────────────────────────────────────────────

export type OSStatus = 'editing' | 'completed';

export const orgStructureRepo = {
  getStatus(customerKeyId: string): OSStatus {
    const row = getDb()
      .prepare(`SELECT status FROM org_structure_state WHERE customer_key_id = ?`)
      .get(customerKeyId) as { status: OSStatus } | undefined;
    return row?.status ?? 'editing';
  },
  setStatus(customerKeyId: string, status: OSStatus): void {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO org_structure_state (customer_key_id, status, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(customer_key_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      )
      .run(customerKeyId, status, now);
  },
};

// ─── Budgets (Phase 3a) ─────────────────────────────────────────────────────

export const GRANULARITIES = ['monthly', 'quarterly', 'yearly'] as const;
export type Granularity = typeof GRANULARITIES[number];
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS'] as const;
export type Currency = typeof CURRENCIES[number];
export const SCALES = ['standard', 'thousands'] as const;
export type Scale = typeof SCALES[number];
export type BudgetStatus = 'draft' | 'finalized';

export const BUDGET_CAP_PER_CUSTOMER = 5; // spec §5.4

/** Period keys for a given granularity. */
export function periodKeysFor(granularity: Granularity): string[] {
  switch (granularity) {
    case 'monthly':   return ['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];
    case 'quarterly': return ['Q1','Q2','Q3','Q4'];
    case 'yearly':    return ['FY'];
  }
}

export interface BudgetRow {
  id: string;
  customerKeyId: string;
  name: string;
  year: number;
  granularity: Granularity;
  currency: Currency;
  scale: Scale;
  sbEnabled: boolean;
  status: BudgetStatus;
  createdAt: string;
  updatedAt: string;
}

interface DbBudgetRow {
  id: string;
  customer_key_id: string;
  name: string;
  year: number;
  granularity: Granularity;
  currency: Currency;
  scale: Scale;
  sb_enabled: number;
  status: BudgetStatus;
  created_at: string;
  updated_at: string;
}

function toBudgetDomain(r: DbBudgetRow): BudgetRow {
  return {
    id:            r.id,
    customerKeyId: r.customer_key_id,
    name:          r.name,
    year:          r.year,
    granularity:   r.granularity,
    currency:      r.currency,
    scale:         r.scale,
    sbEnabled:     r.sb_enabled === 1,
    status:        r.status,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  };
}

export interface BudgetLineRow {
  id: string;
  budgetId: string;
  companyId: string | null;
  serviceProviderName: string;
  serviceDescription: string;
  divisionId: string | null;
  departmentId: string | null;
  productId: string | null;
  activityId: string | null;
  glAccountId: string | null;
  source: 'manual' | 'salaries';
  orderIndex: number;
}

interface DbBudgetLineRow {
  id: string;
  budget_id: string;
  company_id: string | null;
  service_provider_name: string;
  service_description: string;
  division_id: string | null;
  department_id: string | null;
  product_id: string | null;
  activity_id: string | null;
  gl_account_id: string | null;
  source: 'manual' | 'salaries';
  order_index: number;
}

function toBudgetLineDomain(r: DbBudgetLineRow): BudgetLineRow {
  return {
    id:                  r.id,
    budgetId:            r.budget_id,
    companyId:           r.company_id,
    serviceProviderName: r.service_provider_name,
    serviceDescription:  r.service_description,
    divisionId:          r.division_id,
    departmentId:        r.department_id,
    productId:           r.product_id,
    activityId:          r.activity_id,
    glAccountId:         r.gl_account_id,
    source:              r.source,
    orderIndex:          r.order_index,
  };
}

export const budgetRepo = {
  listByCustomer(customerKeyId: string): BudgetRow[] {
    const rows = getDb()
      .prepare(`SELECT * FROM budgets WHERE customer_key_id = ?
                ORDER BY updated_at DESC`)
      .all(customerKeyId) as DbBudgetRow[];
    return rows.map(toBudgetDomain);
  },

  countByCustomer(customerKeyId: string): number {
    const row = getDb()
      .prepare(`SELECT COUNT(*) AS n FROM budgets WHERE customer_key_id = ?`)
      .get(customerKeyId) as { n: number };
    return row.n;
  },

  getById(id: string): BudgetRow | null {
    const row = getDb()
      .prepare(`SELECT * FROM budgets WHERE id = ?`)
      .get(id) as DbBudgetRow | undefined;
    return row ? toBudgetDomain(row) : null;
  },

  create(
    customerKeyId: string,
    setup: {
      name?: string;
      year: number;
      granularity: Granularity;
      currency: Currency;
      scale: Scale;
      sbEnabled: boolean;
    },
  ): BudgetRow {
    const id = uuidv4();
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO budgets
           (id, customer_key_id, name, year, granularity, currency, scale,
            sb_enabled, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .run(
        id, customerKeyId, setup.name ?? '', setup.year, setup.granularity,
        setup.currency, setup.scale, setup.sbEnabled ? 1 : 0, now, now,
      );
    return this.getById(id)!;
  },

  /** Partial update — pass only fields you want to change. */
  update(
    id: string,
    fields: Partial<{
      name: string; year: number; granularity: Granularity;
      currency: Currency; scale: Scale; sbEnabled: boolean;
      status: BudgetStatus;
    }>,
  ): BudgetRow | null {
    const sets: string[] = [];
    const vals: Array<string | number> = [];
    if (fields.name        !== undefined) { sets.push('name = ?');         vals.push(fields.name); }
    if (fields.year        !== undefined) { sets.push('year = ?');         vals.push(fields.year); }
    if (fields.granularity !== undefined) { sets.push('granularity = ?');  vals.push(fields.granularity); }
    if (fields.currency    !== undefined) { sets.push('currency = ?');     vals.push(fields.currency); }
    if (fields.scale       !== undefined) { sets.push('scale = ?');        vals.push(fields.scale); }
    if (fields.sbEnabled   !== undefined) { sets.push('sb_enabled = ?');   vals.push(fields.sbEnabled ? 1 : 0); }
    if (fields.status      !== undefined) { sets.push('status = ?');       vals.push(fields.status); }
    if (sets.length === 0) return this.getById(id);
    sets.push('updated_at = ?');
    vals.push(new Date().toISOString());
    vals.push(id);
    getDb()
      .prepare(`UPDATE budgets SET ${sets.join(', ')} WHERE id = ?`)
      .run(...vals);
    return this.getById(id);
  },

  deleteById(id: string): void {
    getDb().prepare(`DELETE FROM budgets WHERE id = ?`).run(id);
  },
};

export const budgetLineRepo = {
  listByBudget(budgetId: string): BudgetLineRow[] {
    const rows = getDb()
      .prepare(`SELECT * FROM budget_lines WHERE budget_id = ?
                ORDER BY order_index ASC, created_at ASC`)
      .all(budgetId) as DbBudgetLineRow[];
    return rows.map(toBudgetLineDomain);
  },

  getById(id: string): BudgetLineRow | null {
    const row = getDb()
      .prepare(`SELECT * FROM budget_lines WHERE id = ?`)
      .get(id) as DbBudgetLineRow | undefined;
    return row ? toBudgetLineDomain(row) : null;
  },

  create(budgetId: string, source: 'manual' | 'salaries' = 'manual', afterId?: string): BudgetLineRow {
    const id = uuidv4();
    const now = new Date().toISOString();
    let insertAt: number;
    if (afterId) {
      const ex = getDb()
        .prepare(`SELECT order_index FROM budget_lines WHERE id = ? AND budget_id = ?`)
        .get(afterId, budgetId) as { order_index: number } | undefined;
      if (ex) {
        insertAt = ex.order_index + 1;
        getDb()
          .prepare(`UPDATE budget_lines SET order_index = order_index + 1 WHERE budget_id = ? AND order_index >= ?`)
          .run(budgetId, insertAt);
      } else {
        insertAt = ((getDb()
          .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM budget_lines WHERE budget_id = ?`)
          .get(budgetId) as { m: number }).m) + 1;
      }
    } else {
      insertAt = ((getDb()
        .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM budget_lines WHERE budget_id = ?`)
        .get(budgetId) as { m: number }).m) + 1;
    }
    getDb()
      .prepare(
        `INSERT INTO budget_lines
           (id, budget_id, source, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, budgetId, source, insertAt, now, now);
    return this.getById(id)!;
  },

  update(
    id: string,
    fields: Partial<{
      companyId: string | null;
      serviceProviderName: string;
      serviceDescription: string;
      divisionId: string | null;
      departmentId: string | null;
      productId: string | null;
      activityId: string | null;
      glAccountId: string | null;
    }>,
  ): BudgetLineRow | null {
    const sets: string[] = [];
    const vals: Array<string | null> = [];
    const norm = (v: string | null | undefined): string | null => (v === '' || v == null ? null : v);
    if (fields.companyId           !== undefined) { sets.push('company_id = ?');             vals.push(norm(fields.companyId)); }
    if (fields.serviceProviderName !== undefined) { sets.push('service_provider_name = ?');  vals.push(fields.serviceProviderName); }
    if (fields.serviceDescription  !== undefined) { sets.push('service_description = ?');    vals.push(fields.serviceDescription); }
    if (fields.divisionId          !== undefined) { sets.push('division_id = ?');            vals.push(norm(fields.divisionId)); }
    if (fields.departmentId        !== undefined) { sets.push('department_id = ?');          vals.push(norm(fields.departmentId)); }
    if (fields.productId           !== undefined) { sets.push('product_id = ?');             vals.push(norm(fields.productId)); }
    if (fields.activityId          !== undefined) { sets.push('activity_id = ?');            vals.push(norm(fields.activityId)); }
    if (fields.glAccountId         !== undefined) { sets.push('gl_account_id = ?');          vals.push(norm(fields.glAccountId)); }
    if (sets.length === 0) return this.getById(id);
    sets.push('updated_at = ?');
    vals.push(new Date().toISOString());
    vals.push(id);
    getDb()
      .prepare(`UPDATE budget_lines SET ${sets.join(', ')} WHERE id = ?`)
      .run(...vals);
    return this.getById(id);
  },

  deleteById(id: string): void {
    getDb().prepare(`DELETE FROM budget_lines WHERE id = ?`).run(id);
  },
};

export const budgetCellRepo = {
  listByLine(lineId: string): Record<string, number> {
    const rows = getDb()
      .prepare(`SELECT period_key, amount FROM budget_cells WHERE budget_line_id = ?`)
      .all(lineId) as Array<{ period_key: string; amount: number }>;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.period_key] = r.amount;
    return out;
  },

  /** Upsert one cell. */
  setCell(lineId: string, periodKey: string, amount: number): void {
    getDb()
      .prepare(
        `INSERT INTO budget_cells (budget_line_id, period_key, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(budget_line_id, period_key)
         DO UPDATE SET amount = excluded.amount`,
      )
      .run(lineId, periodKey, amount);
  },

  /** Replace all cells for a line in one transaction. */
  setAllForLine(lineId: string, cells: Record<string, number>): void {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM budget_cells WHERE budget_line_id = ?`).run(lineId);
      const insert = db.prepare(
        `INSERT INTO budget_cells (budget_line_id, period_key, amount) VALUES (?, ?, ?)`,
      );
      for (const [k, v] of Object.entries(cells)) {
        insert.run(lineId, k, v);
      }
    });
    tx();
  },

  /** Re-aggregate cells when the budget granularity changes (spec §6). */
  remapForGranularity(lineId: string, from: Granularity, to: Granularity): void {
    if (from === to) return;
    const existing = this.listByLine(lineId);
    let next: Record<string, number> = {};
    if (from === 'monthly' && to === 'quarterly') {
      next = {
        Q1: (existing.M01 || 0) + (existing.M02 || 0) + (existing.M03 || 0),
        Q2: (existing.M04 || 0) + (existing.M05 || 0) + (existing.M06 || 0),
        Q3: (existing.M07 || 0) + (existing.M08 || 0) + (existing.M09 || 0),
        Q4: (existing.M10 || 0) + (existing.M11 || 0) + (existing.M12 || 0),
      };
    } else if (from === 'monthly' && to === 'yearly') {
      const fy = ['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12']
        .reduce((s, k) => s + (existing[k] || 0), 0);
      next = { FY: fy };
    } else if (from === 'quarterly' && to === 'yearly') {
      next = { FY: (existing.Q1||0)+(existing.Q2||0)+(existing.Q3||0)+(existing.Q4||0) };
    } else if (from === 'quarterly' && to === 'monthly') {
      // Even-split within each quarter (spec §6 / §11).
      const split = (q: number): number[] => [q/3, q/3, q/3];
      const [a, b, c] = split(existing.Q1 || 0);
      const [d, e, f] = split(existing.Q2 || 0);
      const [g, h, i] = split(existing.Q3 || 0);
      const [j, k, l] = split(existing.Q4 || 0);
      next = { M01:a, M02:b, M03:c, M04:d, M05:e, M06:f, M07:g, M08:h, M09:i, M10:j, M11:k, M12:l };
    } else if (from === 'yearly' && to === 'quarterly') {
      const q = (existing.FY || 0) / 4;
      next = { Q1: q, Q2: q, Q3: q, Q4: q };
    } else if (from === 'yearly' && to === 'monthly') {
      const m = (existing.FY || 0) / 12;
      next = { M01:m, M02:m, M03:m, M04:m, M05:m, M06:m, M07:m, M08:m, M09:m, M10:m, M11:m, M12:m };
    }
    this.setAllForLine(lineId, next);
  },
};

// ─── Salaries & Benefits (Phase 3b, spec §7) ────────────────────────────────

export interface SalariesRow {
  id: string;
  budgetId: string;
  companyId: string | null;
  employeeName: string;
  divisionId: string | null;
  departmentId: string | null;
  productId: string | null;
  activityId: string | null;
  productActivityPct: number;
  monthlySalary: number;
  glAccountId: string | null;
  orderIndex: number;
}

interface DbSalariesRow {
  id: string;
  budget_id: string;
  company_id: string | null;
  employee_name: string;
  division_id: string | null;
  department_id: string | null;
  product_id: string | null;
  activity_id: string | null;
  product_activity_pct: number;
  monthly_salary: number;
  gl_account_id: string | null;
  order_index: number;
}

function toSalariesDomain(r: DbSalariesRow): SalariesRow {
  return {
    id:                  r.id,
    budgetId:            r.budget_id,
    companyId:           r.company_id,
    employeeName:        r.employee_name,
    divisionId:          r.division_id,
    departmentId:        r.department_id,
    productId:           r.product_id,
    activityId:          r.activity_id,
    productActivityPct:  r.product_activity_pct,
    monthlySalary:       r.monthly_salary,
    glAccountId:         r.gl_account_id,
    orderIndex:          r.order_index,
  };
}

export const salariesRowRepo = {
  listByBudget(budgetId: string): SalariesRow[] {
    const rows = getDb()
      .prepare(`SELECT * FROM salaries_rows WHERE budget_id = ?
                ORDER BY order_index ASC, created_at ASC`)
      .all(budgetId) as DbSalariesRow[];
    return rows.map(toSalariesDomain);
  },

  getById(id: string): SalariesRow | null {
    const row = getDb()
      .prepare(`SELECT * FROM salaries_rows WHERE id = ?`)
      .get(id) as DbSalariesRow | undefined;
    return row ? toSalariesDomain(row) : null;
  },

  create(budgetId: string, seed?: Partial<{
    companyId: string | null; employeeName: string; divisionId: string | null;
    departmentId: string | null; productId: string | null; activityId: string | null;
    productActivityPct: number; monthlySalary: number; glAccountId: string | null;
  }>, afterId?: string): SalariesRow {
    const id = uuidv4();
    const now = new Date().toISOString();
    let insertAt: number;
    if (afterId) {
      const ex = getDb()
        .prepare(`SELECT order_index FROM salaries_rows WHERE id = ? AND budget_id = ?`)
        .get(afterId, budgetId) as { order_index: number } | undefined;
      if (ex) {
        insertAt = ex.order_index + 1;
        getDb()
          .prepare(`UPDATE salaries_rows SET order_index = order_index + 1 WHERE budget_id = ? AND order_index >= ?`)
          .run(budgetId, insertAt);
      } else {
        insertAt = ((getDb()
          .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM salaries_rows WHERE budget_id = ?`)
          .get(budgetId) as { m: number }).m) + 1;
      }
    } else {
      insertAt = ((getDb()
        .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM salaries_rows WHERE budget_id = ?`)
        .get(budgetId) as { m: number }).m) + 1;
    }
    getDb()
      .prepare(
        `INSERT INTO salaries_rows
           (id, budget_id, company_id, employee_name, division_id, department_id,
            product_id, activity_id, product_activity_pct, monthly_salary,
            gl_account_id, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, budgetId,
        seed?.companyId ?? null,
        seed?.employeeName ?? '',
        seed?.divisionId ?? null,
        seed?.departmentId ?? null,
        seed?.productId ?? null,
        seed?.activityId ?? null,
        seed?.productActivityPct ?? 0,
        seed?.monthlySalary ?? 0,
        seed?.glAccountId ?? null,
        insertAt, now, now,
      );
    return this.getById(id)!;
  },

  update(
    id: string,
    fields: Partial<{
      companyId: string | null; employeeName: string;
      divisionId: string | null; departmentId: string | null;
      productId: string | null; activityId: string | null;
      productActivityPct: number; monthlySalary: number;
      glAccountId: string | null;
    }>,
  ): SalariesRow | null {
    const norm = (v: string | null | undefined): string | null => (v === '' || v == null ? null : v);
    const sets: string[] = [];
    const vals: Array<string | number | null> = [];
    if (fields.companyId           !== undefined) { sets.push('company_id = ?');            vals.push(norm(fields.companyId)); }
    if (fields.employeeName        !== undefined) { sets.push('employee_name = ?');         vals.push(fields.employeeName); }
    if (fields.divisionId          !== undefined) { sets.push('division_id = ?');           vals.push(norm(fields.divisionId)); }
    if (fields.departmentId        !== undefined) { sets.push('department_id = ?');         vals.push(norm(fields.departmentId)); }
    if (fields.productId           !== undefined) { sets.push('product_id = ?');            vals.push(norm(fields.productId)); }
    if (fields.activityId          !== undefined) { sets.push('activity_id = ?');           vals.push(norm(fields.activityId)); }
    if (fields.productActivityPct  !== undefined) { sets.push('product_activity_pct = ?');  vals.push(fields.productActivityPct); }
    if (fields.monthlySalary       !== undefined) { sets.push('monthly_salary = ?');        vals.push(fields.monthlySalary); }
    if (fields.glAccountId         !== undefined) { sets.push('gl_account_id = ?');         vals.push(norm(fields.glAccountId)); }
    if (sets.length === 0) return this.getById(id);
    sets.push('updated_at = ?');
    vals.push(new Date().toISOString());
    vals.push(id);
    getDb()
      .prepare(`UPDATE salaries_rows SET ${sets.join(', ')} WHERE id = ?`)
      .run(...vals);
    return this.getById(id);
  },

  deleteById(id: string): void {
    getDb().prepare(`DELETE FROM salaries_rows WHERE id = ?`).run(id);
  },

  bulkInsert(budgetId: string, items: Array<Partial<SalariesRow>>): SalariesRow[] {
    const created: SalariesRow[] = [];
    for (const it of items) created.push(this.create(budgetId, it));
    return created;
  },
};

export type SBStatus = 'editing' | 'finalized';

export const salariesStateRepo = {
  getStatus(budgetId: string): SBStatus {
    const row = getDb()
      .prepare(`SELECT status FROM salaries_state WHERE budget_id = ?`)
      .get(budgetId) as { status: SBStatus } | undefined;
    return row?.status ?? 'editing';
  },
  setStatus(budgetId: string, status: SBStatus): void {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO salaries_state (budget_id, status, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(budget_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      )
      .run(budgetId, status, now);
  },
};

/* ============================================================
   CF (Cash Flow) module — per spec §15.
   One CashFlow per finalized budget. Subordinate sections
   (payables / receivables / inventory / salaries / manual)
   are added in later phases.
   ============================================================ */

export type CashFlowStatus = 'draft' | 'finalized';

export interface CashFlowRow {
  id: string;
  budgetId: string;
  openingCash: number;
  status: CashFlowStatus;
  createdAt: string;
  updatedAt: string;
}

interface DbCashFlowRow {
  id: string;
  budget_id: string;
  opening_cash: number;
  status: CashFlowStatus;
  created_at: string;
  updated_at: string;
}

function toCashFlowDomain(r: DbCashFlowRow): CashFlowRow {
  return {
    id:          r.id,
    budgetId:    r.budget_id,
    openingCash: r.opening_cash,
    status:      r.status,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  };
}

export const cashFlowRepo = {
  getByBudget(budgetId: string): CashFlowRow | null {
    const row = getDb()
      .prepare(`SELECT * FROM cash_flows WHERE budget_id = ?`)
      .get(budgetId) as DbCashFlowRow | undefined;
    return row ? toCashFlowDomain(row) : null;
  },

  /** Returns the existing CF for this budget, creating a draft if none. */
  ensureForBudget(budgetId: string): CashFlowRow {
    const existing = this.getByBudget(budgetId);
    if (existing) return existing;
    const id  = uuidv4();
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO cash_flows (id, budget_id, opening_cash, status, created_at, updated_at)
         VALUES (?, ?, 0, 'draft', ?, ?)`,
      )
      .run(id, budgetId, now, now);
    return {
      id, budgetId, openingCash: 0, status: 'draft',
      createdAt: now, updatedAt: now,
    };
  },

  updateOpeningCash(id: string, openingCash: number): void {
    const now = new Date().toISOString();
    getDb()
      .prepare(`UPDATE cash_flows SET opening_cash = ?, updated_at = ? WHERE id = ?`)
      .run(openingCash, now, id);
  },

  setStatus(id: string, status: CashFlowStatus): void {
    const now = new Date().toISOString();
    getDb()
      .prepare(`UPDATE cash_flows SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, now, id);
  },
};

/* ============================================================
   CF — Payables sub-repos (spec §3)
   ============================================================ */

export const PAYMENT_TERMS = ['Cash', 'Current', '30+', '60+', '90+', '120+', '180+'] as const;
export type PaymentTerm = typeof PAYMENT_TERMS[number];

export const cfPayablesSectionRepo = {
  get(cashFlowId: string): { openingBalance: number } {
    const row = getDb()
      .prepare(`SELECT opening_balance FROM cf_payables_section WHERE cash_flow_id = ?`)
      .get(cashFlowId) as { opening_balance: number } | undefined;
    return { openingBalance: row?.opening_balance ?? 0 };
  },
  upsert(cashFlowId: string, openingBalance: number): void {
    getDb()
      .prepare(
        `INSERT INTO cf_payables_section (cash_flow_id, opening_balance)
         VALUES (?, ?)
         ON CONFLICT(cash_flow_id) DO UPDATE SET opening_balance = excluded.opening_balance`,
      )
      .run(cashFlowId, openingBalance);
  },
};

export interface CfPayablesRow {
  id: string;
  cashFlowId: string;
  companyId: string | null;
  plSection: string | null;
  budgetCategory: string | null;
  glAccountId: string | null;
  serviceProviderName: string | null;
  paymentTerm: PaymentTerm | null;
  orderIndex: number;
}

interface DbCfPayablesRow {
  id: string;
  cash_flow_id: string;
  company_id: string | null;
  pl_section: string | null;
  budget_category: string | null;
  gl_account_id: string | null;
  service_provider_name: string | null;
  payment_term: PaymentTerm | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

function toPayablesRowDomain(r: DbCfPayablesRow): CfPayablesRow {
  return {
    id:                  r.id,
    cashFlowId:          r.cash_flow_id,
    companyId:           r.company_id,
    plSection:           r.pl_section,
    budgetCategory:      r.budget_category,
    glAccountId:         r.gl_account_id,
    serviceProviderName: r.service_provider_name,
    paymentTerm:         r.payment_term,
    orderIndex:          r.order_index,
  };
}

export const cfPayablesRowRepo = {
  listByCf(cashFlowId: string): CfPayablesRow[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM cf_payables_rows WHERE cash_flow_id = ?
         ORDER BY order_index ASC, created_at ASC`,
      )
      .all(cashFlowId) as DbCfPayablesRow[];
    return rows.map(toPayablesRowDomain);
  },

  getById(id: string): CfPayablesRow | null {
    const row = getDb()
      .prepare(`SELECT * FROM cf_payables_rows WHERE id = ?`)
      .get(id) as DbCfPayablesRow | undefined;
    return row ? toPayablesRowDomain(row) : null;
  },

  /**
   * Find a default-level row (gl_account_id = NULL, service_provider_name
   * = NULL) for the given (cf, company, P&L, category) tuple. Creates it
   * if absent. Returns the row.
   */
  findOrCreateDefault(
    cashFlowId: string,
    companyId: string | null,
    plSection: string,
    budgetCategory: string,
    orderIndex: number,
  ): CfPayablesRow {
    const db = getDb();
    const existing = db
      .prepare(
        `SELECT * FROM cf_payables_rows
          WHERE cash_flow_id = ?
            AND (company_id IS ? OR company_id = ?)
            AND pl_section = ?
            AND budget_category = ?
            AND gl_account_id IS NULL
            AND service_provider_name IS NULL`,
      )
      .get(cashFlowId, companyId, companyId, plSection, budgetCategory) as DbCfPayablesRow | undefined;
    if (existing) return toPayablesRowDomain(existing);
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO cf_payables_rows
         (id, cash_flow_id, company_id, pl_section, budget_category,
          gl_account_id, service_provider_name, payment_term,
          order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
    ).run(id, cashFlowId, companyId, plSection, budgetCategory, orderIndex, now, now);
    return this.getById(id)!;
  },

  updatePaymentTerm(id: string, term: PaymentTerm | null): void {
    const now = new Date().toISOString();
    getDb()
      .prepare(`UPDATE cf_payables_rows SET payment_term = ?, updated_at = ? WHERE id = ?`)
      .run(term, now, id);
  },

  /**
   * Inventory-Purchases synthetic row. Reuses cf_payables_rows + the
   * existing prior-carry table by parking under sentinel keys so that
   * the regular (Company, P&L, Budget Category) lookup never collides.
   */
  findOrCreateInventoryPurchases(cashFlowId: string, orderIndex: number): CfPayablesRow {
    const db = getDb();
    const existing = db
      .prepare(
        `SELECT * FROM cf_payables_rows
          WHERE cash_flow_id = ?
            AND pl_section = '__INVENTORY__'
            AND company_id IS NULL
            AND gl_account_id IS NULL
            AND service_provider_name IS NULL`,
      )
      .get(cashFlowId) as DbCfPayablesRow | undefined;
    if (existing) return toPayablesRowDomain(existing);
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO cf_payables_rows
         (id, cash_flow_id, company_id, pl_section, budget_category,
          gl_account_id, service_provider_name, payment_term,
          order_index, created_at, updated_at)
       VALUES (?, ?, NULL, '__INVENTORY__', '__PURCHASES__', NULL, NULL, NULL, ?, ?, ?)`,
    ).run(id, cashFlowId, orderIndex, now, now);
    return this.getById(id)!;
  },
};

export const cfPayablesPriorCarryRepo = {
  listByRow(rowId: string): Record<string, number> {
    const rows = getDb()
      .prepare(`SELECT period_key, amount FROM cf_payables_prior_carry WHERE cf_payables_row_id = ?`)
      .all(rowId) as Array<{ period_key: string; amount: number }>;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.period_key] = r.amount;
    return out;
  },
  upsert(rowId: string, periodKey: string, amount: number): void {
    getDb()
      .prepare(
        `INSERT INTO cf_payables_prior_carry (cf_payables_row_id, period_key, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(cf_payables_row_id, period_key) DO UPDATE SET amount = excluded.amount`,
      )
      .run(rowId, periodKey, amount);
  },
};

/* ============================================================
   CF — Receivables sub-repos (spec §4). Same shape as Payables
   with customer_name instead of service_provider_name and
   pl_section pinned to 'Revenues'.
   ============================================================ */

export const cfReceivablesSectionRepo = {
  get(cashFlowId: string): { openingBalance: number } {
    const row = getDb()
      .prepare(`SELECT opening_balance FROM cf_receivables_section WHERE cash_flow_id = ?`)
      .get(cashFlowId) as { opening_balance: number } | undefined;
    return { openingBalance: row?.opening_balance ?? 0 };
  },
  upsert(cashFlowId: string, openingBalance: number): void {
    getDb()
      .prepare(
        `INSERT INTO cf_receivables_section (cash_flow_id, opening_balance)
         VALUES (?, ?)
         ON CONFLICT(cash_flow_id) DO UPDATE SET opening_balance = excluded.opening_balance`,
      )
      .run(cashFlowId, openingBalance);
  },
};

export interface CfReceivablesRow {
  id: string;
  cashFlowId: string;
  companyId: string | null;
  plSection: string | null;
  budgetCategory: string | null;
  glAccountId: string | null;
  customerName: string | null;
  paymentTerm: PaymentTerm | null;
  orderIndex: number;
}

interface DbCfReceivablesRow {
  id: string;
  cash_flow_id: string;
  company_id: string | null;
  pl_section: string | null;
  budget_category: string | null;
  gl_account_id: string | null;
  customer_name: string | null;
  payment_term: PaymentTerm | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

function toReceivablesRowDomain(r: DbCfReceivablesRow): CfReceivablesRow {
  return {
    id:             r.id,
    cashFlowId:     r.cash_flow_id,
    companyId:      r.company_id,
    plSection:      r.pl_section,
    budgetCategory: r.budget_category,
    glAccountId:    r.gl_account_id,
    customerName:   r.customer_name,
    paymentTerm:    r.payment_term,
    orderIndex:     r.order_index,
  };
}

export const cfReceivablesRowRepo = {
  listByCf(cashFlowId: string): CfReceivablesRow[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM cf_receivables_rows WHERE cash_flow_id = ?
         ORDER BY order_index ASC, created_at ASC`,
      )
      .all(cashFlowId) as DbCfReceivablesRow[];
    return rows.map(toReceivablesRowDomain);
  },

  getById(id: string): CfReceivablesRow | null {
    const row = getDb()
      .prepare(`SELECT * FROM cf_receivables_rows WHERE id = ?`)
      .get(id) as DbCfReceivablesRow | undefined;
    return row ? toReceivablesRowDomain(row) : null;
  },

  /** Find or create the default-level (no GL, no Customer) row for
   *  (cf, company, budget category) — Receivables groups by Company
   *  × Budget Category at the default level (P&L is always
   *  'Revenues'). */
  findOrCreateDefault(
    cashFlowId: string,
    companyId: string | null,
    budgetCategory: string,
    orderIndex: number,
  ): CfReceivablesRow {
    const db = getDb();
    const existing = db
      .prepare(
        `SELECT * FROM cf_receivables_rows
          WHERE cash_flow_id = ?
            AND (company_id IS ? OR company_id = ?)
            AND budget_category = ?
            AND gl_account_id IS NULL
            AND customer_name IS NULL`,
      )
      .get(cashFlowId, companyId, companyId, budgetCategory) as DbCfReceivablesRow | undefined;
    if (existing) return toReceivablesRowDomain(existing);
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO cf_receivables_rows
         (id, cash_flow_id, company_id, pl_section, budget_category, gl_account_id,
          customer_name, payment_term, order_index, created_at, updated_at)
       VALUES (?, ?, ?, 'Revenues', ?, NULL, NULL, NULL, ?, ?, ?)`,
    ).run(id, cashFlowId, companyId, budgetCategory, orderIndex, now, now);
    return this.getById(id)!;
  },

  updatePaymentTerm(id: string, term: PaymentTerm | null): void {
    const now = new Date().toISOString();
    getDb()
      .prepare(`UPDATE cf_receivables_rows SET payment_term = ?, updated_at = ? WHERE id = ?`)
      .run(term, now, id);
  },
};

export const cfReceivablesPriorCarryRepo = {
  listByRow(rowId: string): Record<string, number> {
    const rows = getDb()
      .prepare(`SELECT period_key, amount FROM cf_receivables_prior_carry WHERE cf_receivables_row_id = ?`)
      .all(rowId) as Array<{ period_key: string; amount: number }>;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.period_key] = r.amount;
    return out;
  },
  upsert(rowId: string, periodKey: string, amount: number): void {
    getDb()
      .prepare(
        `INSERT INTO cf_receivables_prior_carry (cf_receivables_row_id, period_key, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(cf_receivables_row_id, period_key) DO UPDATE SET amount = excluded.amount`,
      )
      .run(rowId, periodKey, amount);
  },
};

/* ============================================================
   CF — Inventory sub-repos (spec §5). No per-row allocation;
   just O.B + per-period purchases.
   ============================================================ */

export const cfInventorySectionRepo = {
  get(cashFlowId: string): { openingBalance: number } {
    const row = getDb()
      .prepare(`SELECT opening_balance FROM cf_inventory_section WHERE cash_flow_id = ?`)
      .get(cashFlowId) as { opening_balance: number } | undefined;
    return { openingBalance: row?.opening_balance ?? 0 };
  },
  upsert(cashFlowId: string, openingBalance: number): void {
    getDb()
      .prepare(
        `INSERT INTO cf_inventory_section (cash_flow_id, opening_balance)
         VALUES (?, ?)
         ON CONFLICT(cash_flow_id) DO UPDATE SET opening_balance = excluded.opening_balance`,
      )
      .run(cashFlowId, openingBalance);
  },
};

export const cfInventoryPurchasesRepo = {
  listByCf(cashFlowId: string): Record<string, number> {
    const rows = getDb()
      .prepare(`SELECT period_key, amount FROM cf_inventory_purchases WHERE cash_flow_id = ?`)
      .all(cashFlowId) as Array<{ period_key: string; amount: number }>;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.period_key] = r.amount;
    return out;
  },
  upsert(cashFlowId: string, periodKey: string, amount: number): void {
    getDb()
      .prepare(
        `INSERT INTO cf_inventory_purchases (cash_flow_id, period_key, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(cash_flow_id, period_key) DO UPDATE SET amount = excluded.amount`,
      )
      .run(cashFlowId, periodKey, amount);
  },
};

/* ============================================================
   CF — Salaries & Benefits sub-repo (spec §6).
   Only O.B + January payment are persisted. Feb–Dec payments
   auto-derive from the prior month's Salaries expense (fixed
   30+ arrears).
   ============================================================ */

export const cfSalariesSectionRepo = {
  get(cashFlowId: string): { openingBalance: number; januaryPayment: number } {
    const row = getDb()
      .prepare(`SELECT opening_balance, january_payment FROM cf_salaries_section WHERE cash_flow_id = ?`)
      .get(cashFlowId) as { opening_balance: number; january_payment: number } | undefined;
    return {
      openingBalance:  row?.opening_balance ?? 0,
      januaryPayment:  row?.january_payment ?? 0,
    };
  },
  upsert(cashFlowId: string, fields: { openingBalance?: number; januaryPayment?: number }): void {
    const current = this.get(cashFlowId);
    const ob = fields.openingBalance !== undefined ? fields.openingBalance : current.openingBalance;
    const jp = fields.januaryPayment !== undefined ? fields.januaryPayment : current.januaryPayment;
    getDb()
      .prepare(
        `INSERT INTO cf_salaries_section (cash_flow_id, opening_balance, january_payment)
         VALUES (?, ?, ?)
         ON CONFLICT(cash_flow_id) DO UPDATE SET
            opening_balance = excluded.opening_balance,
            january_payment = excluded.january_payment`,
      )
      .run(cashFlowId, ob, jp);
  },
};
