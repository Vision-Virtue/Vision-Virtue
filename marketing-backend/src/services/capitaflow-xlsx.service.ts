/* ============================================================
   CapitaFlow Customer Area — xlsx generator (parent side)

   The actual ExcelJS work runs in a forked child process
   (src/workers/xlsx-worker.ts) so a heap blow-up while loading
   the Financial Model v7 template can never take the API down.

   This file is responsible for: locating the template,
   resolving output paths, serializing concurrent requests
   through a single-flight queue, and forking + supervising
   the worker.
   ============================================================ */

import { fork } from 'child_process';
import path from 'path';
import fs from 'fs';
import {
  extractBusinessCalcs, appendBusinessCalcsSheet, listWorkbookSheetNames,
} from './business-calcs.service';

// ─── Storage location for generated xlsx ─────────────────────────────────────

function customerXlsxDir(): string {
  // Same parent as DB_PATH (the persistent disk on Render).
  const dbPath = process.env.DB_PATH || './data/marketing.db';
  return path.join(path.dirname(path.resolve(dbPath)), 'customer-xlsx');
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function templatePath(): string {
  // Bumped v8 → v9 (2026-06-08). v9 changes:
  //  * Section 8 (Unit Costs) removed; cost is now a per-row column in
  //    Section 7 (Let's Scale).
  //  * Section 7 collapsed from three revenue-type blocks (HW/SW/Other)
  //    into one continuous block at rows 44-63 with Revenue Type as the
  //    leading column.
  //  * Old Section 9 (FTE) renumbered to Section 8 and moved to rows 68-71.
  //  * Definitions sheet ships a much richer revenue-type list.
  return path.resolve(process.cwd(), 'templates', 'Financial Model v9.xlsx');
}

function workerPath(): string {
  // After tsc, this file lives at dist/services/capitaflow-xlsx.service.js
  // and the worker at dist/workers/xlsx-worker.js. In dev (ts-node) it's
  // src/services/...; ts-node-dev compiles the worker too so the .js path
  // would not exist — fall back to .ts for that case.
  const compiled = path.join(__dirname, '..', 'workers', 'xlsx-worker.js');
  if (fs.existsSync(compiled)) return compiled;
  return path.join(__dirname, '..', 'workers', 'xlsx-worker.ts');
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface SubmissionFormData {
  general?: {
    sector?: string; round?: string; capitalGoal?: string;
    yearsSinceFound?: string; firstYear?: string;
  };
  customers?: Array<{ name?: string; type?: string; territory?: string }>;
  products?: Array<{ name?: string; revenueType?: string; price?: string }>;
  letsScale?: Array<{
    customerName?: string; type?: string; territory?: string;
    productName?: string; revenueType?: string; price?: string;
    q1?: string; q2?: string; q3?: string; q4?: string; y2?: string;
  }>;
  unitCosts?: Array<{ productName?: string; cost?: string }>;
  fte?: {
    cogs_y1?: string; cogs_y2?: string;
    rd_y1?: string;   rd_y2?: string;
    sm_y1?: string;   sm_y2?: string;
    ga_y1?: string;   ga_y2?: string;
  };
  /** Investor-deck answers — keys match InvestorDeckField.fieldKey. */
  investorDeck?: Record<string, string | number | null | undefined>;
}

export interface PopulateResult {
  /** Absolute path to the saved file. */
  filePath: string;
  /** File name (no directory). */
  fileName: string;
}

// ─── Single-flight queue ─────────────────────────────────────────────────────
//
// Even with worker isolation, we cap concurrency at one. A single ExcelJS
// load already peaks ~400 MB; running two children in parallel would
// approach the container's 512 MB ceiling and risk an OS-level OOM kill.

let xlsxQueue: Promise<unknown> = Promise.resolve();

export function generateFinalizedXlsx(
  submissionId: string,
  customerName: string,
  formData: SubmissionFormData,
  customerKeyId?: string,
): Promise<PopulateResult> {
  const next = xlsxQueue.then(
    () => generateAndPostProcess(submissionId, customerName, formData, customerKeyId),
    () => generateAndPostProcess(submissionId, customerName, formData, customerKeyId),
  );
  xlsxQueue = next.catch(() => undefined);
  return next;
}

// After the worker produces the base xlsx, append the supplemental
// "Business Presentation Calcs" sheet if the customer has uploaded
// supporting docs. Best-effort — a failure here never blocks the
// xlsx itself; the customer/admin still gets the standard workbook.
async function generateAndPostProcess(
  submissionId: string,
  customerName: string,
  formData: SubmissionFormData,
  customerKeyId?: string,
): Promise<PopulateResult> {
  const result = await generateInChild(submissionId, customerName, formData);
  if (!customerKeyId) return result;
  try {
    const sheetNames = await listWorkbookSheetNames(result.filePath);
    const calcs = await extractBusinessCalcs({ customerKeyId, workbookSheetNames: sheetNames, customerName });
    if (calcs.length) {
      await appendBusinessCalcsSheet(result.filePath, calcs);
      console.log(`[capitaflow-xlsx] appended Business Presentation Calcs (${calcs.length} rows) for ${customerName}`);
    }
  } catch (err) {
    console.warn('[capitaflow-xlsx] business-calcs post-process failed:', err);
  }
  return result;
}

// ─── Worker supervision ──────────────────────────────────────────────────────

function generateInChild(
  submissionId: string,
  customerName: string,
  formData: SubmissionFormData,
): Promise<PopulateResult> {
  const tplPath = templatePath();
  if (!fs.existsSync(tplPath)) {
    return Promise.reject(new Error(`Template not found at ${tplPath}`));
  }

  const outDir = customerXlsxDir();
  ensureDir(outDir);
  const safeName = customerName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'customer';
  const fileName = `${safeName}__${submissionId}.xlsx`;
  const filePath = path.join(outDir, fileName);

  return new Promise<PopulateResult>((resolve, reject) => {
    const child = fork(workerPath(), [], {
      // Independent V8 heap for the child. Pushed close to the container
      // limit (512 MB) since we serialize via the queue — only one child
      // is ever alive at a time, so we don't have to share with another
      // generator. Parent baseline is ~80 MB so 460 + 80 ≈ 540 MB is
      // tight; we accept that the OS may swap briefly during the peak.
      execArgv: ['--max-old-space-size=460'],
      // Strip any inherited NODE_OPTIONS so the parent's --max-old-space-size
      // doesn't override our execArgv setting in the child.
      env: { ...process.env, NODE_OPTIONS: '' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });

    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => {
        try { child.kill('SIGKILL'); } catch { /* noop */ }
        reject(new Error('xlsx generation timed out after 90s'));
      });
    }, 90_000);

    child.on('message', (msg: unknown) => {
      const m = msg as { ok?: boolean; error?: string } | null;
      settle(() => {
        if (m && m.ok) resolve({ filePath, fileName });
        else reject(new Error(m?.error || 'xlsx worker failed'));
      });
    });

    child.on('exit', (code, signal) => {
      settle(() => {
        reject(new Error(`xlsx worker exited unexpectedly (code=${code}, signal=${signal})`));
      });
    });

    child.on('error', (err) => {
      settle(() => reject(err));
    });

    child.send({ customerName, formData, templatePath: tplPath, filePath });
  });
}

