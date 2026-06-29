/* ============================================================
   Auto-migration runner — invoked from server.ts on every boot.

   IDEMPOTENT: only acts on rows that haven't been migrated yet.
   - Already-hashed customer/investor keys are skipped
   - Already-encrypted columns are skipped (envelope prefix check)
   Safe to run on every boot; first boot does the heavy work,
   subsequent boots are sub-millisecond.
   ============================================================ */

import { getDb } from '../db/database';
import { hashKey, keyDisplayPrefix } from '../db/keyHash';
import { encryptString, encryptNumber, isEncrypted } from '../db/encryption';

interface MigrationSummary {
  keys: { customerHashed: number; investorHashed: number; skipped: number };
  salaries: { empNamesEncrypted: number; salariesEncrypted: number; skipped: number };
  budgetLines: { providersEncrypted: number; descriptionsEncrypted: number; skipped: number };
  cfRows: { payablesVendorsEncrypted: number; receivablesCustomersEncrypted: number; skipped: number };
  durationMs: number;
}

/** Hash customer + investor keys whose key_hash column is empty. */
async function hashAllKeys(): Promise<{ customerHashed: number; investorHashed: number; skipped: number }> {
  const db = getDb();
  let customerHashed = 0, investorHashed = 0, skipped = 0;

  for (const table of ['customer_keys', 'investor_keys'] as const) {
    const rows = db
      .prepare(`SELECT id, key FROM ${table} WHERE (key_hash IS NULL OR key_hash = '') AND key IS NOT NULL AND key != ''`)
      .all() as { id: string; key: string }[];
    const update = db.prepare(`UPDATE ${table} SET key_hash = ?, key_prefix = ? WHERE id = ?`);
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      const hash = await hashKey(row.key);
      const prefix = keyDisplayPrefix(row.key);
      update.run(hash, prefix, row.id);
      if (table === 'customer_keys') customerHashed++; else investorHashed++;
    }
    skipped += (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE key_hash IS NOT NULL AND key_hash != ''`).get() as { n: number }).n;
  }
  return { customerHashed, investorHashed, skipped };
}

/** Encrypt salaries_rows employee_name + monthly_salary that are still cleartext. */
function encryptSalaries(): { empNamesEncrypted: number; salariesEncrypted: number; skipped: number } {
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, employee_name, monthly_salary FROM salaries_rows`)
    .all() as { id: string; employee_name: string | null; monthly_salary: string | number | null }[];

  const update = db.prepare(`UPDATE salaries_rows SET employee_name = ?, monthly_salary = ? WHERE id = ?`);
  let empNamesEncrypted = 0, salariesEncrypted = 0, skipped = 0;

  for (const r of rows) {
    const nameNeeds = typeof r.employee_name === 'string' && r.employee_name !== '' && !isEncrypted(r.employee_name);
    const salNeeds  = r.monthly_salary != null && (
      typeof r.monthly_salary === 'number' ||
      (typeof r.monthly_salary === 'string' && !isEncrypted(r.monthly_salary))
    );
    if (!nameNeeds && !salNeeds) { skipped++; continue; }

    const newName = nameNeeds
      ? (encryptString(r.employee_name as string) ?? '')
      : (r.employee_name ?? '');
    const newSal = salNeeds
      ? (encryptNumber(typeof r.monthly_salary === 'number' ? r.monthly_salary : Number(r.monthly_salary)) ?? '0')
      : (r.monthly_salary ?? '0');
    update.run(newName, newSal, r.id);
    if (nameNeeds) empNamesEncrypted++;
    if (salNeeds) salariesEncrypted++;
  }
  return { empNamesEncrypted, salariesEncrypted, skipped };
}

