/* ============================================================
   Visibility offering — Controller (Phase 1: Financial Structure)
   ============================================================ */

import { Request, Response } from 'express';
import { z } from 'zod';
import { customerKeyRepo, CustomerKeyRow } from '../db/partner.repository';
import {
  glAccountRepo,
  financialStructureRepo,
  GLAccountRow,
  orgEntityRepo,
  orgStructureRepo,
  OrgEntityRow,
  ORG_DIMENSIONS,
  OrgDimension,
  budgetRepo,
  budgetLineRepo,
  budgetCellRepo,
  BudgetRow,
  BudgetLineRow,
  GRANULARITIES,
  CURRENCIES,
  SCALES,
  Granularity,
  BUDGET_CAP_PER_CUSTOMER,
  periodKeysFor,
  salariesRowRepo,
  salariesStateRepo,
  SalariesRow,
  cashFlowRepo,
  CashFlowRow,
} from '../db/visibility.repository';
import { parseGLBuffer, parseSBBuffer, ParseError } from '../services/gl-parser.service';
import { validateAndPivotSalaries, pivotEntryToCells } from '../services/salaries.service';
import {
  computePivot,
  rollUpCells,
  periodKeysForDisplay,
  DisplayGranularity,
  BudgetLineWithCells,
  PivotFilters,
} from '../services/pivot.service';
import { buildBudgetExport } from '../services/budget-export.service';

// ─── Constants from spec §2.3 (single source of truth, mirrored on FE) ─────

export const PL_SECTIONS = [
  'Revenues', 'COGS', 'R&D', 'S&M', 'G&A',
  'Financial Income/(Expenses)', 'Tax', 'Other Income/(Expenses)',
] as const;
type PLSection = typeof PL_SECTIONS[number];

const YOUR_BUDGET = 'Your Budget Category';

