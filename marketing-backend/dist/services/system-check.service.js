"use strict";
/* ============================================================
   System-check service
   Reports which optional system dependencies are actually present
   in the running image — used by the admin diagnostic endpoint to
   confirm libreoffice (PPTX → PDF auto-conversion) is available.
   ============================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSystemCheck = runSystemCheck;
const child_process_1 = require("child_process");
function tryRun(bin, args) {
    try {
        const res = (0, child_process_1.spawnSync)(bin, args, { timeout: 5000, encoding: 'utf8' });
        return {
            stdout: (res.stdout || '').trim(),
            stderr: (res.stderr || '').trim(),
            code: typeof res.status === 'number' ? res.status : -1,
        };
    }
    catch (err) {
        return { stdout: '', stderr: err instanceof Error ? err.message : String(err), code: -1 };
    }
}
function runSystemCheck() {
    const candidates = [process.env.LIBREOFFICE_BIN, 'libreoffice', 'soffice', '/usr/bin/libreoffice', '/usr/bin/soffice']
        .filter((x) => !!x);
    let result = { available: false, binary: null, version: null, error: null };
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
