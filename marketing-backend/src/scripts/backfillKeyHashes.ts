/* ============================================================
   One-time migration: backfill scrypt hashes for existing
   customer_keys + investor_keys rows.

   Idempotent — safe to run multiple times. Only hashes rows
   where key_hash is empty AND key (cleartext) is present.

   After running this script + verifying production lookups work
   for at least one billing cycle, run dropCleartextKeys.ts to
   drop the legacy `key` column.

   Usage on Render:
     # SSH into the service container
     node dist/scripts/backfillKeyHashes.js

   Local:
     npx ts-node src/scripts/backfillKeyHashes.ts
   ============================================================ */

import dotenv from 'dotenv';
dotenv.config();

import { getDb } from '../db/database';
import { hashKey, keyDisplayPrefix } from '../db/keyHash';

async function backfill(table: 'customer_keys' | 'investor_keys'): Promise<void> {
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, key FROM ${table} WHERE (key_hash IS NULL OR key_hash = '') AND key IS NOT NULL AND key != ''`)
    .all() as { id: string; key: string }[];

  console.log(`[backfill] ${table}: ${rows.length} row(s) to hash`);

  const update = db.prepare(`UPDATE ${table} SET key_hash = ?, key_prefix = ? WHERE id = ?`);

  let done = 0;
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    const hash = await hashKey(row.key);
    const prefix = keyDisplayPrefix(row.key);
    update.run(hash, prefix, row.id);
    done++;
    if (done % 50 === 0) console.log(`[backfill] ${table}: ${done}/${rows.length}`);
  }
  console.log(`[backfill] ${table}: complete (${done} hashed)`);
}

async function main(): Promise<void> {
  console.log('=== Customer key backfill ===');
  console.log('NOTE: Cleartext keys remain in the DB after this script for the dual-write transition.');
  console.log('Run dropCleartextKeys.ts after verifying production lookups (recommended: 1 billing cycle).\n');
  await backfill('customer_keys');
  await backfill('investor_keys');
  console.log('\n=== Done ===');
  process.exit(0);
}

main().catch(err => {
  console.error('[backfill] FAILED:', err);
  process.exit(1);
});