// ─── Lookup helper used by the download endpoint ─────────────────────────────

/** Returns the absolute path for a stored xlsx (or null if missing). */
export function resolveStoredXlsx(filePath: string): string | null {
  if (!filePath) return null;
  // Accept both stored absolute paths (older) and bare filenames.
  const candidate = path.isAbsolute(filePath)
    ? filePath
    : path.join(customerXlsxDir(), filePath);
  return fs.existsSync(candidate) ? candidate : null;
}

// ─── Reupload — admin manually edits the xlsx and uploads it back ────────────

/**
 * Persists an admin-uploaded xlsx for a submission, overwriting any
 * previously generated/uploaded file. Returns the bare file name so the
 * caller can store it in `finalized_xlsx_path`.
 *
 * The buffer is validated as a zip (xlsx is a zip) — anything else is
 * rejected outright before we touch disk.
 */
export function storeUploadedXlsx(
  submissionId: string,
  customerName: string,
  buffer: Buffer,
): { filePath: string; fileName: string } {
  // xlsx files are always zip — magic bytes 'PK\x03\x04' (or 'PK\x05\x06'
  // for an empty archive, which we shouldn't accept).
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 || buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 || buffer[3] !== 0x04
  ) {
    throw new Error('Uploaded file is not a valid xlsx (zip) file');
  }

  const outDir = customerXlsxDir();
  ensureDir(outDir);
  const safeName = customerName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'customer';
  const fileName = `${safeName}__${submissionId}.xlsx`;
  const filePath = path.join(outDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return { filePath, fileName };
}
