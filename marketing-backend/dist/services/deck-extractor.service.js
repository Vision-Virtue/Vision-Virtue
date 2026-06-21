"use strict";
/* ============================================================
   Investor Deck — AI placeholder extractor

   Given the customer's uploaded source materials (PDF/DOCX/PPTX text)
   and the placeholder schema, asks Claude to return a JSON map of
   {{placeholder}} → value for every placeholder the source materials
   support. The values feed the existing PPT replacer.

   The extractor:
     - never invents facts. If a placeholder isn't supported by the
       sources, Claude is told to omit the key entirely.
     - skips image placeholders (those are inserted manually by V&V).
     - skips placeholders that come from the Excel calculations sheet
       (we mark them off the prompt to save tokens and because the
       Investor_Deck_Calculations sheet wins on collisions anyway).

   Model: claude-sonnet-4-6 (much cheaper than Opus for structured
   extraction; output is JSON-only so no creative writing needed).
   ============================================================ */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDeckExtraction = runDeckExtraction;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const investor_deck_schema_1 = require("../data/investor-deck-schema");
const deck_upload_service_1 = require("./deck-upload.service");
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8096;
// Hard cap on extracted-text payload sent to Claude. With ~3 chars/token,
// 320 KB ≈ 100K tokens, well under Sonnet's 200K context window once we
// add the schema + instructions on top.
const MAX_SOURCE_CHARS = 320000;
/**
 * Placeholders we DON'T ask Claude to fill — the Excel calculations
 * sheet provides numeric answers for these, and image placeholders
 * need to be inserted manually.
 */
