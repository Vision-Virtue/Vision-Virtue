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
} from '../db/visibility.repository';
import { parseGLBuffer, ParseError } from '../services/gl-parser.service';

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

  /** POST /api/visibility/budgets/:id/lines */
  createLine(req: Request, res: Response): void {
    const key = resolveCustomerKey(req);
    if (!key) { send401(res, 'Missing or invalid customer key.'); return; }
    const budget = budgetRepo.getById(req.params.id);
    if (!budget || budget.customerKeyId !== key.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    const line = budgetLineRepo.create(budget.id, 'manual');
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
