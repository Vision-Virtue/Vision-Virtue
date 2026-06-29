/* ============================================================
   One-time migration: encrypt existing cleartext salary rows.

   Idempotent — encryption format starts with "v1:" so we skip
   any row already encrypted.

   What this migrates:
   - salaries_rows.employee_name (string → AES-256-GCM envelope)
   - salaries_rows.monthly_salary (number → AES-256-GCM envelope as text)

   Usage on Render:
     # After deploy with DATA_ENCRYPTION_KEY set:
     node dist/scripts/encryptSalaries.js

   Local:
     npx ts-node src/scripts/encryptSalaries.ts
   ============================================================ */

import dotenv from 'dotenv';
dotenv.config();

import { getDb } from '../db/database';
import { encryptString, encryptNumber, isEncrypted, verifyEncryptionKey } from '../db/encryption';

interface Row {
  id: string;
  employee_name: string | null;
  monthly_salary: string | number | null;
}

function migrate(): void {
  verifyEncryptionKey(); // Fail fast if DATA_ENCRYPTION_KEY is broken

  const db = getDb();
  const rows = db
    .prepare(`SELECT id, employee_name, monthly_salary FROM salaries_rows`)
    .all() as Row[];

  console.log(`[encryptSalaries] inspecting ${rows.length} salary row(s)`);

  const update = db.prepare(
    `UPDATE salaries_rows SET employee_name = ?, monthly_salary = ? WHERE id = ?`,
  );

  let encEmpName = 0, encSalary = 0, skipped = 0;
  for (const r of rows) {
    const nameNeedsEnc = typeof r.employee_name === 'string'
      && r.employee_name !== ''
      && !isEncrypted(r.employee_name);
    const salaryNeedsEnc = r.monthly_salary != null
      && (typeof r.monthly_salary === 'number'
          || (typeof r.monthly_salary === 'string' && !isEncrypted(r.monthly_salary)));

    if (!nameNeedsEnc && !salaryNeedsEnc) { skipped++; continue; }

    const newName = nameNeedsEnc
      ? (encryptString(r.employee_name as string) ?? '')
      : r.employee_name ?? '';
    const newSalary = salaryNeedsEnc
      ? (encryptNumber(typeof r.monthly_salary === 'number' ? r.monthly_salary : Number(r.monthly_salary)) ?? '0')
      : r.monthly_salary ?? '0';
    update.run(newName, newSalary, r.id);

    if (nameNeedsEnc) encEmpName++;
    if (salaryNeedsEnc) encSalary++;
  }

  console.log(`[encryptSalaries] encrypted employee_name: ${encEmpName}`);
  console.log(`[encryptSalaries] encrypted monthly_salary: ${encSalary}`);
  console.log(`[encryptSalaries] already-encrypted (skipped): ${skipped}`);
  console.log('[encryptSalaries] done');
}

/** P1-2 migration: encrypt budget_lines vendor + description fields. */
function migrateBudgetLines(): void {
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, service_provider_name, service_description FROM budget_lines`)
    .all() as { id: string; service_provider_name: string | null; service_description: string | null }[];

  console.log(`[encryptBudgetLines] inspecting ${rows.length} budget line(s)`);
  const update = db.prepare(
    `UPDATE budget_lines SET service_provider_name = ?, service_description = ? WHERE id = ?`,
  );

  let encProvider = 0, encDesc = 0, skipped = 0;
  for (const r of rows) {
    const needProv = typeof r.service_provider_name === 'string' && r.service_provider_name !== '' && !isEncrypted(r.service_provider_name);
    const needDesc = typeof r.service_description === 'string' && r.service_description !== '' && !isEncrypted(r.service_description);
    if (!needProv && !needDesc) { skipped++; continue; }
    const newProv = needProv ? (encryptString(r.service_provider_name as string) ?? '') : r.service_provider_name ?? '';
    const newDesc = needDesc ? (encryptString(r.service_description as string) ?? '') : r.service_description ?? '';
    update.run(newProv, newDesc, r.id);
    if (needProv) encProvider++;
    if (needDesc) encDesc++;
  }
  console.log(`[encryptBudgetLines] encrypted service_provider_name: ${encProvider}`);
  console.log(`[encryptBudgetLines] encrypted service_description: ${encDesc}`);
  console.log(`[encryptBudgetLines] already-encrypted (skipped): ${skipped}`);
}

/** P1-2 migration: encrypt CF payables vendor names + receivables customer names. */
function migrateCfRows(): void {
  const db = getDb();
  // Payables
  const payRows = db
    .prepare(`SELECT id, service_provider_name FROM cf_payables_rows WHERE service_provider_name IS NOT NULL`)
    .all() as { id: string; service_provider_name: string }[];
  console.log(`[encryptCfPayables] inspecting ${payRows.length} vendor row(s)`);
  const updPay = db.prepare(`UPDATE cf_payables_rows SET service_provider_name = ? WHERE id = ?`);
  let encPay = 0, skipPay = 0;
  for (const r of payRows) {
    if (isEncrypted(r.service_provider_name)) { skipPay++; continue; }
    updPay.run(encryptString(r.service_provider_name) ?? '', r.id);
    encPay++;
  }
  console.log(`[encryptCfPayables] encrypted: ${encPay}, skipped: ${skipPay}`);

  // Receivables
  const recRows = db
    .prepare(`SELECT id, customer_name FROM cf_receivables_rows WHERE customer_name IS NOT NULL`)
    .all() as { id: string; customer_name: string }[];
  console.log(`[encryptCfReceivables] inspecting ${recRows.length} customer row(s)`);
  const updRec = db.prepare(`UPDATE cf_receivables_rows SET customer_name = ? WHERE id = ?`);
  let encRec = 0, skipRec = 0;
  for (const r of recRows) {
    if (isEncrypted(r.customer_name)) { skipRec++; continue; }
    updRec.run(encryptString(r.customer_name) ?? '', r.id);
    encRec++;
  }
  console.log(`[encryptCfReceivables] encrypted: ${encRec}, skipped: ${skipRec}`);
}

try {
  migrate();
  migrateBudgetLines();
  migrateCfRows();
  process.exit(0);
} catch (err) {
  console.error('[encryptSalaries] FAILED:', err);
  process.exit(1);
}