const CALC_PLACEHOLDERS = new Set([
    '{{ROUND_SIZE}}', '{{ROUND_SIZE_ASK}}', '{{ASK_AMOUNT}}', '{{TOTAL_RAISED}}',
    '{{TRACTION_MULTIPLE}}', '{{MARKET_SIZE}}', '{{UNIT_ECON_MULTIPLE}}',
    '{{TEAM_SIZE}}', '{{CUSTOMER_COUNT}}', '{{TAM_VALUE}}', '{{CAGR}}',
    '{{SAM_VALUE}}', '{{SOM_VALUE}}',
    '{{REVENUE_STREAM_01_PCT}}', '{{REVENUE_STREAM_02_PCT}}', '{{REVENUE_STREAM_03_PCT}}',
    '{{AVG_ACV}}', '{{GROSS_MARGIN}}', '{{CUSTOMERS}}', '{{CUSTOMERS_DELTA}}',
    '{{ARR_CURRENT}}', '{{ARR_TODAY}}', '{{ARR_GROWTH}}', '{{ARR_FY29}}',
    '{{NRR}}', '{{NRR_BENCHMARK}}', '{{LOGO_RETENTION}}',
    '{{REV_Y1}}', '{{REV_Y2}}', '{{REV_Y3}}', '{{REV_Y4}}', '{{REV_Y5}}',
    '{{REV_CAGR}}',
    '{{COGS_Y1}}', '{{COGS_Y2}}', '{{COGS_Y3}}', '{{COGS_Y4}}', '{{COGS_Y5}}',
    '{{GP_Y1}}', '{{GP_Y2}}', '{{GP_Y3}}', '{{GP_Y4}}', '{{GP_Y5}}', '{{GP_CAGR}}',
    '{{GM_Y1}}', '{{GM_Y2}}', '{{GM_Y3}}', '{{GM_Y4}}', '{{GM_Y5}}', '{{GM_DELTA}}',
    '{{OPEX_Y1}}', '{{OPEX_Y2}}', '{{OPEX_Y3}}', '{{OPEX_Y4}}', '{{OPEX_Y5}}',
    '{{EBITDA_Y1}}', '{{EBITDA_Y2}}', '{{EBITDA_Y3}}', '{{EBITDA_Y4}}', '{{EBITDA_Y5}}',
    '{{KPI_ARR_VALUE}}', '{{KPI_ARR_DELTA}}', '{{KPI_NRR_VALUE}}', '{{KPI_NRR_DELTA}}',
    '{{KPI_GM_VALUE}}', '{{KPI_GM_DELTA}}', '{{KPI_BURN_VALUE}}',
    '{{DRIVER_01_VALUE}}', '{{DRIVER_02_VALUE}}', '{{DRIVER_03_VALUE}}', '{{DRIVER_04_VALUE}}',
    '{{LTV_VALUE}}', '{{LTV_DELTA}}', '{{LTV_CAC_MULTIPLE}}',
    '{{CAC_VALUE}}', '{{CAC_DELTA}}',
    '{{PAYBACK_VALUE}}', '{{PAYBACK_DELTA}}', '{{MAGIC_NUMBER_VALUE}}',
    '{{COHORT_1_VALUE}}', '{{COHORT_2_VALUE}}', '{{COHORT_3_VALUE}}', '{{COHORT_4_VALUE}}',
    '{{ROI_MULTIPLE}}', '{{VALUE_01}}', '{{VALUE_02}}', '{{VALUE_03}}',
    '{{TOTAL_ANNUAL_VALUE}}',
    '{{ALLOC_01}}', '{{ALLOC_02}}', '{{ALLOC_03}}', '{{ALLOC_04}}',
    '{{ALLOC_01_PCT}}', '{{ALLOC_02_PCT}}', '{{ALLOC_03_PCT}}', '{{ALLOC_04_PCT}}',
    '{{COMMIT_ARR}}', '{{COMMIT_CUSTOMERS}}', '{{COMMIT_EBITDA}}',
    '{{CHART_REVENUE_5Y}}', '{{CHART_ARR_5Y}}', '{{CHART_REVENUE_BUILD_WATERFALL}}',
    '{{TABLE_KEY_FINANCIAL_METRICS}}', '{{TABLE_PNL_SUMMARY_5Y}}',
]);
/** Schema entries we hand to Claude (questionnaire-style placeholders only). */
function fillablePlaceholders() {
    return investor_deck_schema_1.INVESTOR_DECK_FIELDS.filter((f) => f.inputType !== 'image' && !CALC_PLACEHOLDERS.has(f.placeholder));
}
// ─── Source-material packing ─────────────────────────────────────────────────
/** Concatenate all extracted text from a customer's uploads. */
async function buildSourceText(customerKeyId) {
    const uploads = (0, deck_upload_service_1.listUploads)(customerKeyId);
    const parts = [];
    for (const u of uploads) {
        let text = '';
        try {
            text = await (0, deck_upload_service_1.getOrExtractText)(customerKeyId, u.id);
        }
        catch (err) {
            parts.push(`### File: ${u.originalName}\n[extraction failed: ${err instanceof Error ? err.message : 'unknown'}]\n`);
            continue;
        }
        if (!text.trim())
            continue;
        parts.push(`### File: ${u.originalName} (${u.ext.toUpperCase()})\n${text.trim()}`);
    }
    let joined = parts.join('\n\n---\n\n');
    if (joined.length > MAX_SOURCE_CHARS) {
        joined = joined.slice(0, MAX_SOURCE_CHARS) +
            `\n\n[... ${joined.length - MAX_SOURCE_CHARS} chars truncated ...]`;
    }
    return joined;
}
// ─── Prompt builders ──────────────────────────────────────────────────────────
function buildSystemPrompt() {
    return ('You are a senior financial analyst preparing an investor presentation. ' +
        'You are given source materials about a company (past decks, one-pagers, ' +
        'market memos, founder bios, etc.) and a list of placeholders to fill. ' +
        'Read the sources carefully and return ONLY a JSON object mapping each ' +
        'placeholder you can fill to a concise value. ' +
        '\n\nRULES:' +
        '\n1. Use facts grounded in the source material. Do not invent companies, ' +
        'people, customers, numbers, or claims that are not in the sources.' +
        '\n2. Match the style of an investor deck slide — short, declarative, ' +
        'concrete. "Short text" placeholders should be a single phrase. ' +
        '"Long text" should be 1-3 sentences max.' +
        '\n3. If a placeholder cannot be supported by the sources, OMIT the key ' +
        'entirely. Never write "N/A", "TBD", "Unknown", or generic filler.' +
        '\n4. For numeric / currency fields, include the unit (e.g. "$12M", "73%").' +
        '\n5. The output must parse as valid JSON: a flat object of ' +
        '{ "{{PLACEHOLDER}}": "value" }. Do not wrap it in markdown fences.' +
        '\n6. Do not include placeholders that are not in the provided list.');
}
function buildUserPrompt(sources, fields) {
    const placeholdersBlock = fields.map((f) => {
        const req = f.required ? ' [REQUIRED IF AVAILABLE]' : '';
        return `- ${f.placeholder}${req} — ${f.question}\n    Guidance: ${f.guidance}\n    Purpose: ${f.purpose}`;
    }).join('\n');
    return (`SOURCE MATERIALS:\n\n${sources || '(no source materials supplied)'}` +
        `\n\n=== PLACEHOLDERS TO FILL (omit any you can't support) ===\n\n${placeholdersBlock}` +
        `\n\n=== END PLACEHOLDERS ===` +
        `\n\nReturn ONLY the JSON object. Begin your response with "{" and end with "}".`);
}
// ─── JSON extraction (compact copy of ai.service's helper) ───────────────────
function findMatchingBrace(str, start) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < str.length; i++) {
        const ch = str[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\' && inString) {
            escape = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (ch === '{')
            depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0)
                return i;
        }
    }
    return -1;
}
function extractJsonMap(raw) {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fence ? fence[1].trim() : raw.trim();
    try {
        return JSON.parse(candidate);
    }
    catch {
        const start = candidate.indexOf('{');
        if (start < 0)
            throw new Error('Claude returned no JSON object.');
        const end = findMatchingBrace(candidate, start);
        if (end < 0)
            throw new Error('Claude JSON object is unterminated.');
        return JSON.parse(candidate.slice(start, end + 1));
    }
}
// ─── Validation / normalisation ──────────────────────────────────────────────
/**
 * Drop entries whose keys aren't in our schema or whose values are
 * blank / filler. Coerce all values to strings.
 */