export const BUDGET_CATEGORIES_BY_SECTION: Record<PLSection, readonly string[]> = {
  'Revenues':                       ['License', 'Subscription', 'POC/NRE', 'Maintenance', 'Support', 'Other', YOUR_BUDGET],
  'COGS':                           ['Salaries and benefits', 'Subcontractors', 'Materials', 'Cloud/Hosting', 'Royalties', 'Depreciation', 'Other', YOUR_BUDGET],
  'R&D':                            ['Salaries and benefits', 'Subcontractors', 'Tools/Licenses', 'Cloud/Hosting', 'Materials', 'Travel', 'Other', YOUR_BUDGET],
  'S&M':                            ['Salaries and benefits', 'Marketing', 'Conferences', 'Travel', 'Commissions', 'Advertising', 'Other', YOUR_BUDGET],
  'G&A':                            ['Salaries and benefits', 'Professional services', 'Office', 'Insurance', 'Travel', 'Other', YOUR_BUDGET],
  'Financial Income/(Expenses)':    ['Interest income', 'Interest expense', 'FX', 'Bank fees', 'Other', YOUR_BUDGET],
  'Tax':                            ['Current tax', 'Deferred tax', 'Other', YOUR_BUDGET],
  'Other Income/(Expenses)':        ['One-time gains', 'One-time losses', 'Other', YOUR_BUDGET],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveCustomerKey(req: Request): CustomerKeyRow | null {
  // Allow either header or ?key= query (for routes that take a binary body
  // and want to keep the request "simple" CORS-wise — matches the admin-pin
  // pattern in this codebase).
  const fromHeader = req.header('x-customer-key');
  const fromQuery  = typeof req.query.key === 'string' ? req.query.key : '';
  const key        = (fromHeader || fromQuery).trim();
  if (!key) return null;
  return customerKeyRepo.findByKey(key);
}

function send401(res: Response, message: string): void {
  res.status(401).json({ error: { code: 'CUSTOMER_KEY_INVALID', message } });
}

function serializeGL(row: GLAccountRow): Record<string, unknown> {
  return {
    id:                   row.id,
    glNumber:             row.glNumber,
    glName:               row.glName,
    plSection:            row.plSection,
    budgetCategory:       row.budgetCategory,
    budgetCategoryCustom: row.budgetCategoryCustom,
    orphan:               row.orphan,
  };
}

// ─── Controller ─────────────────────────────────────────────────────────────

export const visibilityController = {
  /**
   * GET /api/visibility/dropdowns
   * Returns the conditional P&L → Budget Category source-of-truth so
   * the UI doesn't have to duplicate the table from §2.3.
   */
  dropdowns(_req: Request, res: Response): void {
    res.json({
      plSections: PL_SECTIONS,
      budgetCategoriesBySection: BUDGET_CATEGORIES_BY_SECTION,
      yourBudgetCategoryToken: YOUR_BUDGET,
    });
  },

  /**
   * GET /api/visibility/financial-structure
   * Returns the customer's GL list + Financial Structure status.
   */
  getFinancialStructure(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const rows = glAccountRepo.listByCustomer(key.id);
    res.json({
      status:       financialStructureRepo.getStatus(key.id),
      glAccounts:   rows.map(serializeGL),
      orphanCount:  rows.filter(r => r.orphan).length,
    });
  },

  /**
   * POST /api/visibility/gl/upload
   * Body: raw .xlsx or .csv bytes. Optional ?filename= hint helps us
   * decide between xlsx parsing and CSV parsing.
   */
  async uploadGL(req: Request, res: Response): Promise<void> {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }

    const buf = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: { code: 'EMPTY_BODY', message: 'No file uploaded.' } });
      return;
    }
    const filename = typeof req.query.filename === 'string' ? req.query.filename : '';

    let parsed;
    try {
      parsed = await parseGLBuffer(buf, filename);
    } catch (err) {
      if (err instanceof ParseError) {
        res.status(400).json({ error: { code: 'PARSE_ERROR', message: err.userMessage } });
      } else {
        console.error('[visibility] GL parse failed:', err);
        res.status(400).json({
          error: { code: 'PARSE_ERROR', message: err instanceof Error ? err.message : 'Could not parse file.' },
        });
      }
      return;
    }

    const result = glAccountRepo.applyUpload(key.id, parsed.rows);
    // An upload always re-opens the Financial Structure for editing —
    // mappings might need adjustment for newly-added GLs.
    financialStructureRepo.setStatus(key.id, 'editing');
    res.json({
      status:        'editing',
      uploaded:      parsed.rows.length,
      inserted:      result.inserted,
      updated:       result.updated,
      newlyOrphaned: result.orphaned,
      glAccounts:    result.all.map(serializeGL),
      orphanCount:   result.all.filter(r => r.orphan).length,
    });
  },

  /**
   * PATCH /api/visibility/gl/:id
   * Body: { plSection?, budgetCategory?, budgetCategoryCustom? }
   * Updates one GL row's mapping. Frontend calls this on every change.
   */
  updateGL(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }

    const existing = glAccountRepo.getById(req.params.id);
    if (!existing || existing.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'GL row not found.' } });
      return;
    }

    const Schema = z.object({
      plSection:            z.string().nullable().optional(),
      budgetCategory:       z.string().nullable().optional(),
      budgetCategoryCustom: z.string().nullable().optional(),
    });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid mapping payload.' } });
      return;
    }

    // Validate the dropdown choices server-side. Empty string normalised
    // to null so the UI can clear a selection.
    //
    // PATCH is partial — fields absent from the payload should keep the
    // row's current value, so the cross-field validation (P&L required
    // before Budget Category, BC must be allowed under the P&L) operates
    // on the merged state, not on the patch alone.
    const norm = <T,>(v: T | null | undefined): T | null => (v === '' || v == null ? null : v);
    const has = <K extends keyof typeof parsed.data>(k: K): boolean => parsed.data[k] !== undefined;
    const patchedPL       = has('plSection')            ? norm(parsed.data.plSection)            : existing.plSection;
    const patchedBC       = has('budgetCategory')       ? norm(parsed.data.budgetCategory)       : existing.budgetCategory;
    const patchedBCCustom = has('budgetCategoryCustom') ? norm(parsed.data.budgetCategoryCustom) : existing.budgetCategoryCustom;

    if (patchedPL !== null && !(PL_SECTIONS as readonly string[]).includes(patchedPL)) {
      res.status(400).json({ error: { code: 'BAD_PL_SECTION', message: `Unknown P&L Section "${patchedPL}".` } });
      return;
    }
    if (patchedBC !== null && patchedPL === null) {
      res.status(400).json({ error: { code: 'PL_SECTION_REQUIRED', message: 'Pick a P&L Section before a Budget Category.' } });
      return;
    }
    if (patchedBC !== null && patchedPL !== null) {
      const allowed = BUDGET_CATEGORIES_BY_SECTION[patchedPL as PLSection];
      if (!allowed.includes(patchedBC)) {
        res.status(400).json({ error: { code: 'BAD_BUDGET_CATEGORY', message: `"${patchedBC}" is not allowed under ${patchedPL}.` } });
        return;
      }
    }
    // Free-text override is only meaningful when budgetCategory === Your Budget Category.
    const finalCustom = patchedBC === YOUR_BUDGET ? (patchedBCCustom ?? '') : null;

    // Persist only the fields that were actually in the patch — that
    // keeps the audit trail honest about what changed.
    const updated = glAccountRepo.updateMapping(req.params.id, {
      ...(has('plSection')            ? { plSection:            patchedPL } : {}),
      ...(has('budgetCategory')       ? { budgetCategory:       patchedBC } : {}),
      ...(has('budgetCategoryCustom') || has('budgetCategory')
        ? { budgetCategoryCustom: finalCustom }
        : {}),
    });
    if (!updated) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'GL row not found.' } });
      return;
    }
    res.json({ glAccount: serializeGL(updated) });
  },

  /**
   * DELETE /api/visibility/gl/:id
   * Lets the customer remove an orphan GL (or a row added by mistake).
   */
  deleteGL(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const existing = glAccountRepo.getById(req.params.id);
    if (!existing || existing.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'GL row not found.' } });
      return;
    }
    glAccountRepo.deleteById(req.params.id);
    res.json({ ok: true });
  },

  /**
   * POST /api/visibility/financial-structure/complete
   * Validates that every non-orphan GL has both a P&L Section AND a
   * Budget Category set, then flips status to 'completed'.
   */
  completeFinancialStructure(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }

    const rows = glAccountRepo.listByCustomer(key.id);
    if (rows.length === 0) {
      res.status(400).json({
        error: { code: 'NO_GL', message: 'Upload a GL list before completing.' },
      });
      return;
    }
    const incomplete = rows
      .filter(r => !r.orphan)
      .filter(r => !r.plSection || !r.budgetCategory ||
        (r.budgetCategory === YOUR_BUDGET && !r.budgetCategoryCustom));
    if (incomplete.length > 0) {
      res.status(400).json({
        error: {
          code: 'INCOMPLETE_MAPPINGS',
          message: `${incomplete.length} GL row(s) are missing a P&L Section, Budget Category, or custom name.`,
          glIds: incomplete.map(r => r.id),
        },
      });
      return;
    }
    financialStructureRepo.setStatus(key.id, 'completed');
    res.json({ status: 'completed' });
  },

  /**
   * POST /api/visibility/financial-structure/edit
   * Re-opens the Financial Structure for editing.
   */
  editFinancialStructure(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    financialStructureRepo.setStatus(key.id, 'editing');
    res.json({ status: 'editing' });
  },

  // ─── Phase 2 — Organizational Structure ──────────────────────────────────

  /**
   * GET /api/visibility/org-structure
   * Returns the customer's org entities (grouped by dimension) and
   * the current status.
   */
  getOrgStructure(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const all = orgEntityRepo.listByCustomer(key.id);
    const grouped: Record<OrgDimension, OrgEntityRow[]> = {
      company: [], division: [], department: [], product: [], activity: [],
    };
    for (const e of all) grouped[e.dimension].push(e);
    res.json({
      status:   orgStructureRepo.getStatus(key.id),
      entities: {
        company:    grouped.company.map(serializeOrg),
        division:   grouped.division.map(serializeOrg),
        department: grouped.department.map(serializeOrg),
        product:    grouped.product.map(serializeOrg),
        activity:   grouped.activity.map(serializeOrg),
      },
    });
  },

  /**
   * POST /api/visibility/org-structure/entities
   * Body: { dimension, name }
   */
  createOrgEntity(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const Schema = z.object({
      dimension: z.enum(ORG_DIMENSIONS),
      name:      z.string().trim().min(1).max(200),
    });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'dimension and name are required.' } });
      return;
    }
    const created = orgEntityRepo.create(key.id, parsed.data.dimension, parsed.data.name);
    res.status(201).json({ entity: serializeOrg(created) });
  },

  /**
   * PATCH /api/visibility/org-structure/entities/:id
   * Body: { name }
   */
  renameOrgEntity(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const existing = orgEntityRepo.getById(req.params.id);
    if (!existing || existing.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Entity not found.' } });
      return;
    }
    const Schema = z.object({ name: z.string().trim().min(1).max(200) });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name is required.' } });
      return;
    }
    const updated = orgEntityRepo.rename(req.params.id, parsed.data.name);
    res.json({ entity: updated ? serializeOrg(updated) : null });
  },

  /**
   * DELETE /api/visibility/org-structure/entities/:id
   * Drops the org entry. Cells referencing it on finalized budgets
   * render as blank per spec §3. The response includes a referenceCount
   * so the UI can confirm with the user before calling — though for
   * Phase 2 (no budgets yet) the count is always 0.
   */
  deleteOrgEntity(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const existing = orgEntityRepo.getById(req.params.id);
    if (!existing || existing.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Entity not found.' } });
      return;
    }
    const referenceCount = orgEntityRepo.countReferences(req.params.id);
    orgEntityRepo.deleteById(req.params.id);
    res.json({ ok: true, referenceCount });
  },

  /**
   * GET /api/visibility/org-structure/entities/:id/references
   * Returns the current reference count without deleting — used by the
   * UI to populate the delete-confirmation modal copy per spec §11.
   */
  getOrgEntityReferences(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const existing = orgEntityRepo.getById(req.params.id);
    if (!existing || existing.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Entity not found.' } });
      return;
    }
    res.json({ referenceCount: orgEntityRepo.countReferences(req.params.id) });
  },

  /**
   * POST /api/visibility/org-structure/complete
   * All five dimensions are optional, so this just flips status —
   * no minimum-count validation. Customers can complete an empty
   * Org Structure if they don't need dimensions.
   */
  completeOrgStructure(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    orgStructureRepo.setStatus(key.id, 'completed');
    res.json({ status: 'completed' });
  },

  /**
   * POST /api/visibility/org-structure/edit
   */
  editOrgStructure(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    orgStructureRepo.setStatus(key.id, 'editing');
    res.json({ status: 'editing' });
  },
};

