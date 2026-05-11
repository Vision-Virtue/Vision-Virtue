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
    fields: { plSection?: string | null; budgetCategory?: string | null; budgetCategoryCustom?: string | null },
  ): GLAccountRow | null {
    const sets: string[] = [];
    const vals: Array<string | null> = [];
    if (fields.plSection !== undefined)            { sets.push('pl_section = ?');             vals.push(fields.plSection); }
    if (fields.budgetCategory !== undefined)       { sets.push('budget_category = ?');        vals.push(fields.budgetCategory); }
    if (fields.budgetCategoryCustom !== undefined) { sets.push('budget_category_custom = ?'); vals.push(fields.budgetCategoryCustom); }
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
