/* ============================================================
   Investor Deck — Phase 4 slide rewriter

   After Phase 1 (placeholder replacement) and BEFORE the cleanup
   that strips empty runs, some slides will have paragraphs that
   look like:

     "Our company has {{CUSTOMERS}} paying customers in {{REGIONS}}
      regions, generating $12M ARR."

   ...where only ARR_TODAY was filled. Cleanup alone would leave:

     "Our company has  paying customers in  regions, generating
      $12M ARR."

   The grammar is broken and a human reader would notice. Phase 4
   asks Claude to rewrite each affected paragraph using only the
   facts already present in the slide — no invention, no filler.

   Design notes:
     - One Claude call per generate (batched across slides), so
       cost ~$0.02 per deck. Best-effort: if the call fails, the
       generator continues with cleanup-only output.
     - Per-paragraph rewrite, not per-slide. We preserve the slide
       structure (titles, charts, bullets) and only touch the runs
       that lost data.
     - If a paragraph would have nothing meaningful left after the
       rewrite, the model returns "" and the existing cleanup pass
       drops the empty paragraph automatically.
   ============================================================ */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

export interface AffectedParagraph {
  /** Stable id used to map rewrites back to slide+paragraph index. */
  id: string;
  /** Paragraph text AFTER replacement, still containing the unfilled `{{X}}` markers. */
  currentText: string;
}

export interface SlideRewriteInput {
  slideKey: string;          // e.g. "ppt/slides/slide5.xml" — for prompt clarity only
  title: string;             // slide title text (best-effort; may be empty)
  contextText: string;       // other paragraphs' text on the same slide (do not rewrite)
  affected: AffectedParagraph[];
}

export interface RewriteOutcome {
  /** id → rewritten text. Empty string means "drop the paragraph". */
  rewrites: Map<string, string>;
  model: string;
  /** First 800 chars of raw model output for debugging / logging. */
  rawSnippet: string;
}

// ─── Client (lazy-init, shared across calls) ─────────────────────────────────

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// ─── Prompt construction ─────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are an editor fixing partially-filled presentation slides. Each paragraph you ' +
  "receive contains one or more {{PLACEHOLDER}} markers that couldn't be filled with " +
  'real data. Rewrite each paragraph so it reads as a clear, coherent statement using ' +
  'ONLY information already present in the paragraph text or in the slide context. ' +
  'Drop the {{PLACEHOLDER}} markers entirely, along with any surrounding words that ' +
  'no longer make sense without that data.' +
  '\n\nRULES:' +
  '\n1. Do not invent numbers, customer names, founders, dates, products, or any fact ' +
  'not visible in the text or context. If a sentence depends entirely on missing data, ' +
  'return an empty string for it.' +
  '\n2. Do not write filler such as "TBD", "N/A", "various", "many", "[redacted]", ' +
  '"to be announced", or vague hedges like "we have customers across multiple regions".' +
  '\n3. Preserve tone, register, and approximate length. Keep bullets short (one sentence ' +
  'each). Keep narrative prose as prose.' +
  '\n4. If removing the placeholder leaves a fragment with no informational value, ' +
  'return "" — the slide layout will collapse the paragraph gracefully.' +
  '\n5. Output STRICT JSON only. No markdown fences. No commentary. Start with "{" ' +
  'and end with "}".';

function buildUserPrompt(slides: SlideRewriteInput[]): string {
  const blocks = slides.map((s) => {
    const titleLine = s.title ? `Title: ${s.title}` : '(no title detected)';
    const ctx = s.contextText.trim()
      ? `Other text on the same slide (context only — do not rewrite):\n${s.contextText.trim()}`
      : '(no other text on this slide)';
    const items = s.affected.map((p) =>
      `  { "id": "${p.id}", "text": ${JSON.stringify(p.currentText)} }`,
    ).join(',\n');
    return `=== Slide: ${s.slideKey} ===\n${titleLine}\n${ctx}\nParagraphs to rewrite:\n[\n${items}\n]`;
  }).join('\n\n');

  return blocks +
    '\n\nReturn JSON in exactly this shape:\n' +
    '{\n  "rewrites": [\n    { "id": "<id>", "newText": "<rewritten text or empty string>" }\n  ]\n}';
}

// ─── JSON extraction (matches deck-extractor.service style) ──────────────────

function findMatchingBrace(str: string, start: number): number {
  let depth = 0; let inString = false; let escape = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function parseRewriteJson(raw: string): Map<string, string> {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fence ? fence[1] : raw).trim();
  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    if (start < 0) throw new Error('Rewrite response had no JSON object.');
    const end = findMatchingBrace(candidate, start);
    if (end < 0) throw new Error('Rewrite response had an unterminated JSON object.');
    obj = JSON.parse(candidate.slice(start, end + 1));
  }
  const list = (obj && typeof obj === 'object' && 'rewrites' in (obj as Record<string, unknown>)
    ? (obj as { rewrites: unknown }).rewrites
    : null);
  const out = new Map<string, string>();
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'string') continue;
    const newText = (item as { newText?: unknown }).newText;
    out.set(id, newText == null ? '' : String(newText));
  }
  return out;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Ask Claude to rewrite every affected paragraph across the provided slides
 * in a single call. Returns a map of paragraph id → new text (empty string
 * means "drop the paragraph").
 */
export async function rewriteAffectedParagraphs(
  slides: SlideRewriteInput[],
): Promise<RewriteOutcome> {
  const slidesWithWork = slides.filter((s) => s.affected.length > 0);
  if (slidesWithWork.length === 0) {
    return { rewrites: new Map(), model: MODEL, rawSnippet: '' };
  }

  const c = client();
  const resp = await c.messages.create({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: buildUserPrompt(slidesWithWork) }],
  });

  const first = resp.content[0];
  if (!first || first.type !== 'text') {
    throw new Error('Claude returned no text content for slide rewrite.');
  }
  const raw = first.text;
  const rewrites = parseRewriteJson(raw);

  return { rewrites, model: MODEL, rawSnippet: raw.slice(0, 800) };
}