function serializeOrg(row: OrgEntityRow): Record<string, unknown> {
  return {
    id:         row.id,
    dimension:  row.dimension,
    name:       row.name,
    orderIndex: row.orderIndex,
  };
}

// ─── Phase 3a — Budgets ──────────────────────────────────────────────────

function serializeBudget(row: BudgetRow): Record<string, unknown> {
  return {
    id:           row.id,
    name:         row.name,
    year:         row.year,
    granularity:  row.granularity,
    currency:     row.currency,
    scale:        row.scale,
    sbEnabled:    row.sbEnabled,
    status:       row.status,
    createdAt:    row.createdAt,
    updatedAt:    row.updatedAt,
  };
}

function serializeBudgetLine(row: BudgetLineRow, cells: Record<string, number>): Record<string, unknown> {
  return {
    id:                  row.id,
    companyId:           row.companyId,
    serviceProviderName: row.serviceProviderName,
    serviceDescription:  row.serviceDescription,
    divisionId:          row.divisionId,
    departmentId:        row.departmentId,
    productId:           row.productId,
    activityId:          row.activityId,
    glAccountId:         row.glAccountId,
    source:              row.source,
    orderIndex:          row.orderIndex,
    cells,
  };
}

const SetupSchema = z.object({
  name:        z.string().trim().max(200).optional(),
  year:        z.number().int().min(2020).max(2050),
  granularity: z.enum(GRANULARITIES),
  currency:    z.enum(CURRENCIES),
  scale:       z.enum(SCALES),
  sbEnabled:   z.boolean(),
});

