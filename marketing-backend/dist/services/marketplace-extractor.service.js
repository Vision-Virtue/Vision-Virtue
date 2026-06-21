"use strict";
/* ============================================================
   Investors Marketplace — Auto-Extractor
   On Publish, the customer doesn't enter any fields manually.
   This service derives every visible tile field automatically:

     • sector, description           ← form_data (questionnaire)
     • askAmountText                 ← form_data.askDesc (free-form)
     • kpis (GM%, ARR, Top-Line, EBITDA YR5, NRR)
                                      ← Claude reads the finalized xlsx
                                        Financial Model and returns the
                                        actual computed numbers
   ============================================================ */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMarketplaceTileData = extractMarketplaceTileData;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const capitaflow_xlsx_service_1 = require("./capitaflow-xlsx.service");
const pptx_generator_service_1 = require("./pptx-generator.service");
const EXTRACTOR_MODEL = 'claude-sonnet-4-20250514';
const EXTRACTOR_MAX_TOKENS = 800;
function client() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
    return new sdk_1.default({ apiKey });
}
/** Best-effort extraction of a short description from arbitrary form data. */
function extractDescription(f) {
    const candidates = [
        f.oneLineDescription, f.companyTagline, f.companySummary,
        f.problemHeadline, f.solutionHeadline,
    ];
    for (const c of candidates) {
        if (typeof c === 'string' && c.trim().length > 0) {
            return c.trim().slice(0, 600);
        }
    }
    return '';
}
function extractAsk(f) {
    const a = f.askDesc;
    if (typeof a === 'string' && a.trim())
        return a.trim().slice(0, 100);
    return '';
}
function safeJsonObject(s) {
    // The model sometimes wraps JSON in ```json fences; strip them.
    const cleaned = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
        const parsed = JSON.parse(cleaned);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
        // Try to find the first {...} block
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (!m)
            return {};
        try {
            const parsed = JSON.parse(m[0]);
            return parsed && typeof parsed === 'object' ? parsed : {};
        }
        catch {
            return {};
        }
    }
}
function normalizeKpiValue(v) {
    if (v === null || v === undefined)
        return undefined;
    const s = String(v).trim();
    if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'n/a')
        return undefined;
    return s.slice(0, 40);
}
/**
 * Extract every visible tile field for a submission. Pulls form-data fields
 * deterministically and uses one focused Claude call for the financial KPIs
 * + ask amount. Returns sensible defaults when the Claude pass fails so a
 * publish never blocks on the LLM call.
 */
async function extractMarketplaceTileData(submission) {
    const f = (submission.formData && typeof submission.formData === 'object'
        ? submission.formData
        : {});
    const sector = String(f.sector || '').trim() || 'Other';
    const description = extractDescription(f);
    const askFromForm = extractAsk(f);
    // No finalized xlsx → return what we have from the form alone.
    const xlsxPath = submission.finalizedXlsxPath
        ? (0, capitaflow_xlsx_service_1.resolveStoredXlsx)(submission.finalizedXlsxPath)
        : null;
    if (!xlsxPath) {
        return { sector, description, askAmountText: askFromForm, kpis: {} };
    }
    let workbookText = '';
    try {
        workbookText = (0, pptx_generator_service_1.readWorkbookAsText)(xlsxPath);
    }
    catch {
        workbookText = '';
    }
    if (!workbookText) {
        return { sector, description, askAmountText: askFromForm, kpis: {} };
    }
    const prompt = `You are reading a populated Vision & Virtue Financial Model workbook for the ` +
        `company "${submission.customerName}". Your job is to extract the public-facing ` +
        `marketplace-tile metrics that an investor would see at a glance.\n\n` +
        `Return ONLY strict JSON (no commentary, no fences) with these exact keys. ` +
        `Format every number as the investor would expect to read it — currency with ` +
        `M/K suffix ("$2.4M", "$120K"), percentages with the % sign ("62%"), ratios with ` +
        `"x" ("3.4x"). If a value is genuinely not available, return null for that key.\n\n` +
        `Required keys:\n` +
        `  askAmountText  (the round the company is raising, e.g. "$10M Series A"; ` +
        `infer from "Use of Funds", "The Ask", round size cells, or the askDesc string below)\n` +
        `  gmPctY1, gmPctY5  (Gross Margin %, Year 1 and Year 5)\n` +
        `  arrY1, arrY5      (Annual Recurring Revenue, Year 1 and Year 5)\n` +
        `  topLineY1, topLineY5  (Total Revenue / Top-Line, Year 1 and Year 5)\n` +
        `  ebitdaY5          (Adjusted EBITDA, Year 5)\n` +
        `  nrr               (Net Revenue Retention, the most recent value present)\n\n` +
        `Form-data hints (use only if the workbook is silent):\n` +
        JSON.stringify({ askDesc: f.askDesc, sector: f.sector }).slice(0, 1500) +
        `\n\nWorkbook (truncated, may include multiple sheets):\n` +
        workbookText.slice(0, 30000);
    let kpis = {};
    let askAmountText = askFromForm;
    try {
        const resp = await client().messages.create({
            model: EXTRACTOR_MODEL,
            max_tokens: EXTRACTOR_MAX_TOKENS,
            messages: [{ role: 'user', content: prompt }],
        });
        const first = resp.content[0];
        if (first && first.type === 'text') {
            const parsed = safeJsonObject(first.text);
            kpis = {
                gmPctY1: normalizeKpiValue(parsed.gmPctY1),
                gmPctY5: normalizeKpiValue(parsed.gmPctY5),
                arrY1: normalizeKpiValue(parsed.arrY1),
                arrY5: normalizeKpiValue(parsed.arrY5),
                topLineY1: normalizeKpiValue(parsed.topLineY1),
                topLineY5: normalizeKpiValue(parsed.topLineY5),
                ebitdaY5: normalizeKpiValue(parsed.ebitdaY5),
                nrr: normalizeKpiValue(parsed.nrr),
            };
            const ask = normalizeKpiValue(parsed.askAmountText);
            if (ask)
                askAmountText = ask;
        }
    }
    catch (err) {
        console.warn('[marketplace-extractor] Claude call failed:', err instanceof Error ? err.message : err);
    }
    return { sector, description, askAmountText, kpis };
}