function sanitize(raw, fields) {
    const valid = new Set(fields.map((f) => f.placeholder));
    const filler = /^(n\/?a|tbd|tba|unknown|none|missing input)$/i;
    const out = new Map();
    for (const [k, v] of Object.entries(raw)) {
        if (!valid.has(k))
            continue;
        const s = (v == null ? '' : String(v)).trim();
        if (!s || filler.test(s))
            continue;
        out.set(k, s);
    }
    return out;
}
let _client = null;
function client() {
    if (_client)
        return _client;
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key)
        throw new Error('ANTHROPIC_API_KEY is not set.');
    _client = new sdk_1.default({ apiKey: key });
    return _client;
}
/**
 * Read the customer's uploads, ask Claude to fill the questionnaire
 * placeholders, and return a sanitised value map.
 */
async function runDeckExtraction(customerKeyId) {
    const sources = await buildSourceText(customerKeyId);
    const fields = fillablePlaceholders();
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(sources, fields);
    const c = client();
    const resp = await c.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
    });
    const first = resp.content[0];
    if (!first || first.type !== 'text') {
        throw new Error('Claude returned no text content.');
    }
    const raw = first.text;
    const parsed = extractJsonMap(raw);
    const values = sanitize(parsed, fields);
    return {
        values,
        filledCount: values.size,
        candidateCount: fields.length,
        rawResponseSnippet: raw.slice(0, 1200),
        sourceChars: sources.length,
        model: MODEL,
    };
}