export const budgetsController = {
  /** GET /api/visibility/budgets */
  list(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const budgets = budgetRepo.listByCustomer(key.id);
    res.json({
      budgets:     budgets.map(serializeBudget),
      cap:         BUDGET_CAP_PER_CUSTOMER,
      remaining:   Math.max(0, BUDGET_CAP_PER_CUSTOMER - budgets.length),
    });
  },

  /** POST /api/visibility/budgets — body = setup options. */
  create(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    if (budgetRepo.countByCustomer(key.id) >= BUDGET_CAP_PER_CUSTOMER) {
      res.status(400).json({
        error: {
          code: 'BUDGET_CAP_REACHED',
          message: `You already have ${BUDGET_CAP_PER_CUSTOMER} budgets. Delete one before creating a new one.`,
        },
      });
      return;
    }
    const parsed = SetupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid setup payload.' } });
      return;
    }
    const created = budgetRepo.create(key.id, {
      name:        parsed.data.name,
      year:        parsed.data.year,
      granularity: parsed.data.granularity,
      currency:    parsed.data.currency,
      scale:       parsed.data.scale,
      sbEnabled:   parsed.data.sbEnabled,
    });
    res.status(201).json({ budget: serializeBudget(created) });
  },

  /** GET /api/visibility/budgets/:id — full hydrated budget with lines+cells. */
  get(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const budget = budgetRepo.getById(req.params.id);
    if (!budget || budget.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    const lines = budgetLineRepo.listByBudget(budget.id);
    const hydrated = lines.map(l => serializeBudgetLine(l, budgetCellRepo.listByLine(l.id)));
    res.json({
      budget:     serializeBudget(budget),
      periodKeys: periodKeysFor(budget.granularity),
      lines:      hydrated,
    });
  },

  /** PATCH /api/visibility/budgets/:id — setup options + name + status. */
  patch(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const existing = budgetRepo.getById(req.params.id);
    if (!existing || existing.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    const Schema = z.object({
      name:        z.string().trim().max(200).optional(),
      year:        z.number().int().min(2020).max(2050).optional(),
      granularity: z.enum(GRANULARITIES).optional(),
      currency:    z.enum(CURRENCIES).optional(),
      scale:       z.enum(SCALES).optional(),
      sbEnabled:   z.boolean().optional(),
    });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid patch payload.' } });
      return;
    }

    // Granularity change → auto-aggregate / split each line's cells (§6).
    const newGran = parsed.data.granularity as Granularity | undefined;
    if (newGran && newGran !== existing.granularity) {
      const lines = budgetLineRepo.listByBudget(existing.id);
      for (const l of lines) {
        budgetCellRepo.remapForGranularity(l.id, existing.granularity, newGran);
      }
    }

    const updated = budgetRepo.update(existing.id, parsed.data);
    res.json({ budget: updated ? serializeBudget(updated) : null });
  },

  /** DELETE /api/visibility/budgets/:id */
  remove(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const existing = budgetRepo.getById(req.params.id);
    if (!existing || existing.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    budgetRepo.deleteById(existing.id);
    res.json({ ok: true });
  },

  /** POST /api/visibility/budgets/:id/finalize — body { name }. */
  finalize(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const existing = budgetRepo.getById(req.params.id);
    if (!existing || existing.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    const parsed = z.object({ name: z.string().trim().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'A name is required to finalize a budget.' } });
      return;
    }
    const updated = budgetRepo.update(existing.id, {
      name: parsed.data.name,
      status: 'finalized',
    });
    res.json({ budget: updated ? serializeBudget(updated) : null });
  },

  // ─── Lines ─────────────────────────────────────────────────

  /** POST /api/visibility/budgets/:id/lines  body: { afterId?: string } */
  createLine(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const budget = budgetRepo.getById(req.params.id);
    if (!budget || budget.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    const afterId = typeof req.body?.afterId === 'string' ? req.body.afterId : undefined;
    const line = budgetLineRepo.create(budget.id, 'manual', afterId);
    res.status(201).json({ line: serializeBudgetLine(line, {}) });
  },

  /** PATCH /api/visibility/budgets/:id/lines/:lineId */
  patchLine(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const budget = budgetRepo.getById(req.params.id);
    if (!budget || budget.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    const line = budgetLineRepo.getById(req.params.lineId);
    if (!line || line.budgetId !== budget.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Line not found.' } });
      return;
    }
    // Salaries-rolled-in lines are read-only on the metadata + cells
    // path — they're owned by the S&B pivot.
    if (line.source === 'salaries') {
      res.status(400).json({ error: { code: 'READONLY_LINE', message: 'Salaries lines are managed via the Salaries & Benefits tab.' } });
      return;
    }
    const Schema = z.object({
      companyId:            z.string().nullable().optional(),
      serviceProviderName:  z.string().max(200).optional(),
      serviceDescription:   z.string().max(500).optional(),
      divisionId:           z.string().nullable().optional(),
      departmentId:         z.string().nullable().optional(),
      productId:            z.string().nullable().optional(),
      activityId:           z.string().nullable().optional(),
      glAccountId:          z.string().nullable().optional(),
      cells:                z.record(z.number()).optional(),
    });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid line payload.' } });
      return;
    }
    // Validate org FKs belong to the same customer (light check).
    const checkOrgId = (id: string | null | undefined): boolean => {
      if (id == null || id === '') return true;
      const e = orgEntityRepo.getById(id);
      return !!e && e.customerKeyId === key.id;
    };
    for (const k of ['companyId','divisionId','departmentId','productId','activityId'] as const) {
      if (parsed.data[k] !== undefined && !checkOrgId(parsed.data[k] as string | null | undefined)) {
        res.status(400).json({ error: { code: 'BAD_ORG_REF', message: `${k} does not exist for this customer.` } });
        return;
      }
    }
    // Validate GL FK if provided.
    if (parsed.data.glAccountId !== undefined && parsed.data.glAccountId) {
      const gl = glAccountRepo.getById(parsed.data.glAccountId);
      if (!gl || gl.customerKeyId !== key.id) {
        res.status(400).json({ error: { code: 'BAD_GL_REF', message: 'Unknown GL account.' } });
        return;
      }
    }

    const { cells, ...meta } = parsed.data;
    const updatedLine = budgetLineRepo.update(line.id, meta);
    if (cells) {
      // Only accept period keys valid for this budget's granularity.
      const allowed = new Set(periodKeysFor(budget.granularity));
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(cells)) {
        if (allowed.has(k) && Number.isFinite(v)) clean[k] = v;
      }
      budgetCellRepo.setAllForLine(line.id, clean);
    }
    res.json({
      line: updatedLine ? serializeBudgetLine(updatedLine, budgetCellRepo.listByLine(line.id)) : null,
    });
  },

  /**
   * GET /api/visibility/budgets/:id/pivot
   * Query params:
   *   companies, divisions, departments, products, activities — each a
   *     comma-separated list of Org entity ids (omit / empty = all).
   *   display — monthly | quarterly | yearly (defaults to budget's
   *     native granularity; can only roll UP, not split down).
   * Returns the §8.2 P&L Pivot computation as JSON.
   */
  getPivot(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const budget = budgetRepo.getById(req.params.id);
    if (!budget || budget.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    const ctx = collectPivotContext(budget.id, key.id, req.query, budget.granularity);
    res.json(ctx.pivot);
  },

  /**
   * GET /api/visibility/budgets/:id/export
   * Same query params as /pivot. Streams an .xlsx containing both
   * Budget Structure (raw) and P&L Pivot sheets per spec §8.4.
   */
  async exportXlsx(req: Request, res: Response): Promise<void> {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const budget = budgetRepo.getById(req.params.id);
    if (!budget || budget.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    const ctx = collectPivotContext(budget.id, key.id, req.query, budget.granularity);
    const buf = await buildBudgetExport({
      budget,
      periodKeys: periodKeysFor(budget.granularity),
      lines: ctx.lineRows.map(l => ({ line: l, cells: budgetCellRepo.listByLine(l.id) })),
      glById: ctx.glById,
      orgById: ctx.orgById,
      pivot: ctx.pivot,
    });
    const safeName = (budget.name || 'budget').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    res.send(buf);
  },

  /** DELETE /api/visibility/budgets/:id/lines/:lineId */
  removeLine(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const budget = budgetRepo.getById(req.params.id);
    if (!budget || budget.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    const line = budgetLineRepo.getById(req.params.lineId);
    if (!line || line.budgetId !== budget.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Line not found.' } });
      return;
    }
    if (line.source === 'salaries') {
      res.status(400).json({ error: { code: 'READONLY_LINE', message: 'Salaries lines are managed via the Salaries & Benefits tab.' } });
      return;
    }
    budgetLineRepo.deleteById(line.id);
    res.json({ ok: true });
  },
};

// ─── Pivot context (shared by /pivot and /export) ────────────────────────

function parseIdList(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function parseDisplayGranularity(
  raw: unknown,
  budgetGran: 'monthly' | 'quarterly' | 'yearly',
): DisplayGranularity {
  const ALLOWED: DisplayGranularity[] = ['monthly', 'quarterly', 'yearly'];
  const want = typeof raw === 'string' ? raw : '';
  if (!(ALLOWED as string[]).includes(want)) return budgetGran;
  // The pivot can only roll up. monthly→quarterly/yearly, quarterly→yearly.
  // If a finer granularity than the budget is requested, fall back to budget's.
  const rank: Record<DisplayGranularity, number> = { monthly: 0, quarterly: 1, yearly: 2 };
  return rank[want as DisplayGranularity] >= rank[budgetGran] ? (want as DisplayGranularity) : budgetGran;
}

function collectPivotContext(
  budgetId: string,
  customerKeyId: string,
  query: Record<string, unknown>,
  budgetGran: 'monthly' | 'quarterly' | 'yearly',
) {
  // Load lines + cells.
  const lineRows = budgetLineRepo.listByBudget(budgetId);
  const linesWithCells: BudgetLineWithCells[] = lineRows.map(l => ({
    id:           l.id,
    companyId:    l.companyId,
    divisionId:   l.divisionId,
    departmentId: l.departmentId,
    productId:    l.productId,
    activityId:   l.activityId,
    glAccountId:  l.glAccountId,
    cells:        budgetCellRepo.listByLine(l.id),
  }));

  // Build GL + Org id lookups once.
  const glById = new Map(
    glAccountRepo.listByCustomer(customerKeyId).map(g => [g.id, g] as const),
  );
  const orgById = new Map(
    orgEntityRepo.listByCustomer(customerKeyId).map(e => [e.id, e] as const),
  );

  // Filters.
  const filters: PivotFilters = {
    companyIds:    parseIdList(query.companies),
    divisionIds:   parseIdList(query.divisions),
    departmentIds: parseIdList(query.departments),
    productIds:    parseIdList(query.products),
    activityIds:   parseIdList(query.activities),
    glAccountIds:  parseIdList(query.gls),
  };

  // Display granularity — roll up cells to the requested display
  // granularity before pivoting so the period columns match.
  const display = parseDisplayGranularity(query.display, budgetGran);
  const displayPeriods = periodKeysForDisplay(display);
  const linesRolled: BudgetLineWithCells[] = linesWithCells.map(l => ({
    ...l,
    cells: rollUpCells(l.cells, budgetGran, display),
  }));

  const pivot = computePivot(linesRolled, glById, filters, displayPeriods);

  return { lineRows, linesWithCells, glById, orgById, filters, display, pivot };
}

// ─── Phase 3b — Salaries & Benefits (spec §7) ────────────────────────────

function serializeSalary(row: SalariesRow): Record<string, unknown> {
  return {
    id:                  row.id,
    companyId:           row.companyId,
    employeeName:        row.employeeName,
    divisionId:          row.divisionId,
    departmentId:        row.departmentId,
    productId:           row.productId,
    activityId:          row.activityId,
    productActivityPct:  row.productActivityPct,
    monthlySalary:       row.monthlySalary,
    glAccountId:         row.glAccountId,
    orderIndex:          row.orderIndex,
  };
}

function requireBudget(req: Request, res: Response): { budget: BudgetRow; customerKeyId: string } | null {
  const key = resolveCustomerKey(req);
  if (!key) { send401(res, 'Missing or invalid customer key.'); return null; }
  const budget = budgetRepo.getById(req.params.id);
  if (!budget || budget.customerKeyId !== key.id) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
    return null;
  }
  return { budget, customerKeyId: key.id };
}

export const salariesController = {
  /** GET /api/visibility/budgets/:id/salaries */
  list(req: Request, res: Response): void {
    const ctx = requireBudget(req, res); if (!ctx) return;
    const rows = salariesRowRepo.listByBudget(ctx.budget.id);
    const validation = validateAndPivotSalaries(rows);
    res.json({
      status:        salariesStateRepo.getStatus(ctx.budget.id),
      sbEnabled:     ctx.budget.sbEnabled,
      rows:          rows.map(serializeSalary),
      errors:        validation.errors,
      warnings:      validation.warnings,
      pivotPreview:  validation.pivot.map(p => ({
        companyId: p.companyId, divisionId: p.divisionId, departmentId: p.departmentId,
        productId: p.productId, activityId: p.activityId, glAccountId: p.glAccountId,
        allocatedMonthlySalary: p.allocatedMonthlySalary,
        contributingRowIds: p.contributingRowIds,
      })),
    });
  },

  /** POST /api/visibility/budgets/:id/salaries  body: { afterId?: string } */
  createRow(req: Request, res: Response): void {
    const ctx = requireBudget(req, res); if (!ctx) return;
    const afterId = typeof req.body?.afterId === 'string' ? req.body.afterId : undefined;
    const created = salariesRowRepo.create(ctx.budget.id, undefined, afterId);
    res.status(201).json({ row: serializeSalary(created) });
  },

  /** PATCH /api/visibility/budgets/:id/salaries/:rowId */
  patchRow(req: Request, res: Response): void {
    const ctx = requireBudget(req, res); if (!ctx) return;
    const row = salariesRowRepo.getById(req.params.rowId);
    if (!row || row.budgetId !== ctx.budget.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Row not found.' } });
      return;
    }
    const Schema = z.object({
      companyId:           z.string().nullable().optional(),
      employeeName:        z.string().trim().max(200).optional(),
      divisionId:          z.string().nullable().optional(),
      departmentId:        z.string().nullable().optional(),
      productId:           z.string().nullable().optional(),
      activityId:          z.string().nullable().optional(),
      productActivityPct:  z.number().min(0).max(1000).optional(),
      monthlySalary:       z.number().min(0).optional(),
      glAccountId:         z.string().nullable().optional(),
    });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid salary patch.' } });
      return;
    }
    // Validate FKs scoped to this customer.
    const checkOrgId = (id: string | null | undefined): boolean => {
      if (id == null || id === '') return true;
      const e = orgEntityRepo.getById(id);
      return !!e && e.customerKeyId === ctx.customerKeyId;
    };
    for (const k of ['companyId','divisionId','departmentId','productId','activityId'] as const) {
      if (parsed.data[k] !== undefined && !checkOrgId(parsed.data[k] as string | null | undefined)) {
        res.status(400).json({ error: { code: 'BAD_ORG_REF', message: `${k} does not exist for this customer.` } });
        return;
      }
    }
    if (parsed.data.glAccountId !== undefined && parsed.data.glAccountId) {
      const gl = glAccountRepo.getById(parsed.data.glAccountId);
      if (!gl || gl.customerKeyId !== ctx.customerKeyId) {
        res.status(400).json({ error: { code: 'BAD_GL_REF', message: 'Unknown GL account.' } });
        return;
      }
    }
    const updated = salariesRowRepo.update(row.id, parsed.data);
    res.json({ row: updated ? serializeSalary(updated) : null });
  },

  /** DELETE /api/visibility/budgets/:id/salaries/:rowId */
  removeRow(req: Request, res: Response): void {
    const ctx = requireBudget(req, res); if (!ctx) return;
    const row = salariesRowRepo.getById(req.params.rowId);
    if (!row || row.budgetId !== ctx.budget.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Row not found.' } });
      return;
    }
    salariesRowRepo.deleteById(row.id);
    res.json({ ok: true });
  },

  /**
   * POST /api/visibility/budgets/:id/salaries/upload
   * Raw .xlsx or .csv body. Optional ?filename= hint.
   * Bulk-inserts rows seeded with (employeeName, monthlySalary, departmentId?).
   * If column C matches an existing Department entity by name (case-insensitive),
   * the row's department_id is linked; otherwise the value is dropped (the
   * customer can fill it in manually). This is the "shortcut" upload per §7.2.
   */
  async upload(req: Request, res: Response): Promise<void> {
    const ctx = requireBudget(req, res); if (!ctx) return;
    const buf = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: { code: 'EMPTY_BODY', message: 'No file uploaded.' } });
      return;
    }
    const filename = typeof req.query.filename === 'string' ? req.query.filename : '';
    let parsed;
    try {
      parsed = await parseSBBuffer(buf, filename);
    } catch (err) {
      if (err instanceof ParseError) {
        res.status(400).json({ error: { code: 'PARSE_ERROR', message: err.userMessage } });
      } else {
        res.status(400).json({ error: { code: 'PARSE_ERROR', message: err instanceof Error ? err.message : 'Could not parse file.' } });
      }
      return;
    }
    // Match Company and Department names against the customer's Org
    // Structure exactly (case-insensitive, trimmed). ANY mismatch
    // blocks the upload — no rows are inserted.
    const allOrg = orgEntityRepo.listByCustomer(ctx.customerKeyId);
    const companyByName = new Map(
      allOrg.filter(e => e.dimension === 'company').map(c => [c.name.trim().toLowerCase(), c.id]),
    );
    const departmentByName = new Map(
      allOrg.filter(e => e.dimension === 'department').map(d => [d.name.trim().toLowerCase(), d.id]),
    );

    const unmappedCompanies = new Set<string>();
    const unmappedDepartments = new Set<string>();
    for (const r of parsed) {
      if (!companyByName.has(r.companyName.trim().toLowerCase())) {
        unmappedCompanies.add(r.companyName);
      }
      if (!departmentByName.has(r.departmentName.trim().toLowerCase())) {
        unmappedDepartments.add(r.departmentName);
      }
    }
    if (unmappedCompanies.size > 0 || unmappedDepartments.size > 0) {
      const parts: string[] = [];
      if (unmappedCompanies.size > 0) {
        parts.push(`Company name${unmappedCompanies.size === 1 ? '' : 's'} not in Organizational Structure: ${[...unmappedCompanies].map(s => `"${s}"`).join(', ')}`);
      }
      if (unmappedDepartments.size > 0) {
        parts.push(`Department name${unmappedDepartments.size === 1 ? '' : 's'} not in Organizational Structure: ${[...unmappedDepartments].map(s => `"${s}"`).join(', ')}`);
      }
      res.status(400).json({
        error: {
          code: 'UNMAPPED_NAMES',
          message:
            `Upload blocked — every Company in column A and Department in column D must exactly match an entry in your Organizational Structure. ` +
            parts.join('. ') + '.',
          unmappedCompanies:   [...unmappedCompanies],
          unmappedDepartments: [...unmappedDepartments],
        },
      });
      return;
    }

    // All names match — compute monthly salary = employer's cost / FX,
    // then REPLACE every existing salary row for this budget with the
    // freshly-uploaded set (spec: re-uploading refreshes the table).
    const existing = salariesRowRepo.listByBudget(ctx.budget.id);
    for (const row of existing) salariesRowRepo.deleteById(row.id);

    const seeded: Partial<SalariesRow>[] = parsed.map(r => ({
      companyId:     companyByName.get(r.companyName.trim().toLowerCase()) ?? null,
      employeeName:  r.employeeName,
      departmentId:  departmentByName.get(r.departmentName.trim().toLowerCase()) ?? null,
      monthlySalary: r.employersCost / r.exchangeRate,
    }));
    const created = salariesRowRepo.bulkInsert(ctx.budget.id, seeded);
    res.json({
      inserted: created.length,
      replaced: existing.length,
      rows:     created.map(serializeSalary),
    });
  },

  /**
   * POST /api/visibility/budgets/:id/salaries/finalize
   * Runs the validation pipeline; on success replaces every existing
   * source='salaries' budget_line under this budget with the freshly
   * pivoted set, and flips status to 'finalized'.
   */
  finalize(req: Request, res: Response): void {
    const ctx = requireBudget(req, res); if (!ctx) return;
    const rows = salariesRowRepo.listByBudget(ctx.budget.id);
    if (rows.length === 0) {
      res.status(400).json({ error: { code: 'EMPTY_SB', message: 'Add at least one salary row before finalizing.' } });
      return;
    }
    const result = validateAndPivotSalaries(rows);
    if (result.errors.length > 0) {
      res.status(400).json({
        error: {
          code: 'SB_VALIDATION',
          message: `${result.errors.length} validation error${result.errors.length === 1 ? '' : 's'} — fix them before finalizing.`,
          errors:   result.errors,
          warnings: result.warnings,
        },
      });
      return;
    }

    // Replace existing salaries lines with the freshly pivoted set.
    const existingLines = budgetLineRepo.listByBudget(ctx.budget.id).filter(l => l.source === 'salaries');
    for (const l of existingLines) budgetLineRepo.deleteById(l.id);

    for (const p of result.pivot) {
      const line = budgetLineRepo.create(ctx.budget.id, 'salaries');
      budgetLineRepo.update(line.id, {
        companyId:    p.companyId,
        divisionId:   p.divisionId,
        departmentId: p.departmentId,
        productId:    p.productId,
        activityId:   p.activityId,
        glAccountId:  p.glAccountId,
        serviceProviderName: 'Employees Salaries',
        serviceDescription:  'Employees Salaries',
      });
      const cells = pivotEntryToCells(p.allocatedMonthlySalary, ctx.budget.granularity);
      budgetCellRepo.setAllForLine(line.id, cells);
    }
    salariesStateRepo.setStatus(ctx.budget.id, 'finalized');
    res.json({
      status:    'finalized',
      warnings:  result.warnings,
      pivotCount: result.pivot.length,
    });
  },

  /** POST /api/visibility/budgets/:id/salaries/edit */
  edit(req: Request, res: Response): void {
    const ctx = requireBudget(req, res); if (!ctx) return;
    salariesStateRepo.setStatus(ctx.budget.id, 'editing');
    res.json({ status: 'editing' });
  },
};

