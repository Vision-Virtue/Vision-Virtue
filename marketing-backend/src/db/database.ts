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

function initializeSchema(database: Database.Database): void {
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
      created_at      TEXT NOT NULL,
      created_by      TEXT NOT NULL DEFAULT 'admin',
      revoked         INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_customer_keys_key ON customer_keys(key);

    CREATE TABLE IF NOT EXISTS partner_submissions (
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

    CREATE INDEX IF NOT EXISTS idx_partner_subs_status     ON partner_submissions(status);
    CREATE INDEX IF NOT EXISTS idx_partner_subs_key_id     ON partner_submissions(customer_key_id);
    CREATE INDEX IF NOT EXISTS idx_partner_subs_submitted  ON partner_submissions(submitted_at);

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

  // Seed the VV-TEST123 customer key (idempotent)
  try {
    database
      .prepare(
        `INSERT OR IGNORE INTO customer_keys (id, key, customer_name, created_at, created_by, revoked)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .run('seed-test-key-001', 'VV-TEST123', 'Test Customer', new Date().toISOString(), 'seed');
  } catch (err) {
    console.warn('[DB] Failed to seed test customer key:', err);
  }

  console.log('[DB] Schema initialized successfully');
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
