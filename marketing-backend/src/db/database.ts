import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DB_PATH || './data/marketing.db';
  const resolvedPath = path.resolve(dbPath);
  const dir = path.dirname(resolvedPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);

  return db;
}

/**
 * One-time rename of the old `partner_submissions` table (and its indices)
 * to the CapitaFlow naming. Idempotent — checks for the new table first and
 * is a no-op once the rename has run. SQLite ≥ 3.25 rewrites the FK
 * constraint in `marketplace_listings` automatically.
 */
function migratePartnerToCapitaFlow(database: Database.Database): void {
  const hasNew = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='capitaflow_submissions'")
    .get();
  if (hasNew) return;

  const hasOld = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='partner_submissions'")
    .get();
  if (!hasOld) return;

  database.exec(`
    ALTER TABLE partner_submissions RENAME TO capitaflow_submissions;
    DROP INDEX IF EXISTS idx_partner_subs_status;
    DROP INDEX IF EXISTS idx_partner_subs_key_id;
    DROP INDEX IF EXISTS idx_partner_subs_submitted;
  `);
  // eslint-disable-next-line no-console
  console.log('[db] migrated partner_submissions -> capitaflow_submissions');
}

function initializeSchema(database: Database.Database): void {
  migratePartnerToCapitaFlow(database);

  database.exec(`
    CREATE TABLE IF NOT EXISTS content_items (
      id               TEXT PRIMARY KEY,
      topic            TEXT NOT NULL,
      state            TEXT NOT NULL DEFAULT 'IDEA_IDENTIFIED',
      economist_brief  TEXT,
      marketing_draft  TEXT,
      vp_review        TEXT,
      approval         TEXT,
      metadata         TEXT NOT NULL DEFAULT '{"revision_count":0}',
      publish_result   TEXT,
      revision_history TEXT NOT NULL DEFAULT '[]',
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id             TEXT PRIMARY KEY,
      content_id     TEXT NOT NULL,
      action         TEXT NOT NULL,
      actor          TEXT NOT NULL,
      previous_state TEXT,
      new_state      TEXT,
      details        TEXT NOT NULL DEFAULT '{}',
      created_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_content_id ON audit_logs(content_id);
    CREATE INDEX IF NOT EXISTS idx_content_items_state ON content_items(state);
    CREATE INDEX IF NOT EXISTS idx_content_items_created ON content_items(created_at);

    CREATE TABLE IF NOT EXISTS linkedin_accounts (
      id              TEXT PRIMARY KEY,
      access_token    TEXT NOT NULL,
      refresh_token   TEXT NOT NULL DEFAULT '',
      expires_at      INTEGER NOT NULL,
      organization_id TEXT NOT NULL DEFAULT '',
      person_urn      TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS linkedin_profile_cache (
      id         TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_keys (
      id              TEXT PRIMARY KEY,
      key             TEXT NOT NULL UNIQUE,
      customer_name   TEXT NOT NULL DEFAULT '',
      offering        TEXT NOT NULL DEFAULT 'visibility',  -- 'visibility' | 'capitaflow'
      created_at      TEXT NOT NULL,
      created_by      TEXT NOT NULL DEFAULT 'admin',
      revoked         INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_customer_keys_key ON customer_keys(key);

    CREATE TABLE IF NOT EXISTS investor_keys (
      id              TEXT PRIMARY KEY,
      key             TEXT NOT NULL UNIQUE,
      investor_name   TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL,
      created_by      TEXT NOT NULL DEFAULT 'admin',
      revoked         INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_investor_keys_key ON investor_keys(key);

    -- Investors Marketplace — one listing per capitaflow submission. Created when
    -- the customer opts in via the 'To Investors Marketplace!' button on their
    -- CapitaFlow area; can be retracted via 'Pull submission'.
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id                   TEXT PRIMARY KEY,
      submission_id        TEXT NOT NULL UNIQUE,
      customer_key_id      TEXT NOT NULL,
      customer_name        TEXT NOT NULL DEFAULT '',
      logo_path            TEXT,
      description          TEXT NOT NULL DEFAULT '',
      sector               TEXT NOT NULL DEFAULT 'Other',
      ask_amount_text      TEXT NOT NULL DEFAULT '',
      -- KPIs as JSON: { gmPctY1, gmPctY5, arrY1, arrY5, topLineY1, topLineY5, ebitdaY5, nrr }
      kpis                 TEXT NOT NULL DEFAULT '{}',
      -- Customer-uploaded PDF of the investor deck for view-only marketplace
      -- access. Served only after an investor has signed the NDA.
      deck_pdf_path        TEXT,
      published_at         TEXT NOT NULL,
      withdrawn_at         TEXT,
      status               TEXT NOT NULL DEFAULT 'active',
      FOREIGN KEY (submission_id)   REFERENCES capitaflow_submissions(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_key_id) REFERENCES customer_keys(id)       ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_marketplace_status   ON marketplace_listings(status);
    CREATE INDEX IF NOT EXISTS idx_marketplace_customer ON marketplace_listings(customer_key_id);
    CREATE INDEX IF NOT EXISTS idx_marketplace_submission ON marketplace_listings(submission_id);

    -- NDA signatures — one row per (investor_key, listing) pair. Created when
    -- the investor accepts the standard V&V NDA before viewing a customer's
    -- investor deck. Drives the Agreements tile in Finance AI (Phase 4).
    CREATE TABLE IF NOT EXISTS nda_signatures (
      id                   TEXT PRIMARY KEY,
      investor_key_id      TEXT NOT NULL,
      investor_name        TEXT NOT NULL DEFAULT '',  -- snapshot of investor key name
      listing_id           TEXT NOT NULL,
      customer_name        TEXT NOT NULL DEFAULT '',  -- snapshot of listing customer name
      full_name            TEXT NOT NULL,
      fund_name            TEXT NOT NULL,
      title                TEXT NOT NULL,
      business_email       TEXT NOT NULL,
      sign_date            TEXT NOT NULL,             -- date entered by investor (YYYY-MM-DD)
      signature_type       TEXT NOT NULL DEFAULT 'typed',  -- 'typed' | 'drawn'
      signature_value      TEXT NOT NULL DEFAULT '',  -- typed: name string; drawn: data-URL PNG
      signed_at            TEXT NOT NULL,             -- server timestamp ISO
      ip_address           TEXT,
      user_agent           TEXT,
      UNIQUE (investor_key_id, listing_id),
      FOREIGN KEY (investor_key_id) REFERENCES investor_keys(id)         ON DELETE CASCADE,
      FOREIGN KEY (listing_id)      REFERENCES marketplace_listings(id)  ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_nda_signatures_investor ON nda_signatures(investor_key_id);
    CREATE INDEX IF NOT EXISTS idx_nda_signatures_listing  ON nda_signatures(listing_id);
    CREATE INDEX IF NOT EXISTS idx_nda_signatures_signedat ON nda_signatures(signed_at);

    CREATE TABLE IF NOT EXISTS capitaflow_submissions (
      id                   TEXT PRIMARY KEY,
      customer_key_id      TEXT,
      customer_name        TEXT NOT NULL,
      form_data            TEXT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'review',
      submitted_at         TEXT NOT NULL,
      finalized_at         TEXT,
      finalized_xlsx_path  TEXT,
      notes                TEXT,
      FOREIGN KEY (customer_key_id) REFERENCES customer_keys(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_capitaflow_subs_status     ON capitaflow_submissions(status);
    CREATE INDEX IF NOT EXISTS idx_capitaflow_subs_key_id     ON capitaflow_submissions(customer_key_id);
    CREATE INDEX IF NOT EXISTS idx_capitaflow_subs_submitted  ON capitaflow_submissions(submitted_at);

    -- Visibility offering — Financial Structure (Phase 1).
    -- One row per GL line for a given customer key. budget_category may be
    -- one of the fixed dropdown options, or 'Your Budget Category' with a
    -- free-text override stored in budget_category_custom.
    CREATE TABLE IF NOT EXISTS gl_accounts (
      id                       TEXT PRIMARY KEY,
      customer_key_id          TEXT NOT NULL,
      gl_number                TEXT NOT NULL,
      gl_name                  TEXT NOT NULL,
      pl_section               TEXT,
      budget_category          TEXT,
      budget_category_custom   TEXT,
      inventory_related        INTEGER NOT NULL DEFAULT 0,
      order_index              INTEGER NOT NULL DEFAULT 0,
      orphan                   INTEGER NOT NULL DEFAULT 0,
      created_at               TEXT NOT NULL,
      updated_at               TEXT NOT NULL,
      FOREIGN KEY (customer_key_id) REFERENCES customer_keys(id) ON DELETE CASCADE,
      UNIQUE (customer_key_id, gl_number)
    );

    CREATE INDEX IF NOT EXISTS idx_gl_accounts_key_id ON gl_accounts(customer_key_id);

    -- Tracks Financial Structure status (editing | completed).
    CREATE TABLE IF NOT EXISTS financial_structure_state (
      customer_key_id  TEXT PRIMARY KEY,
      status           TEXT NOT NULL DEFAULT 'editing',
      updated_at       TEXT NOT NULL,
      FOREIGN KEY (customer_key_id) REFERENCES customer_keys(id) ON DELETE CASCADE
    );

    -- Visibility offering — Organizational Structure (Phase 2).
    -- Polymorphic table holding one row per entry across the five
    -- dimensions (company/division/department/product/activity). All
    -- dimensions are optional and independent per spec §3; Phase 3
    -- budget lines reference entries by id.
    CREATE TABLE IF NOT EXISTS org_entities (
      id                TEXT PRIMARY KEY,
      customer_key_id   TEXT NOT NULL,
      dimension         TEXT NOT NULL,
      name              TEXT NOT NULL,
      order_index       INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      FOREIGN KEY (customer_key_id) REFERENCES customer_keys(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_org_entities_key_dim
      ON org_entities(customer_key_id, dimension);

    -- Tracks Organizational Structure status (editing | completed).
    CREATE TABLE IF NOT EXISTS org_structure_state (
      customer_key_id  TEXT PRIMARY KEY,
      status           TEXT NOT NULL DEFAULT 'editing',
      updated_at       TEXT NOT NULL,
      FOREIGN KEY (customer_key_id) REFERENCES customer_keys(id) ON DELETE CASCADE
    );

    -- Visibility offering — Budgets (Phase 3a).
    -- One row per budget owned by a customer. The five setup choices
    -- (year, granularity, currency, scale, sb_enabled) come from
    -- spec §4. status flips draft → finalized when the user names it
    -- and saves; finalized budgets remain editable (overwrite in
    -- place, no version history per §5.4).
    CREATE TABLE IF NOT EXISTS budgets (
      id              TEXT PRIMARY KEY,
      customer_key_id TEXT NOT NULL,
      name            TEXT NOT NULL DEFAULT '',
      year            INTEGER NOT NULL,
      granularity     TEXT NOT NULL,
      currency        TEXT NOT NULL,
      scale           TEXT NOT NULL,
      sb_enabled      INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'draft',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      FOREIGN KEY (customer_key_id) REFERENCES customer_keys(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_budgets_key_id ON budgets(customer_key_id);

    -- One row per row in the Budget Structure table (spec §5.1).
    -- 5 nullable org-entity FKs + 1 GL FK + free-text service provider
    -- / description + source flag. Period amounts live in
    -- budget_cells so the row stays narrow regardless of granularity.
    CREATE TABLE IF NOT EXISTS budget_lines (
      id                      TEXT PRIMARY KEY,
      budget_id               TEXT NOT NULL,
      company_id              TEXT,
      service_provider_name   TEXT NOT NULL DEFAULT '',
      service_description     TEXT NOT NULL DEFAULT '',
      division_id             TEXT,
      department_id           TEXT,
      product_id              TEXT,
      activity_id             TEXT,
      gl_account_id           TEXT,
      source                  TEXT NOT NULL DEFAULT 'manual',
      order_index             INTEGER NOT NULL DEFAULT 0,
      created_at              TEXT NOT NULL,
      updated_at              TEXT NOT NULL,
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_budget_lines_budget_id ON budget_lines(budget_id);

    -- One amount per (line, period). period_key is M01..M12 / Q1..Q4 /
    -- FY depending on the budget's granularity. FY for monthly/quarterly
    -- budgets is NOT stored (computed on read).
    CREATE TABLE IF NOT EXISTS budget_cells (
      budget_line_id  TEXT NOT NULL,
      period_key      TEXT NOT NULL,
      amount          REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (budget_line_id, period_key),
      FOREIGN KEY (budget_line_id) REFERENCES budget_lines(id) ON DELETE CASCADE
    );

    -- Visibility offering — Salaries & Benefits (Phase 3b, spec §7).
    -- One row per employee allocation. The S&B "group" is implicit: it
    -- is the set of rows for one budget_id. Multiple rows for the same
    -- employee_name split that employee's salary across Org dimensions.
    CREATE TABLE IF NOT EXISTS salaries_rows (
      id                    TEXT PRIMARY KEY,
      budget_id             TEXT NOT NULL,
      company_id            TEXT,
      employee_name         TEXT NOT NULL DEFAULT '',
      division_id           TEXT,
      department_id         TEXT,
      product_id            TEXT,
      activity_id           TEXT,
      product_activity_pct  REAL NOT NULL DEFAULT 0,
      monthly_salary        REAL NOT NULL DEFAULT 0,
      gl_account_id         TEXT,
      order_index           INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL,
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_salaries_rows_budget_id ON salaries_rows(budget_id);

    -- Tracks Salaries & Benefits status (editing | finalized) per budget.
    CREATE TABLE IF NOT EXISTS salaries_state (
      budget_id   TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'editing',
      updated_at  TEXT NOT NULL,
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
    );

    -- ─── CF (Cash Flow) module — per spec §15 ──────────────────────────────
    -- One CashFlow per finalized budget. Parent record; subordinate
    -- sections (payables, receivables, inventory, salaries, manual)
    -- reference cash_flow_id.
    CREATE TABLE IF NOT EXISTS cash_flows (
      id            TEXT PRIMARY KEY,
      budget_id     TEXT NOT NULL UNIQUE,
      opening_cash  REAL NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'finalized'
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
    );

    -- WC → Payables (§3). One row per (Company, P&L Section, Budget
    -- Category, GL?, Service Provider?). payment_term is the §3.6
    -- enum value.
    CREATE TABLE IF NOT EXISTS cf_payables_section (
      cash_flow_id    TEXT PRIMARY KEY,
      opening_balance REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (cash_flow_id) REFERENCES cash_flows(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cf_payables_rows (
      id                    TEXT PRIMARY KEY,
      cash_flow_id          TEXT NOT NULL,
      company_id            TEXT,
      pl_section            TEXT,
      budget_category       TEXT,
      gl_account_id         TEXT,
      service_provider_name TEXT,
      payment_term          TEXT,
      order_index           INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL,
      FOREIGN KEY (cash_flow_id) REFERENCES cash_flows(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cf_payables_rows_cf
      ON cf_payables_rows(cash_flow_id);

    -- "Enter Free amount" prior-period carry-in inputs per row + period.
    CREATE TABLE IF NOT EXISTS cf_payables_prior_carry (
      cf_payables_row_id TEXT NOT NULL,
      period_key         TEXT NOT NULL,
      amount             REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (cf_payables_row_id, period_key),
      FOREIGN KEY (cf_payables_row_id) REFERENCES cf_payables_rows(id) ON DELETE CASCADE
    );

    -- WC → Receivables (§4). Same shape as Payables with customer_name
    -- instead of service_provider_name.
    CREATE TABLE IF NOT EXISTS cf_receivables_section (
      cash_flow_id    TEXT PRIMARY KEY,
      opening_balance REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (cash_flow_id) REFERENCES cash_flows(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cf_receivables_rows (
      id              TEXT PRIMARY KEY,
      cash_flow_id    TEXT NOT NULL,
      company_id      TEXT,
      pl_section      TEXT,           -- always 'Revenues' but stored for symmetry
      budget_category TEXT,           -- default-level grouping (License / Subscription / etc.)
      gl_account_id   TEXT,
      customer_name   TEXT,
      payment_term    TEXT,
      order_index     INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      FOREIGN KEY (cash_flow_id) REFERENCES cash_flows(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cf_receivables_rows_cf
      ON cf_receivables_rows(cash_flow_id);

    CREATE TABLE IF NOT EXISTS cf_receivables_prior_carry (
      cf_receivables_row_id TEXT NOT NULL,
      period_key            TEXT NOT NULL,
      amount                REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (cf_receivables_row_id, period_key),
      FOREIGN KEY (cf_receivables_row_id) REFERENCES cf_receivables_rows(id) ON DELETE CASCADE
    );

    -- WC → Inventory (§5). No allocation grid — just O.B + per-period
    -- Purchases inputs.
    CREATE TABLE IF NOT EXISTS cf_inventory_section (
      cash_flow_id    TEXT PRIMARY KEY,
      opening_balance REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (cash_flow_id) REFERENCES cash_flows(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cf_inventory_purchases (
      cash_flow_id TEXT NOT NULL,
      period_key   TEXT NOT NULL,
      amount       REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (cash_flow_id, period_key),
      FOREIGN KEY (cash_flow_id) REFERENCES cash_flows(id) ON DELETE CASCADE
    );

    -- Salaries & Benefits CF section (§6). O.B + January payment;
    -- Feb–Dec auto from the budget's S&B expense per row formula.
    CREATE TABLE IF NOT EXISTS cf_salaries_section (
      cash_flow_id    TEXT PRIMARY KEY,
      opening_balance REAL NOT NULL DEFAULT 0,
      january_payment REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (cash_flow_id) REFERENCES cash_flows(id) ON DELETE CASCADE
    );

    -- Visibility — Revenues & COGS (Phase 3c, spec "Revenues & COGS" sheet).
    -- One row per product/service line. cells stores monthly quantities
    -- as JSON {M01: qty, ...M12: qty}. On Finalize, pivot-aggregated into
    -- Budget Structure as Revenue lines (price × qty) and COGS lines (cost × qty).
    CREATE TABLE IF NOT EXISTS rc_rows (
      id              TEXT PRIMARY KEY,
      budget_id       TEXT NOT NULL,
      company_id      TEXT,
      division_id     TEXT,
      department_id   TEXT,
      product_id      TEXT,
      activity_id     TEXT,
      rev_gl_id       TEXT,
      price           REAL NOT NULL DEFAULT 0,
      cogs_gl_id      TEXT,
      cost            REAL NOT NULL DEFAULT 0,
      cells           TEXT NOT NULL DEFAULT '{}',
      order_index     INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_rc_rows_budget_id ON rc_rows(budget_id);

    -- Tracks Revenues & COGS status (editing | finalized) per budget.
    CREATE TABLE IF NOT EXISTS rc_state (
      budget_id   TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'editing',
      updated_at  TEXT NOT NULL,
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
    );

    -- Manual sections: Other Adjustments / Financing / Capex (§7, §8, §9).
    -- Rows are free-form (description + per-period amounts).
    CREATE TABLE IF NOT EXISTS cf_manual_rows (
      id            TEXT PRIMARY KEY,
      cash_flow_id  TEXT NOT NULL,
      kind          TEXT NOT NULL,   -- 'other_adj' | 'financing' | 'capex'
      description   TEXT NOT NULL DEFAULT '',
      order_index   INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      FOREIGN KEY (cash_flow_id) REFERENCES cash_flows(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cf_manual_rows_cf_kind
      ON cf_manual_rows(cash_flow_id, kind);

    CREATE TABLE IF NOT EXISTS cf_manual_row_amounts (
      cf_manual_row_id TEXT NOT NULL,
      period_key       TEXT NOT NULL,
      amount           REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (cf_manual_row_id, period_key),
      FOREIGN KEY (cf_manual_row_id) REFERENCES cf_manual_rows(id) ON DELETE CASCADE
    );
  `);

  // Migrations — add new columns to existing tables
  try {
    database.exec(`ALTER TABLE content_items ADD COLUMN qa_history TEXT NOT NULL DEFAULT '[]'`);
  } catch { /* already exists */ }
  try {
    database.exec(`ALTER TABLE linkedin_accounts ADD COLUMN person_urn TEXT NOT NULL DEFAULT ''`);
  } catch { /* already exists */ }
  // CF Receivables: default-level grouping is now (Company, Budget
  // Category). Older DBs only had the symmetry-only pl_section.
  try {
    database.exec(`ALTER TABLE cf_receivables_rows ADD COLUMN budget_category TEXT`);
  } catch { /* already exists */ }
  // GL accounts: inventory_related flag. Lines whose GL is flagged
  // feed the Inventory cycle (Inventory.COGS auto-row, Payables
  // synthetic "Inventory Purchases" row) instead of regular Payables.
  try {
    database.exec(`ALTER TABLE gl_accounts ADD COLUMN inventory_related INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }
  // Budgets: rc_enabled flag for the Revenues & COGS module (Phase 3c).
  try {
    database.exec(`ALTER TABLE budgets ADD COLUMN rc_enabled INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }
  // Marketplace listings: customer-uploaded investor deck PDF (Phase 3).
  try {
    database.exec(`ALTER TABLE marketplace_listings ADD COLUMN deck_pdf_path TEXT`);
  } catch { /* already exists */ }
  // Customer keys: offering column (Visibility vs CapitaFlow). Existing rows
  // default to 'visibility' (per spec — the gate on the home page sends each
  // offering's CTA through its own auth and only matching-offering keys pass).
  try {
    database.exec(`ALTER TABLE customer_keys ADD COLUMN offering TEXT NOT NULL DEFAULT 'visibility'`);
  } catch { /* already exists */ }

  // ─── Security hardening (2026-06-29) ──────────────────────────────────────
  // Customer + investor keys: scrypt hash columns for at-rest protection.
  // The `key` column stays during transition (dual-write so existing customers
  // can still log in). After the backfill migration verifies, drop `key`.
  // `key_prefix` is a non-secret 7-char display value ("VV-AB12") for admin UIs.
  try { database.exec(`ALTER TABLE customer_keys ADD COLUMN key_hash TEXT NOT NULL DEFAULT ''`); } catch { /* exists */ }
  try { database.exec(`ALTER TABLE customer_keys ADD COLUMN key_prefix TEXT NOT NULL DEFAULT ''`); } catch { /* exists */ }
  try { database.exec(`ALTER TABLE investor_keys ADD COLUMN key_hash TEXT NOT NULL DEFAULT ''`); } catch { /* exists */ }
  try { database.exec(`ALTER TABLE investor_keys ADD COLUMN key_prefix TEXT NOT NULL DEFAULT ''`); } catch { /* exists */ }

  // Seed the VV-TEST123 customer key (idempotent) — Visibility offering.
  try {
    database
      .prepare(
        `INSERT OR IGNORE INTO customer_keys (id, key, customer_name, offering, created_at, created_by, revoked)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
      )
      .run('seed-test-key-001', 'VV-TEST123', 'Test Customer', 'visibility', new Date().toISOString(), 'seed');
  } catch (err) {
    console.warn('[DB] Failed to seed test customer key:', err);
  }
  // Seed a CapitaFlow demo key so admins can preview the partner area without
  // minting a new key each session.
  try {
    database
      .prepare(
        `INSERT OR IGNORE INTO customer_keys (id, key, customer_name, offering, created_at, created_by, revoked)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
      )
      .run('seed-cf-key-001', 'VV-CFTEST1', 'Test Customer (CapitaFlow)', 'capitaflow', new Date().toISOString(), 'seed');
  } catch (err) {
    console.warn('[DB] Failed to seed CapitaFlow test key:', err);
  }

  // ── Aegis Health AI — populated Visibility demo customer ──────────────────
  // Seeded so Raphael can showcase a complete walkthrough (GLs mapped, org
  // structure set, a budget populated with 12 months of data) without having
  // to hand-enter values during a sales demo. GL list mirrors the user's
  // 'gl loader.xlsx' file (50000–50010). All inserts are INSERT OR IGNORE
  // so re-running on an existing DB is a no-op.
  try { seedAegisHealthAI(database); } catch (err) {
    console.warn('[DB] Failed to seed Aegis Health AI demo customer:', err);
  }

  console.log('[DB] Schema initialized successfully');
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ── Aegis Health AI demo seed ────────────────────────────────────────────────
// One self-contained Visibility customer with mapped GLs, org structure, and
// a 12-month populated budget. The seed key is VV-AEGIS01; the customer name
// is "Aegis Health AI". Run inside a transaction so a partial failure rolls
// back cleanly. Idempotent via fixed seed IDs + INSERT OR IGNORE.
function seedAegisHealthAI(database: import('better-sqlite3').Database): void {
  const KEY_ID    = 'seed-aegis-key-001';
  const KEY       = 'VV-AEGIS01';
  const CUSTOMER  = 'Aegis Health AI';
  const NOW       = new Date().toISOString();

  // ── 1. Customer key ────────────────────────────────────────────────────────
  database
    .prepare(
      `INSERT OR IGNORE INTO customer_keys (id, key, customer_name, offering, created_at, created_by, revoked)
       VALUES (?, ?, ?, 'visibility', ?, 'seed', 0)`,
    )
    .run(KEY_ID, KEY, CUSTOMER, NOW);

  // If GLs already seeded, skip the rest (idempotent guard).
  const existingGL = database
    .prepare(`SELECT COUNT(*) as c FROM gl_accounts WHERE customer_key_id = ?`)
    .get(KEY_ID) as { c: number };
  if (existingGL.c > 0) return;

  // ── 2. GLs from gl loader.xlsx mapped to Visibility P&L sections + budget cats
  const gls: Array<{ id: string; num: string; name: string; pl: string; cat: string; inv?: number }> = [
    { id: 'seed-aegis-gl-50000', num: '50000', name: 'salaries exp',           pl: 'G&A',                            cat: 'Salaries and benefits' },
    { id: 'seed-aegis-gl-50001', num: '50001', name: 'wages',                  pl: 'COGS',                           cat: 'Salaries and benefits' },
    { id: 'seed-aegis-gl-50002', num: '50002', name: 'conferences',            pl: 'S&M',                            cat: 'Conferences' },
    { id: 'seed-aegis-gl-50003', num: '50003', name: 'subcontractors',         pl: 'R&D',                            cat: 'Subcontractors' },
    { id: 'seed-aegis-gl-50004', num: '50004', name: 'marketing',              pl: 'S&M',                            cat: 'Marketing' },
    { id: 'seed-aegis-gl-50005', num: '50005', name: 'R&D',                    pl: 'R&D',                            cat: 'Tools/Licenses' },
    { id: 'seed-aegis-gl-50006', num: '50006', name: 'professional service',   pl: 'G&A',                            cat: 'Professional services' },
    { id: 'seed-aegis-gl-50007', num: '50007', name: 'Other exp.',             pl: 'G&A',                            cat: 'Other' },
    { id: 'seed-aegis-gl-50008', num: '50008', name: 'revenues',               pl: 'Revenues',                       cat: 'Subscription' },
    { id: 'seed-aegis-gl-50009', num: '50009', name: 'finished goods',         pl: 'COGS',                           cat: 'Materials', inv: 1 },
    { id: 'seed-aegis-gl-50010', num: '50010', name: 'office exp.',            pl: 'G&A',                            cat: 'Office' },
  ];
  const glInsert = database.prepare(
    `INSERT OR IGNORE INTO gl_accounts
       (id, customer_key_id, gl_number, gl_name, pl_section, budget_category,
        budget_category_custom, inventory_related, order_index, orphan, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)`,
  );
  gls.forEach((g, i) => glInsert.run(g.id, KEY_ID, g.num, g.name, g.pl, g.cat, g.inv || 0, i, NOW, NOW));

  database
    .prepare(`INSERT OR REPLACE INTO financial_structure_state (customer_key_id, status, updated_at) VALUES (?, 'completed', ?)`)
    .run(KEY_ID, NOW);

  // ── 3. Org structure ──────────────────────────────────────────────────────
  const orgs: Array<{ id: string; dim: string; name: string }> = [
    { id: 'seed-aegis-co-1',   dim: 'company',    name: 'Aegis Health AI' },
    { id: 'seed-aegis-div-1',  dim: 'division',   name: 'Commercial' },
    { id: 'seed-aegis-div-2',  dim: 'division',   name: 'R&D' },
    { id: 'seed-aegis-dep-1',  dim: 'department', name: 'Engineering' },
    { id: 'seed-aegis-dep-2',  dim: 'department', name: 'Sales' },
    { id: 'seed-aegis-dep-3',  dim: 'department', name: 'Marketing' },
    { id: 'seed-aegis-dep-4',  dim: 'department', name: 'Operations' },
    { id: 'seed-aegis-prd-1',  dim: 'product',    name: 'Diagnostic Platform' },
    { id: 'seed-aegis-prd-2',  dim: 'product',    name: 'Clinical Decision Support' },
    { id: 'seed-aegis-act-1',  dim: 'activity',   name: 'Development' },
    { id: 'seed-aegis-act-2',  dim: 'activity',   name: 'Sales' },
    { id: 'seed-aegis-act-3',  dim: 'activity',   name: 'Support' },
  ];
  const orgInsert = database.prepare(
    `INSERT OR IGNORE INTO org_entities (id, customer_key_id, dimension, name, order_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  orgs.forEach((o, i) => orgInsert.run(o.id, KEY_ID, o.dim, o.name, i, NOW, NOW));

  database
    .prepare(`INSERT OR REPLACE INTO org_structure_state (customer_key_id, status, updated_at) VALUES (?, 'completed', ?)`)
    .run(KEY_ID, NOW);

  // ── 4. Budget (FY2026, Monthly, USD, Standard) ─────────────────────────────
  const BUDGET_ID = 'seed-aegis-budget-001';
  database
    .prepare(
      `INSERT OR IGNORE INTO budgets
         (id, customer_key_id, name, year, granularity, currency, scale, sb_enabled, status, created_at, updated_at)
       VALUES (?, ?, 'FY2026 Operating Plan', 2026, 'monthly', 'USD', 'standard', 0, 'finalized', ?, ?)`,
    )
    .run(BUDGET_ID, KEY_ID, NOW, NOW);

  // Monthly period keys M01–M12 per repo convention.
  const MONTHS = ['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];

  // One line per GL with realistic per-month amounts. Revenues are stored as
  // negative numbers (Visibility convention §1 of CF spec). Growth profile:
  // revenue ramps 200 → 380 over the year; salaries flat; marketing builds.
  const lines: Array<{ id: string; gl: string; provider: string; desc: string; div: string; dep: string; prod: string; act: string; amounts: number[] }> = [
    { id: 'seed-aegis-bl-rev',  gl: 'seed-aegis-gl-50008', provider: 'Hospital Networks',    desc: 'SaaS subscription revenue',  div: 'seed-aegis-div-1', dep: 'seed-aegis-dep-2', prod: 'seed-aegis-prd-1', act: 'seed-aegis-act-2',
      amounts: [-200000,-215000,-230000,-245000,-260000,-275000,-290000,-305000,-320000,-340000,-360000,-380000] },
    { id: 'seed-aegis-bl-sal',  gl: 'seed-aegis-gl-50000', provider: 'Employees Salaries',   desc: 'G&A salaries',               div: 'seed-aegis-div-1', dep: 'seed-aegis-dep-4', prod: '',                  act: '',
      amounts: Array(12).fill(180000) },
    { id: 'seed-aegis-bl-wage', gl: 'seed-aegis-gl-50001', provider: 'Employees Salaries',   desc: 'Clinical ops wages (COGS)',  div: 'seed-aegis-div-1', dep: 'seed-aegis-dep-4', prod: 'seed-aegis-prd-1', act: 'seed-aegis-act-3',
      amounts: Array(12).fill(80000) },
    { id: 'seed-aegis-bl-conf', gl: 'seed-aegis-gl-50002', provider: 'HIMSS / RSNA',         desc: 'Industry conferences',       div: 'seed-aegis-div-1', dep: 'seed-aegis-dep-3', prod: '',                  act: '',
      amounts: [0,0,15000,0,0,0,0,0,20000,0,0,25000] },
    { id: 'seed-aegis-bl-sub',  gl: 'seed-aegis-gl-50003', provider: 'NeuroLabs Inc',        desc: 'ML model annotation',        div: 'seed-aegis-div-2', dep: 'seed-aegis-dep-1', prod: 'seed-aegis-prd-1', act: 'seed-aegis-act-1',
      amounts: Array(12).fill(20000) },
    { id: 'seed-aegis-bl-mkt',  gl: 'seed-aegis-gl-50004', provider: 'Demand Gen Agency',    desc: 'Digital marketing',          div: 'seed-aegis-div-1', dep: 'seed-aegis-dep-3', prod: 'seed-aegis-prd-1', act: 'seed-aegis-act-2',
      amounts: [20000,22000,24000,26000,28000,30000,30000,32000,34000,36000,38000,40000] },
    { id: 'seed-aegis-bl-rd',   gl: 'seed-aegis-gl-50005', provider: 'AWS GPU / OpenAI',     desc: 'R&D compute & tooling',      div: 'seed-aegis-div-2', dep: 'seed-aegis-dep-1', prod: 'seed-aegis-prd-2', act: 'seed-aegis-act-1',
      amounts: Array(12).fill(15000) },
    { id: 'seed-aegis-bl-prof', gl: 'seed-aegis-gl-50006', provider: 'Cooley / EY',          desc: 'Legal & audit',              div: 'seed-aegis-div-1', dep: 'seed-aegis-dep-4', prod: '',                  act: '',
      amounts: Array(12).fill(10000) },
    { id: 'seed-aegis-bl-oth',  gl: 'seed-aegis-gl-50007', provider: 'Misc vendors',         desc: 'Other operating',            div: 'seed-aegis-div-1', dep: 'seed-aegis-dep-4', prod: '',                  act: '',
      amounts: Array(12).fill(3000) },
    { id: 'seed-aegis-bl-fg',   gl: 'seed-aegis-gl-50009', provider: 'OEM Supplier',         desc: 'Device materials (COGS)',    div: 'seed-aegis-div-1', dep: 'seed-aegis-dep-4', prod: 'seed-aegis-prd-1', act: 'seed-aegis-act-3',
      amounts: [25000,27000,29000,30000,32000,33000,34000,35000,36000,38000,40000,42000] },
    { id: 'seed-aegis-bl-off',  gl: 'seed-aegis-gl-50010', provider: 'WeWork',               desc: 'Office rent & supplies',     div: 'seed-aegis-div-1', dep: 'seed-aegis-dep-4', prod: '',                  act: '',
      amounts: Array(12).fill(8000) },
  ];

  const lineInsert = database.prepare(
    `INSERT OR IGNORE INTO budget_lines
       (id, budget_id, company_id, service_provider_name, service_description,
        division_id, department_id, product_id, activity_id, gl_account_id,
        source, order_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)`,
  );
  const cellInsert = database.prepare(
    `INSERT OR IGNORE INTO budget_cells (budget_line_id, period_key, amount) VALUES (?, ?, ?)`,
  );
  lines.forEach((l, i) => {
    lineInsert.run(
      l.id, BUDGET_ID, 'seed-aegis-co-1', l.provider, l.desc,
      l.div || null, l.dep || null, l.prod || null, l.act || null, l.gl,
      i, NOW, NOW,
    );
    l.amounts.forEach((amt, mIdx) => cellInsert.run(l.id, MONTHS[mIdx], amt));
  });

  console.log('[DB] Seeded Aegis Health AI demo customer (key: VV-AEGIS01)');
}
