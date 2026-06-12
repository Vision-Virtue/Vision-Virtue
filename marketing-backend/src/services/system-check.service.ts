/* ============================================================
   System-check service
   Reports which optional system dependencies are actually present
   in the running image — used by the admin diagnostic endpoint to
   confirm libreoffice (PPTX → PDF auto-conversion) is available.
   ============================================================ */

import { spawnSync } from 'child_process';

export interface SystemCheck {
  libreoffice: { available: boolean; binary: string | null; version: string | null; error: string | null };
}

function tryRun(bin: string, args: string[]): { stdout: string; stderr: string; code: number } {
  try {
    const res = spawnSync(bin, args, { timeout: 5_000, encoding: 'utf8' });
    return {
      stdout: (res.stdout || '').trim(),
      stderr: (res.stderr || '').trim(),
      code: typeof res.status === 'number' ? res.status : -1,
    };
  } catch (err) {
    return { stdout: '', stderr: err instanceof Error ? err.message : String(err), code: -1 };
  }
}

export function runSystemCheck(): SystemCheck {
  const candidates = [process.env.LIBREOFFICE_BIN, 'libreoffice', 'soffice', '/usr/bin/libreoffice', '/usr/bin/soffice']
    .filter((x): x is string => !!x);

  let result: SystemCheck['libreoffice'] = { available: false, binary: null, version: null, error: null };
  for (const bin of candidates) {
    const r = tryRun(bin, ['--version']);
    if (r.code === 0 && r.stdout) {
      result = { available: true, binary: bin, version: r.stdout.split('\n')[0], error: null };
      break;
    }
    if (!result.error && (r.stderr || r.code === -1)) {
      result.error = `${bin}: ${r.stderr || 'not found'}`.slice(0, 200);
    }
  }
  return { libreoffice: result };
}