/* ============================================================
   CF (Cash Flow) controller — Phase 1: scaffolding.
   Only get-or-create exposed; sections/forecast/dashboard come
   in later phases.
   ============================================================ */

function serializeCashFlow(row: CashFlowRow): Record<string, unknown> {
  return {
    id:          row.id,
    budgetId:    row.budgetId,
    openingCash: row.openingCash,
    status:      row.status,
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  };
}

export const cashFlowController = {
  /**
   * GET /api/visibility/budgets/:id/cf
   * CF is read-only-linked to a finalized budget (spec §10).
   * If the budget is still a draft, return 409 so the FE can
   * show "Finalize the budget first" guidance.
   */
  getOrCreate(req: Request, res: Response): void {
    const ctx = requireBudget(req, res); if (!ctx) return;
    if (ctx.budget.status !== 'finalized') {
      res.status(409).json({
        error: {
          code: 'BUDGET_NOT_FINALIZED',
          message: 'Finalize the budget before opening Cash Flow.',
        },
      });
      return;
    }
    const cf = cashFlowRepo.ensureForBudget(ctx.budget.id);
    res.json({
      cf:         serializeCashFlow(cf),
      budget:     serializeBudget(ctx.budget),
      periodKeys: periodKeysFor(ctx.budget.granularity),
    });
  },
};
