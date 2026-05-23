"use strict";
/* ============================================================
   Visibility offering — Controller (Phase 1: Financial Structure)
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cfPayablesController = exports.cashFlowController = exports.salariesController = exports.budgetsController = exports.visibilityController = exports.BUDGET_CATEGORIES_BY_SECTION = exports.PL_SECTIONS = void 0;
const zod_1 = require("zod");
const partner_repository_1 = require("../db/partner.repository");
const visibility_repository_1 = require("../db/visibility.repository");
const gl_parser_service_1 = require("../services/gl-parser.service");
const salaries_service_1 = require("../services/salaries.service");
const pivot_service_1 = require("../services/pivot.service");
const budget_export_service_1 = require("../services/budget-export.service");
const cf_payables_service_1 = require("../services/cf-payables.service");
// ─── Constants from spec §2.3 (single source of truth, mirrored on FE) ─────
exports.PL_SECTIONS = [
    'Revenues', 'COGS', 'R&D', 'S&M', 'G&A',
    'Financial Income/(Expenses)', 'Tax', 'Other Income/(Expenses)',
];
const YOUR_BUDGET = 'Your Budget Category';
exports.BUDGET_CATEGORIES_BY_SECTION = {
    'Revenues': ['License', 'Subscription', 'POC/NRE', 'Maintenance', 'Support', 'Other', YOUR_BUDGET],
    'COGS': ['Salaries and benefits', 'Subcontractors', 'Materials', 'Cloud/Hosting', 'Royalties', 'Depreciation', 'Other', YOUR_BUDGET],
    'R&D': ['Salaries and benefits', 'Subcontractors', 'Tools/Licenses', 'Cloud/Hosting', 'Materials', 'Travel', 'Other', YOUR_BUDGET],
    'S&M': ['Salaries and benefits', 'Marketing', 'Conferences', 'Travel', 'Commissions', 'Advertising', 'Other', YOUR_BUDGET],
    'G&A': ['Salaries and benefits', 'Professional services', 'Office', 'Insurance', 'Travel', 'Other', YOUR_BUDGET],
    'Financial Income/(Expenses)': ['Interest income', 'Interest expense', 'FX', 'Bank fees', 'Other', YOUR_BUDGET],
    'Tax': ['Current tax', 'Deferred tax', 'Other', YOUR_BUDGET],
    'Other Income/(Expenses)': ['One-time gains', 'One-time losses', 'Other', YOUR_BUDGET],
};
// ─── Helpers ────────────────────────────────────────────────────────────────
function resolveCustomerKey(req) {
    // Allow either header or ?key= query (for routes that take a binary body
    // and want to keep the request "simple" CORS-wise — matches the admin-pin
    // pattern in this codebase).
    const fromHeader = req.header('x-customer-key');
    const fromQuery = typeof req.query.key === 'string' ? req.query.key : '';
    const key = (fromHeader || fromQuery).trim();
    if (!key)
        return null;
    return partner_repository_1.customerKeyRepo.findByKey(key);
}
function send401(res, message) {
    res.status(401).json({ error: { code: 'CUSTOMER_KEY_INVALID', message } });
}
function serializeGL(row) {
    return {
        id: row.id,
        glNumber: row.glNumber,
        glName: row.glName,
        plSection: row.plSection,
        budgetCategory: row.budgetCategory,
        budgetCategoryCustom: row.budgetCategoryCustom,
        orphan: row.orphan,
    };
}
// ─── Controller ─────────────────────────────────────────────────────────────
exports.visibilityController = {
    /**
     * GET /api/visibility/dropdowns
     * Returns the conditional P&L → Budget Category source-of-truth so
     * the UI doesn't have to duplicate the table from §2.3.
     */
    dropdowns(_req, res) {
        res.json({
            plSections: exports.PL_SECTIONS,
            budgetCategoriesBySection: exports.BUDGET_CATEGORIES_BY_SECTION,
            yourBudgetCategoryToken: YOUR_BUDGET,
        });
    },
    /**
     * GET /api/visibility/financial-structure
     * Returns the customer's GL list + Financial Structure status.
     */
    getFinancialStructure(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const rows = visibility_repository_1.glAccountRepo.listByCustomer(key.id);
        res.json({
            status: visibility_repository_1.financialStructureRepo.getStatus(key.id),
            glAccounts: rows.map(serializeGL),
            orphanCount: rows.filter(r => r.orphan).length,
        });
    },
    /**
     * POST /api/visibility/gl/upload
     * Body: raw .xlsx or .csv bytes. Optional ?filename= hint helps us
     * decide between xlsx parsing and CSV parsing.
     */
    async uploadGL(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const buf = req.body;
        if (!Buffer.isBuffer(buf) || buf.length === 0) {
            res.status(400).json({ error: { code: 'EMPTY_BODY', message: 'No file uploaded.' } });
            return;
        }
        const filename = typeof req.query.filename === 'string' ? req.query.filename : '';
        let parsed;
        try {
            parsed = await (0, gl_parser_service_1.parseGLBuffer)(buf, filename);
        }
        catch (err) {
            if (err instanceof gl_parser_service_1.ParseError) {
                res.status(400).json({ error: { code: 'PARSE_ERROR', message: err.userMessage } });
            }
            else {
                console.error('[visibility] GL parse failed:', err);
                res.status(400).json({
                    error: { code: 'PARSE_ERROR', message: err instanceof Error ? err.message : 'Could not parse file.' },
                });
            }
            return;
        }
        const result = visibility_repository_1.glAccountRepo.applyUpload(key.id, parsed.rows);
        // An upload always re-opens the Financial Structure for editing —
        // mappings might need adjustment for newly-added GLs.
        visibility_repository_1.financialStructureRepo.setStatus(key.id, 'editing');
        res.json({
            status: 'editing',
            uploaded: parsed.rows.length,
            inserted: result.inserted,
            updated: result.updated,
            newlyOrphaned: result.orphaned,
            glAccounts: result.all.map(serializeGL),
            orphanCount: result.all.filter(r => r.orphan).length,
        });
    },
    /**
     * PATCH /api/visibility/gl/:id
     * Body: { plSection?, budgetCategory?, budgetCategoryCustom? }
     * Updates one GL row's mapping. Frontend calls this on every change.
     */
    updateGL(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const existing = visibility_repository_1.glAccountRepo.getById(req.params.id);
        if (!existing || existing.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'GL row not found.' } });
            return;
        }
        const Schema = zod_1.z.object({
            plSection: zod_1.z.string().nullable().optional(),
            budgetCategory: zod_1.z.string().nullable().optional(),
            budgetCategoryCustom: zod_1.z.string().nullable().optional(),
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
        const norm = (v) => (v === '' || v == null ? null : v);
        const has = (k) => parsed.data[k] !== undefined;
        const patchedPL = has('plSection') ? norm(parsed.data.plSection) : existing.plSection;
        const patchedBC = has('budgetCategory') ? norm(parsed.data.budgetCategory) : existing.budgetCategory;
        const patchedBCCustom = has('budgetCategoryCustom') ? norm(parsed.data.budgetCategoryCustom) : existing.budgetCategoryCustom;
        if (patchedPL !== null && !exports.PL_SECTIONS.includes(patchedPL)) {
            res.status(400).json({ error: { code: 'BAD_PL_SECTION', message: `Unknown P&L Section "${patchedPL}".` } });
            return;
        }
        if (patchedBC !== null && patchedPL === null) {
            res.status(400).json({ error: { code: 'PL_SECTION_REQUIRED', message: 'Pick a P&L Section before a Budget Category.' } });
            return;
        }
        if (patchedBC !== null && patchedPL !== null) {
            const allowed = exports.BUDGET_CATEGORIES_BY_SECTION[patchedPL];
            if (!allowed.includes(patchedBC)) {
                res.status(400).json({ error: { code: 'BAD_BUDGET_CATEGORY', message: `"${patchedBC}" is not allowed under ${patchedPL}.` } });
                return;
            }
        }
        // Free-text override is only meaningful when budgetCategory === Your Budget Category.
        const finalCustom = patchedBC === YOUR_BUDGET ? (patchedBCCustom ?? '') : null;
        // Persist only the fields that were actually in the patch — that
        // keeps the audit trail honest about what changed.
        const updated = visibility_repository_1.glAccountRepo.updateMapping(req.params.id, {
            ...(has('plSection') ? { plSection: patchedPL } : {}),
            ...(has('budgetCategory') ? { budgetCategory: patchedBC } : {}),
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
    deleteGL(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const existing = visibility_repository_1.glAccountRepo.getById(req.params.id);
        if (!existing || existing.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'GL row not found.' } });
            return;
        }
        visibility_repository_1.glAccountRepo.deleteById(req.params.id);
        res.json({ ok: true });
    },
    /**
     * POST /api/visibility/financial-structure/complete
     * Validates that every non-orphan GL has both a P&L Section AND a
     * Budget Category set, then flips status to 'completed'.
     */
    completeFinancialStructure(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const rows = visibility_repository_1.glAccountRepo.listByCustomer(key.id);
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
        visibility_repository_1.financialStructureRepo.setStatus(key.id, 'completed');
        res.json({ status: 'completed' });
    },
    /**
     * POST /api/visibility/financial-structure/edit
     * Re-opens the Financial Structure for editing.
     */
    editFinancialStructure(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        visibility_repository_1.financialStructureRepo.setStatus(key.id, 'editing');
        res.json({ status: 'editing' });
    },
    // ─── Phase 2 — Organizational Structure ──────────────────────────────────
    /**
     * GET /api/visibility/org-structure
     * Returns the customer's org entities (grouped by dimension) and
     * the current status.
     */
    getOrgStructure(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const all = visibility_repository_1.orgEntityRepo.listByCustomer(key.id);
        const grouped = {
            company: [], division: [], department: [], product: [], activity: [],
        };
        for (const e of all)
            grouped[e.dimension].push(e);
        res.json({
            status: visibility_repository_1.orgStructureRepo.getStatus(key.id),
            entities: {
                company: grouped.company.map(serializeOrg),
                division: grouped.division.map(serializeOrg),
                department: grouped.department.map(serializeOrg),
                product: grouped.product.map(serializeOrg),
                activity: grouped.activity.map(serializeOrg),
            },
        });
    },
    /**
     * POST /api/visibility/org-structure/entities
     * Body: { dimension, name }
     */
    createOrgEntity(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const Schema = zod_1.z.object({
            dimension: zod_1.z.enum(visibility_repository_1.ORG_DIMENSIONS),
            name: zod_1.z.string().trim().min(1).max(200),
        });
        const parsed = Schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'dimension and name are required.' } });
            return;
        }
        const created = visibility_repository_1.orgEntityRepo.create(key.id, parsed.data.dimension, parsed.data.name);
        res.status(201).json({ entity: serializeOrg(created) });
    },
    /**
     * PATCH /api/visibility/org-structure/entities/:id
     * Body: { name }
     */
    renameOrgEntity(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const existing = visibility_repository_1.orgEntityRepo.getById(req.params.id);
        if (!existing || existing.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Entity not found.' } });
            return;
        }
        const Schema = zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(200) });
        const parsed = Schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name is required.' } });
            return;
        }
        const updated = visibility_repository_1.orgEntityRepo.rename(req.params.id, parsed.data.name);
        res.json({ entity: updated ? serializeOrg(updated) : null });
    },
    /**
     * DELETE /api/visibility/org-structure/entities/:id
     * Drops the org entry. Cells referencing it on finalized budgets
     * render as blank per spec §3. The response includes a referenceCount
     * so the UI can confirm with the user before calling — though for
     * Phase 2 (no budgets yet) the count is always 0.
     */
    deleteOrgEntity(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const existing = visibility_repository_1.orgEntityRepo.getById(req.params.id);
        if (!existing || existing.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Entity not found.' } });
            return;
        }
        const referenceCount = visibility_repository_1.orgEntityRepo.countReferences(req.params.id);
        visibility_repository_1.orgEntityRepo.deleteById(req.params.id);
        res.json({ ok: true, referenceCount });
    },
    /**
     * GET /api/visibility/org-structure/entities/:id/references
     * Returns the current reference count without deleting — used by the
     * UI to populate the delete-confirmation modal copy per spec §11.
     */
    getOrgEntityReferences(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const existing = visibility_repository_1.orgEntityRepo.getById(req.params.id);
        if (!existing || existing.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Entity not found.' } });
            return;
        }
        res.json({ referenceCount: visibility_repository_1.orgEntityRepo.countReferences(req.params.id) });
    },
    /**
     * POST /api/visibility/org-structure/complete
     * All five dimensions are optional, so this just flips status —
     * no minimum-count validation. Customers can complete an empty
     * Org Structure if they don't need dimensions.
     */
    completeOrgStructure(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        visibility_repository_1.orgStructureRepo.setStatus(key.id, 'completed');
        res.json({ status: 'completed' });
    },
    /**
     * POST /api/visibility/org-structure/edit
     */
    editOrgStructure(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        visibility_repository_1.orgStructureRepo.setStatus(key.id, 'editing');
        res.json({ status: 'editing' });
    },
};
function serializeOrg(row) {
    return {
        id: row.id,
        dimension: row.dimension,
        name: row.name,
        orderIndex: row.orderIndex,
    };
}
// ─── Phase 3a — Budgets ──────────────────────────────────────────────────
function serializeBudget(row) {
    return {
        id: row.id,
        name: row.name,
        year: row.year,
        granularity: row.granularity,
        currency: row.currency,
        scale: row.scale,
        sbEnabled: row.sbEnabled,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function serializeBudgetLine(row, cells) {
    return {
        id: row.id,
        companyId: row.companyId,
        serviceProviderName: row.serviceProviderName,
        serviceDescription: row.serviceDescription,
        divisionId: row.divisionId,
        departmentId: row.departmentId,
        productId: row.productId,
        activityId: row.activityId,
        glAccountId: row.glAccountId,
        source: row.source,
        orderIndex: row.orderIndex,
        cells,
    };
}
const SetupSchema = zod_1.z.object({
    name: zod_1.z.string().trim().max(200).optional(),
    year: zod_1.z.number().int().min(2020).max(2050),
    granularity: zod_1.z.enum(visibility_repository_1.GRANULARITIES),
    currency: zod_1.z.enum(visibility_repository_1.CURRENCIES),
    scale: zod_1.z.enum(visibility_repository_1.SCALES),
    sbEnabled: zod_1.z.boolean(),
});
exports.budgetsController = {
    /** GET /api/visibility/budgets */
    list(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const budgets = visibility_repository_1.budgetRepo.listByCustomer(key.id);
        res.json({
            budgets: budgets.map(serializeBudget),
            cap: visibility_repository_1.BUDGET_CAP_PER_CUSTOMER,
            remaining: Math.max(0, visibility_repository_1.BUDGET_CAP_PER_CUSTOMER - budgets.length),
        });
    },
    /** POST /api/visibility/budgets — body = setup options. */
    create(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        if (visibility_repository_1.budgetRepo.countByCustomer(key.id) >= visibility_repository_1.BUDGET_CAP_PER_CUSTOMER) {
            res.status(400).json({
                error: {
                    code: 'BUDGET_CAP_REACHED',
                    message: `You already have ${visibility_repository_1.BUDGET_CAP_PER_CUSTOMER} budgets. Delete one before creating a new one.`,
                },
            });
            return;
        }
        const parsed = SetupSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid setup payload.' } });
            return;
        }
        const created = visibility_repository_1.budgetRepo.create(key.id, {
            name: parsed.data.name,
            year: parsed.data.year,
            granularity: parsed.data.granularity,
            currency: parsed.data.currency,
            scale: parsed.data.scale,
            sbEnabled: parsed.data.sbEnabled,
        });
        res.status(201).json({ budget: serializeBudget(created) });
    },
    /** GET /api/visibility/budgets/:id — full hydrated budget with lines+cells. */
    get(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const budget = visibility_repository_1.budgetRepo.getById(req.params.id);
        if (!budget || budget.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
            return;
        }
        const lines = visibility_repository_1.budgetLineRepo.listByBudget(budget.id);
        const hydrated = lines.map(l => serializeBudgetLine(l, visibility_repository_1.budgetCellRepo.listByLine(l.id)));
        res.json({
            budget: serializeBudget(budget),
            periodKeys: (0, visibility_repository_1.periodKeysFor)(budget.granularity),
            lines: hydrated,
        });
    },
    /** PATCH /api/visibility/budgets/:id — setup options + name + status. */
    patch(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const existing = visibility_repository_1.budgetRepo.getById(req.params.id);
        if (!existing || existing.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
            return;
        }
        const Schema = zod_1.z.object({
            name: zod_1.z.string().trim().max(200).optional(),
            year: zod_1.z.number().int().min(2020).max(2050).optional(),
            granularity: zod_1.z.enum(visibility_repository_1.GRANULARITIES).optional(),
            currency: zod_1.z.enum(visibility_repository_1.CURRENCIES).optional(),
            scale: zod_1.z.enum(visibility_repository_1.SCALES).optional(),
            sbEnabled: zod_1.z.boolean().optional(),
        });
        const parsed = Schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid patch payload.' } });
            return;
        }
        // Granularity change → auto-aggregate / split each line's cells (§6).
        const newGran = parsed.data.granularity;
        if (newGran && newGran !== existing.granularity) {
            const lines = visibility_repository_1.budgetLineRepo.listByBudget(existing.id);
            for (const l of lines) {
                visibility_repository_1.budgetCellRepo.remapForGranularity(l.id, existing.granularity, newGran);
            }
        }
        const updated = visibility_repository_1.budgetRepo.update(existing.id, parsed.data);
        res.json({ budget: updated ? serializeBudget(updated) : null });
    },
    /** DELETE /api/visibility/budgets/:id */
    remove(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const existing = visibility_repository_1.budgetRepo.getById(req.params.id);
        if (!existing || existing.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
            return;
        }
        visibility_repository_1.budgetRepo.deleteById(existing.id);
        res.json({ ok: true });
    },
    /** POST /api/visibility/budgets/:id/finalize — body { name }. */
    finalize(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const existing = visibility_repository_1.budgetRepo.getById(req.params.id);
        if (!existing || existing.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
            return;
        }
        const parsed = zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(200) }).safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'A name is required to finalize a budget.' } });
            return;
        }
        const updated = visibility_repository_1.budgetRepo.update(existing.id, {
            name: parsed.data.name,
            status: 'finalized',
        });
        res.json({ budget: updated ? serializeBudget(updated) : null });
    },
    // ─── Lines ─────────────────────────────────────────────────
    /** POST /api/visibility/budgets/:id/lines  body: { afterId?: string } */
    createLine(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const budget = visibility_repository_1.budgetRepo.getById(req.params.id);
        if (!budget || budget.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
            return;
        }
        const afterId = typeof req.body?.afterId === 'string' ? req.body.afterId : undefined;
        const line = visibility_repository_1.budgetLineRepo.create(budget.id, 'manual', afterId);
        res.status(201).json({ line: serializeBudgetLine(line, {}) });
    },
    /** PATCH /api/visibility/budgets/:id/lines/:lineId */
    patchLine(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const budget = visibility_repository_1.budgetRepo.getById(req.params.id);
        if (!budget || budget.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
            return;
        }
        const line = visibility_repository_1.budgetLineRepo.getById(req.params.lineId);
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
        const Schema = zod_1.z.object({
            companyId: zod_1.z.string().nullable().optional(),
            serviceProviderName: zod_1.z.string().max(200).optional(),
            serviceDescription: zod_1.z.string().max(500).optional(),
            divisionId: zod_1.z.string().nullable().optional(),
            departmentId: zod_1.z.string().nullable().optional(),
            productId: zod_1.z.string().nullable().optional(),
            activityId: zod_1.z.string().nullable().optional(),
            glAccountId: zod_1.z.string().nullable().optional(),
            cells: zod_1.z.record(zod_1.z.number()).optional(),
        });
        const parsed = Schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid line payload.' } });
            return;
        }
        // Validate org FKs belong to the same customer (light check).
        const checkOrgId = (id) => {
            if (id == null || id === '')
                return true;
            const e = visibility_repository_1.orgEntityRepo.getById(id);
            return !!e && e.customerKeyId === key.id;
        };
        for (const k of ['companyId', 'divisionId', 'departmentId', 'productId', 'activityId']) {
            if (parsed.data[k] !== undefined && !checkOrgId(parsed.data[k])) {
                res.status(400).json({ error: { code: 'BAD_ORG_REF', message: `${k} does not exist for this customer.` } });
                return;
            }
        }
        // Validate GL FK if provided.
        if (parsed.data.glAccountId !== undefined && parsed.data.glAccountId) {
            const gl = visibility_repository_1.glAccountRepo.getById(parsed.data.glAccountId);
            if (!gl || gl.customerKeyId !== key.id) {
                res.status(400).json({ error: { code: 'BAD_GL_REF', message: 'Unknown GL account.' } });
                return;
            }
        }
        const { cells, ...meta } = parsed.data;
        const updatedLine = visibility_repository_1.budgetLineRepo.update(line.id, meta);
        if (cells) {
            // Only accept period keys valid for this budget's granularity.
            const allowed = new Set((0, visibility_repository_1.periodKeysFor)(budget.granularity));
            const clean = {};
            for (const [k, v] of Object.entries(cells)) {
                if (allowed.has(k) && Number.isFinite(v))
                    clean[k] = v;
            }
            visibility_repository_1.budgetCellRepo.setAllForLine(line.id, clean);
        }
        res.json({
            line: updatedLine ? serializeBudgetLine(updatedLine, visibility_repository_1.budgetCellRepo.listByLine(line.id)) : null,
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
    getPivot(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const budget = visibility_repository_1.budgetRepo.getById(req.params.id);
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
    async exportXlsx(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const budget = visibility_repository_1.budgetRepo.getById(req.params.id);
        if (!budget || budget.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
            return;
        }
        const ctx = collectPivotContext(budget.id, key.id, req.query, budget.granularity);
        const buf = await (0, budget_export_service_1.buildBudgetExport)({
            budget,
            periodKeys: (0, visibility_repository_1.periodKeysFor)(budget.granularity),
            lines: ctx.lineRows.map(l => ({ line: l, cells: visibility_repository_1.budgetCellRepo.listByLine(l.id) })),
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
    removeLine(req, res) {
        const key = resolveCustomerKey(req);
        if (!key) {
            send401(res, 'Missing or invalid customer key.');
            return;
        }
        const budget = visibility_repository_1.budgetRepo.getById(req.params.id);
        if (!budget || budget.customerKeyId !== key.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
            return;
        }
        const line = visibility_repository_1.budgetLineRepo.getById(req.params.lineId);
        if (!line || line.budgetId !== budget.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Line not found.' } });
            return;
        }
        if (line.source === 'salaries') {
            res.status(400).json({ error: { code: 'READONLY_LINE', message: 'Salaries lines are managed via the Salaries & Benefits tab.' } });
            return;
        }
        visibility_repository_1.budgetLineRepo.deleteById(line.id);
        res.json({ ok: true });
    },
};
// ─── Pivot context (shared by /pivot and /export) ────────────────────────
function parseIdList(raw) {
    if (typeof raw !== 'string' || !raw.trim())
        return [];
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}
function parseDisplayGranularity(raw, budgetGran) {
    const ALLOWED = ['monthly', 'quarterly', 'yearly'];
    const want = typeof raw === 'string' ? raw : '';
    if (!ALLOWED.includes(want))
        return budgetGran;
    // The pivot can only roll up. monthly→quarterly/yearly, quarterly→yearly.
    // If a finer granularity than the budget is requested, fall back to budget's.
    const rank = { monthly: 0, quarterly: 1, yearly: 2 };
    return rank[want] >= rank[budgetGran] ? want : budgetGran;
}
function collectPivotContext(budgetId, customerKeyId, query, budgetGran) {
    // Load lines + cells.
    const lineRows = visibility_repository_1.budgetLineRepo.listByBudget(budgetId);
    const linesWithCells = lineRows.map(l => ({
        id: l.id,
        companyId: l.companyId,
        divisionId: l.divisionId,
        departmentId: l.departmentId,
        productId: l.productId,
        activityId: l.activityId,
        glAccountId: l.glAccountId,
        cells: visibility_repository_1.budgetCellRepo.listByLine(l.id),
    }));
    // Build GL + Org id lookups once.
    const glById = new Map(visibility_repository_1.glAccountRepo.listByCustomer(customerKeyId).map(g => [g.id, g]));
    const orgById = new Map(visibility_repository_1.orgEntityRepo.listByCustomer(customerKeyId).map(e => [e.id, e]));
    // Filters.
    const filters = {
        companyIds: parseIdList(query.companies),
        divisionIds: parseIdList(query.divisions),
        departmentIds: parseIdList(query.departments),
        productIds: parseIdList(query.products),
        activityIds: parseIdList(query.activities),
        glAccountIds: parseIdList(query.gls),
    };
    // Display granularity — roll up cells to the requested display
    // granularity before pivoting so the period columns match.
    const display = parseDisplayGranularity(query.display, budgetGran);
    const displayPeriods = (0, pivot_service_1.periodKeysForDisplay)(display);
    const linesRolled = linesWithCells.map(l => ({
        ...l,
        cells: (0, pivot_service_1.rollUpCells)(l.cells, budgetGran, display),
    }));
    const pivot = (0, pivot_service_1.computePivot)(linesRolled, glById, filters, displayPeriods);
    return { lineRows, linesWithCells, glById, orgById, filters, display, pivot };
}
// ─── Phase 3b — Salaries & Benefits (spec §7) ────────────────────────────
function serializeSalary(row) {
    return {
        id: row.id,
        companyId: row.companyId,
        employeeName: row.employeeName,
        divisionId: row.divisionId,
        departmentId: row.departmentId,
        productId: row.productId,
        activityId: row.activityId,
        productActivityPct: row.productActivityPct,
        monthlySalary: row.monthlySalary,
        glAccountId: row.glAccountId,
        orderIndex: row.orderIndex,
    };
}
function requireBudget(req, res) {
    const key = resolveCustomerKey(req);
    if (!key) {
        send401(res, 'Missing or invalid customer key.');
        return null;
    }
    const budget = visibility_repository_1.budgetRepo.getById(req.params.id);
    if (!budget || budget.customerKeyId !== key.id) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
        return null;
    }
    return { budget, customerKeyId: key.id };
}
exports.salariesController = {
    /** GET /api/visibility/budgets/:id/salaries */
    list(req, res) {
        const ctx = requireBudget(req, res);
        if (!ctx)
            return;
        const rows = visibility_repository_1.salariesRowRepo.listByBudget(ctx.budget.id);
        const validation = (0, salaries_service_1.validateAndPivotSalaries)(rows);
        res.json({
            status: visibility_repository_1.salariesStateRepo.getStatus(ctx.budget.id),
            sbEnabled: ctx.budget.sbEnabled,
            rows: rows.map(serializeSalary),
            errors: validation.errors,
            warnings: validation.warnings,
            pivotPreview: validation.pivot.map(p => ({
                companyId: p.companyId, divisionId: p.divisionId, departmentId: p.departmentId,
                productId: p.productId, activityId: p.activityId, glAccountId: p.glAccountId,
                allocatedMonthlySalary: p.allocatedMonthlySalary,
                contributingRowIds: p.contributingRowIds,
            })),
        });
    },
    /** POST /api/visibility/budgets/:id/salaries  body: { afterId?: string } */
    createRow(req, res) {
        const ctx = requireBudget(req, res);
        if (!ctx)
            return;
        const afterId = typeof req.body?.afterId === 'string' ? req.body.afterId : undefined;
        const created = visibility_repository_1.salariesRowRepo.create(ctx.budget.id, undefined, afterId);
        res.status(201).json({ row: serializeSalary(created) });
    },
    /** PATCH /api/visibility/budgets/:id/salaries/:rowId */
    patchRow(req, res) {
        const ctx = requireBudget(req, res);
        if (!ctx)
            return;
        const row = visibility_repository_1.salariesRowRepo.getById(req.params.rowId);
        if (!row || row.budgetId !== ctx.budget.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Row not found.' } });
            return;
        }
        const Schema = zod_1.z.object({
            companyId: zod_1.z.string().nullable().optional(),
            employeeName: zod_1.z.string().trim().max(200).optional(),
            divisionId: zod_1.z.string().nullable().optional(),
            departmentId: zod_1.z.string().nullable().optional(),
            productId: zod_1.z.string().nullable().optional(),
            activityId: zod_1.z.string().nullable().optional(),
            productActivityPct: zod_1.z.number().min(0).max(1000).optional(),
            monthlySalary: zod_1.z.number().min(0).optional(),
            glAccountId: zod_1.z.string().nullable().optional(),
        });
        const parsed = Schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid salary patch.' } });
            return;
        }
        // Validate FKs scoped to this customer.
        const checkOrgId = (id) => {
            if (id == null || id === '')
                return true;
            const e = visibility_repository_1.orgEntityRepo.getById(id);
            return !!e && e.customerKeyId === ctx.customerKeyId;
        };
        for (const k of ['companyId', 'divisionId', 'departmentId', 'productId', 'activityId']) {
            if (parsed.data[k] !== undefined && !checkOrgId(parsed.data[k])) {
                res.status(400).json({ error: { code: 'BAD_ORG_REF', message: `${k} does not exist for this customer.` } });
                return;
            }
        }
        if (parsed.data.glAccountId !== undefined && parsed.data.glAccountId) {
            const gl = visibility_repository_1.glAccountRepo.getById(parsed.data.glAccountId);
            if (!gl || gl.customerKeyId !== ctx.customerKeyId) {
                res.status(400).json({ error: { code: 'BAD_GL_REF', message: 'Unknown GL account.' } });
                return;
            }
        }
        const updated = visibility_repository_1.salariesRowRepo.update(row.id, parsed.data);
        res.json({ row: updated ? serializeSalary(updated) : null });
    },
    /** DELETE /api/visibility/budgets/:id/salaries/:rowId */
    removeRow(req, res) {
        const ctx = requireBudget(req, res);
        if (!ctx)
            return;
        const row = visibility_repository_1.salariesRowRepo.getById(req.params.rowId);
        if (!row || row.budgetId !== ctx.budget.id) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Row not found.' } });
            return;
        }
        visibility_repository_1.salariesRowRepo.deleteById(row.id);
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
    async upload(req, res) {
        const ctx = requireBudget(req, res);
        if (!ctx)
            return;
        const buf = req.body;
        if (!Buffer.isBuffer(buf) || buf.length === 0) {
            res.status(400).json({ error: { code: 'EMPTY_BODY', message: 'No file uploaded.' } });
            return;
        }
        const filename = typeof req.query.filename === 'string' ? req.query.filename : '';
        let parsed;
        try {
            parsed = await (0, gl_parser_service_1.parseSBBuffer)(buf, filename);
        }
        catch (err) {
            if (err instanceof gl_parser_service_1.ParseError) {
                res.status(400).json({ error: { code: 'PARSE_ERROR', message: err.userMessage } });
            }
            else {
                res.status(400).json({ error: { code: 'PARSE_ERROR', message: err instanceof Error ? err.message : 'Could not parse file.' } });
            }
            return;
        }
        // Match Company and Department names against the customer's Org
        // Structure exactly (case-insensitive, trimmed). ANY mismatch
        // blocks the upload — no rows are inserted.
        const allOrg = visibility_repository_1.orgEntityRepo.listByCustomer(ctx.customerKeyId);
        const companyByName = new Map(allOrg.filter(e => e.dimension === 'company').map(c => [c.name.trim().toLowerCase(), c.id]));
        const departmentByName = new Map(allOrg.filter(e => e.dimension === 'department').map(d => [d.name.trim().toLowerCase(), d.id]));
        const unmappedCompanies = new Set();
        const unmappedDepartments = new Set();
        for (const r of parsed) {
            if (!companyByName.has(r.companyName.trim().toLowerCase())) {
                unmappedCompanies.add(r.companyName);
            }
            if (!departmentByName.has(r.departmentName.trim().toLowerCase())) {
                unmappedDepartments.add(r.departmentName);
            }
        }
        if (unmappedCompanies.size > 0 || unmappedDepartments.size > 0) {
            const parts = [];
            if (unmappedCompanies.size > 0) {
                parts.push(`Company name${unmappedCompanies.size === 1 ? '' : 's'} not in Organizational Structure: ${[...unmappedCompanies].map(s => `"${s}"`).join(', ')}`);
            }
            if (unmappedDepartments.size > 0) {
                parts.push(`Department name${unmappedDepartments.size === 1 ? '' : 's'} not in Organizational Structure: ${[...unmappedDepartments].map(s => `"${s}"`).join(', ')}`);
            }
            res.status(400).json({
                error: {
                    code: 'UNMAPPED_NAMES',
                    message: `Upload blocked — every Company in column A and Department in column D must exactly match an entry in your Organizational Structure. ` +
                        parts.join('. ') + '.',
                    unmappedCompanies: [...unmappedCompanies],
                    unmappedDepartments: [...unmappedDepartments],
                },
            });
            return;
        }
        // All names match — compute monthly salary = employer's cost / FX,
        // then REPLACE every existing salary row for this budget with the
        // freshly-uploaded set (spec: re-uploading refreshes the table).
        const existing = visibility_repository_1.salariesRowRepo.listByBudget(ctx.budget.id);
        for (const row of existing)
            visibility_repository_1.salariesRowRepo.deleteById(row.id);
        const seeded = parsed.map(r => ({
            companyId: companyByName.get(r.companyName.trim().toLowerCase()) ?? null,
            employeeName: r.employeeName,
            departmentId: departmentByName.get(r.departmentName.trim().toLowerCase()) ?? null,
            monthlySalary: r.employersCost / r.exchangeRate,
        }));
        const created = visibility_repository_1.salariesRowRepo.bulkInsert(ctx.budget.id, seeded);
        res.json({
            inserted: created.length,
            replaced: existing.length,
            rows: created.map(serializeSalary),
        });
    },
    /**
     * POST /api/visibility/budgets/:id/salaries/finalize
     * Runs the validation pipeline; on success replaces every existing
     * source='salaries' budget_line under this budget with the freshly
     * pivoted set, and flips status to 'finalized'.
     */
    finalize(req, res) {
        const ctx = requireBudget(req, res);
        if (!ctx)
            return;
        const rows = visibility_repository_1.salariesRowRepo.listByBudget(ctx.budget.id);
        if (rows.length === 0) {
            res.status(400).json({ error: { code: 'EMPTY_SB', message: 'Add at least one salary row before finalizing.' } });
            return;
        }
        const result = (0, salaries_service_1.validateAndPivotSalaries)(rows);
        if (result.errors.length > 0) {
            res.status(400).json({
                error: {
                    code: 'SB_VALIDATION',
                    message: `${result.errors.length} validation error${result.errors.length === 1 ? '' : 's'} — fix them before finalizing.`,
                    errors: result.errors,
                    warnings: result.warnings,
                },
            });
            return;
        }
        // Replace existing salaries lines with the freshly pivoted set.
        const existingLines = visibility_repository_1.budgetLineRepo.listByBudget(ctx.budget.id).filter(l => l.source === 'salaries');
        for (const l of existingLines)
            visibility_repository_1.budgetLineRepo.deleteById(l.id);
        for (const p of result.pivot) {
            const line = visibility_repository_1.budgetLineRepo.create(ctx.budget.id, 'salaries');
            visibility_repository_1.budgetLineRepo.update(line.id, {
                companyId: p.companyId,
                divisionId: p.divisionId,
                departmentId: p.departmentId,
                productId: p.productId,
                activityId: p.activityId,
                glAccountId: p.glAccountId,
                serviceProviderName: 'Employees Salaries',
                serviceDescription: 'Employees Salaries',
            });
            const cells = (0, salaries_service_1.pivotEntryToCells)(p.allocatedMonthlySalary, ctx.budget.granularity);
            visibility_repository_1.budgetCellRepo.setAllForLine(line.id, cells);
        }
        visibility_repository_1.salariesStateRepo.setStatus(ctx.budget.id, 'finalized');
        res.json({
            status: 'finalized',
            warnings: result.warnings,
            pivotCount: result.pivot.length,
        });
    },
    /** POST /api/visibility/budgets/:id/salaries/edit */
    edit(req, res) {
        const ctx = requireBudget(req, res);
        if (!ctx)
            return;
        visibility_repository_1.salariesStateRepo.setStatus(ctx.budget.id, 'editing');
        res.json({ status: 'editing' });
    },
};
/* ============================================================
   CF (Cash Flow) controller — Phase 1: scaffolding.
   Only get-or-create exposed; sections/forecast/dashboard come
   in later phases.
   ============================================================ */
function serializeCashFlow(row) {
    return {
        id: row.id,
        budgetId: row.budgetId,
        openingCash: row.openingCash,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
exports.cashFlowController = {
    /**
     * GET /api/visibility/budgets/:id/cf
     * CF is read-only-linked to a finalized budget (spec §10).
     * If the budget is still a draft, return 409 so the FE can
     * show "Finalize the budget first" guidance.
     */
    getOrCreate(req, res) {
        const ctx = requireBudget(req, res);
        if (!ctx)
            return;
        if (ctx.budget.status !== 'finalized') {
            res.status(409).json({
                error: {
                    code: 'BUDGET_NOT_FINALIZED',
                    message: 'Finalize the budget before opening Cash Flow.',
                },
            });
            return;
        }
        const cf = visibility_repository_1.cashFlowRepo.ensureForBudget(ctx.budget.id);
        res.json({
            cf: serializeCashFlow(cf),
            budget: serializeBudget(ctx.budget),
            periodKeys: (0, visibility_repository_1.periodKeysFor)(ctx.budget.granularity),
        });
    },
    /**
     * PATCH /api/visibility/budgets/:id/cf
     * Updates CF-level fields (openingCash, status). Section-level
     * fields (Payables/Receivables/Inventory/Salaries/Manual) get
     * their own endpoints in later phases.
     */
    patch(req, res) {
        const ctx = requireBudget(req, res);
        if (!ctx)
            return;
        if (ctx.budget.status !== 'finalized') {
            res.status(409).json({
                error: { code: 'BUDGET_NOT_FINALIZED', message: 'Finalize the budget first.' },
            });
            return;
        }
        const Schema = zod_1.z.object({
            openingCash: zod_1.z.number().finite().optional(),
            status: zod_1.z.enum(['draft', 'finalized']).optional(),
        });
        const parsed = Schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid CF patch payload.' } });
            return;
        }
        const cf = visibility_repository_1.cashFlowRepo.ensureForBudget(ctx.budget.id);
        if (parsed.data.openingCash !== undefined) {
            visibility_repository_1.cashFlowRepo.updateOpeningCash(cf.id, parsed.data.openingCash);
        }
        if (parsed.data.status !== undefined) {
            visibility_repository_1.cashFlowRepo.setStatus(cf.id, parsed.data.status);
        }
        const updated = visibility_repository_1.cashFlowRepo.getByBudget(ctx.budget.id);
        res.json({ cf: updated ? serializeCashFlow(updated) : null });
    },
};
/* ============================================================
   CF — Payables controller (spec §3)
   ============================================================ */
function requireFinalizedBudgetCf(req, res) {
    const ctx = requireBudget(req, res);
    if (!ctx)
        return null;
    if (ctx.budget.status !== 'finalized') {
        res.status(409).json({
            error: { code: 'BUDGET_NOT_FINALIZED', message: 'Finalize the budget first.' },
        });
        return null;
    }
    const cf = visibility_repository_1.cashFlowRepo.ensureForBudget(ctx.budget.id);
    return { customerKeyId: ctx.customerKeyId, budget: ctx.budget, cfId: cf.id };
}
exports.cfPayablesController = {
    /** GET /api/visibility/budgets/:id/cf/payables */
    get(req, res) {
        const ctx = requireFinalizedBudgetCf(req, res);
        if (!ctx)
            return;
        const grid = (0, cf_payables_service_1.computePayablesGrid)(ctx.budget, ctx.cfId, ctx.customerKeyId);
        res.json({ payables: grid, paymentTerms: visibility_repository_1.PAYMENT_TERMS });
    },
    /** PATCH /api/visibility/budgets/:id/cf/payables — section-level (openingBalance). */
    patchSection(req, res) {
        const ctx = requireFinalizedBudgetCf(req, res);
        if (!ctx)
            return;
        const Schema = zod_1.z.object({ openingBalance: zod_1.z.number().finite().min(0) });
        const parsed = Schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'openingBalance must be a non-negative number.' } });
            return;
        }
        visibility_repository_1.cfPayablesSectionRepo.upsert(ctx.cfId, parsed.data.openingBalance);
        res.json({ section: visibility_repository_1.cfPayablesSectionRepo.get(ctx.cfId) });
    },
    /**
     * PATCH /api/visibility/budgets/:id/cf/payables/rows/:rowId
     * Body: { paymentTerm?, priorCarry?: { periodKey: amount } }
     */
    patchRow(req, res) {
        const ctx = requireFinalizedBudgetCf(req, res);
        if (!ctx)
            return;
        const row = visibility_repository_1.cfPayablesRowRepo.getById(req.params.rowId);
        if (!row || row.cashFlowId !== ctx.cfId) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Payables row not found.' } });
            return;
        }
        const Schema = zod_1.z.object({
            paymentTerm: zod_1.z.union([zod_1.z.enum(visibility_repository_1.PAYMENT_TERMS), zod_1.z.null()]).optional(),
            priorCarry: zod_1.z.record(zod_1.z.string(), zod_1.z.number().finite().min(0)).optional(),
        });
        const parsed = Schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid row patch payload.' } });
            return;
        }
        if (parsed.data.paymentTerm !== undefined) {
            visibility_repository_1.cfPayablesRowRepo.updatePaymentTerm(row.id, parsed.data.paymentTerm);
        }
        if (parsed.data.priorCarry) {
            for (const [periodKey, amount] of Object.entries(parsed.data.priorCarry)) {
                visibility_repository_1.cfPayablesPriorCarryRepo.upsert(row.id, periodKey, amount);
            }
        }
        // Re-compute the full grid so the FE gets fresh Payment values.
        const grid = (0, cf_payables_service_1.computePayablesGrid)(ctx.budget, ctx.cfId, ctx.customerKeyId);
        res.json({ payables: grid });
    },
};