/** Encrypt budget_lines vendor + description fields. */
function encryptBudgetLines(): { providersEncrypted: number; descriptionsEncrypted: number; skipped: number } {
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, service_provider_name, service_description FROM budget_lines`)
    .all() as { id: string; service_provider_name: string | null; service_description: string | null }[];

  const update = db.prepare(`UPDATE budget_lines SET service_provider_name = ?, service_description = ? WHERE id = ?`);
  let providersEncrypted = 0, descriptionsEncrypted = 0, skipped = 0;

  for (const r of rows) {
    const provNeeds = typeof r.service_provider_name === 'string' && r.service_provider_name !== '' && !isEncrypted(r.service_provider_name);
    const descNeeds = typeof r.service_description  === 'string' && r.service_description  !== '' && !isEncrypted(r.service_description);
    if (!provNeeds && !descNeeds) { skipped++; continue; }
    const newProv = provNeeds ? (encryptString(r.service_provider_name as string) ?? '') : (r.service_provider_name ?? '');
    const newDesc = descNeeds ? (encryptString(r.service_description  as string) ?? '') : (r.service_description  ?? '');
    update.run(newProv, newDesc, r.id);
    if (provNeeds) providersEncrypted++;
    if (descNeeds) descriptionsEncrypted++;
  }
  return { providersEncrypted, descriptionsEncrypted, skipped };
}

/** Encrypt CF payables vendor names + CF receivables customer names. */
function encryptCfRows(): { payablesVendorsEncrypted: number; receivablesCustomersEncrypted: number; skipped: number } {
  const db = getDb();
  let payablesVendorsEncrypted = 0, receivablesCustomersEncrypted = 0, skipped = 0;

  const payRows = db
    .prepare(`SELECT id, service_provider_name FROM cf_payables_rows WHERE service_provider_name IS NOT NULL AND service_provider_name != ''`)
    .all() as { id: string; service_provider_name: string }[];
  const updPay = db.prepare(`UPDATE cf_payables_rows SET service_provider_name = ? WHERE id = ?`);
  for (const r of payRows) {
    if (isEncrypted(r.service_provider_name)) { skipped++; continue; }
    updPay.run(encryptString(r.service_provider_name) ?? '', r.id);
    payablesVendorsEncrypted++;
  }

  const recRows = db
    .prepare(`SELECT id, customer_name FROM cf_receivables_rows WHERE customer_name IS NOT NULL AND customer_name != ''`)
    .all() as { id: string; customer_name: string }[];
  const updRec = db.prepare(`UPDATE cf_receivables_rows SET customer_name = ? WHERE id = ?`);
  for (const r of recRows) {
    if (isEncrypted(r.customer_name)) { skipped++; continue; }
    updRec.run(encryptString(r.customer_name) ?? '', r.id);
    receivablesCustomersEncrypted++;
  }
  return { payablesVendorsEncrypted, receivablesCustomersEncrypted, skipped };
}

/** Run every migration. Idempotent — safe to call on every boot. */
export async function runAutoMigrations(): Promise<MigrationSummary> {
  const t0 = Date.now();
  const keys        = await hashAllKeys();
  const salaries    = encryptSalaries();
  const budgetLines = encryptBudgetLines();
  const cfRows      = encryptCfRows();
  return { keys, salaries, budgetLines, cfRows, durationMs: Date.now() - t0 };
}

/** Pretty-print summary for server logs. Logs nothing if everything was already
 *  migrated (the common case after the first successful boot). */
export function logMigrationSummary(s: MigrationSummary, log: (msg: string) => void = console.log): void {
  const work =
    s.keys.customerHashed + s.keys.investorHashed +
    s.salaries.empNamesEncrypted + s.salaries.salariesEncrypted +
    s.budgetLines.providersEncrypted + s.budgetLines.descriptionsEncrypted +
    s.cfRows.payablesVendorsEncrypted + s.cfRows.receivablesCustomersEncrypted;
  if (work === 0) {
    log(`[migrations] no work to do (${s.durationMs}ms) — all sensitive columns already encrypted, all keys hashed`);
    return;
  }
  log(`[migrations] completed in ${s.durationMs}ms:`);
  if (s.keys.customerHashed) log(`  - customer keys hashed: ${s.keys.customerHashed}`);
  if (s.keys.investorHashed) log(`  - investor keys hashed: ${s.keys.investorHashed}`);
  if (s.salaries.empNamesEncrypted)               log(`  - salary employee_name encrypted: ${s.salaries.empNamesEncrypted}`);
  if (s.salaries.salariesEncrypted)               log(`  - salary monthly_salary encrypted: ${s.salaries.salariesEncrypted}`);
  if (s.budgetLines.providersEncrypted)           log(`  - budget_line vendor encrypted: ${s.budgetLines.providersEncrypted}`);
  if (s.budgetLines.descriptionsEncrypted)        log(`  - budget_line description encrypted: ${s.budgetLines.descriptionsEncrypted}`);
  if (s.cfRows.payablesVendorsEncrypted)          log(`  - cf_payables vendor encrypted: ${s.cfRows.payablesVendorsEncrypted}`);
  if (s.cfRows.receivablesCustomersEncrypted)     log(`  - cf_receivables customer encrypted: ${s.cfRows.receivablesCustomersEncrypted}`);
}
