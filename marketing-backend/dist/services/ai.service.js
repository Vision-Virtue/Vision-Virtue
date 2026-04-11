"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const types_1 = require("../types");
const prompts_1 = require("../agents/prompts");
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8096;
// ─── JSON Extraction Helper ───────────────────────────────────────────────────
function extractJson(raw) {
    // Strip markdown code fences if present
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonString = fenceMatch ? fenceMatch[1].trim() : raw.trim();
    try {
        return JSON.parse(jsonString);
    }
    catch {
        // Try to find the first { ... } block
        const firstBrace = jsonString.indexOf('{');
        const lastBrace = jsonString.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const extracted = jsonString.slice(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(extracted);
            }
            catch (e2) {
                throw new types_1.ApiError(500, `Failed to parse AI response JSON: ${e2.message}`, 'AI_PARSE_ERROR', { raw: jsonString.slice(0, 500) });
            }
        }
        throw new types_1.ApiError(500, 'AI response contained no valid JSON', 'AI_PARSE_ERROR', {
            raw: jsonString.slice(0, 500),
        });
    }
}
function validateAIResponse(parsed, expectedStage) {
    if (!parsed || typeof parsed !== 'object') {
        throw new types_1.ApiError(500, 'AI response is not an object', 'AI_INVALID_RESPONSE');
    }
    const obj = parsed;
    if (obj['stage'] !== expectedStage) {
        throw new types_1.ApiError(500, `AI response stage mismatch: expected ${expectedStage}, got ${obj['stage']}`, 'AI_STAGE_MISMATCH');
    }
    if (expectedStage === 'economist' && !obj['economist_brief']) {
        throw new types_1.ApiError(500, 'AI response missing economist_brief', 'AI_MISSING_FIELD');
    }
    if (expectedStage === 'draft' && !obj['marketing_draft']) {
        throw new types_1.ApiError(500, 'AI response missing marketing_draft', 'AI_MISSING_FIELD');
    }
    if (expectedStage === 'review' && !obj['vp_review']) {
        throw new types_1.ApiError(500, 'AI response missing vp_review', 'AI_MISSING_FIELD');
    }
    return obj;
}
// ─── AI Service ───────────────────────────────────────────────────────────────
class AIService {
    constructor(client) {
        this.client = client;
    }
    async callClaude(prompt) {
        const response = await this.client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });
        const content = response.content[0];
        if (content.type !== 'text') {
            throw new types_1.ApiError(500, 'Unexpected response type from Claude', 'AI_UNEXPECTED_RESPONSE');
        }
        return content.text;
    }
    async runChiefEconomist(topic) {
        const prompt = (0, prompts_1.chiefEconomistPrompt)(topic);
        const raw = await this.callClaude(prompt);
        const parsed = extractJson(raw);
        return validateAIResponse(parsed, 'economist');
    }
    async runMarketingManager(topic, brief) {
        const prompt = (0, prompts_1.marketingManagerPrompt)(topic, brief);
        const raw = await this.callClaude(prompt);
        const parsed = extractJson(raw);
        return validateAIResponse(parsed, 'draft');
    }
    async runVpMarketing(topic, brief, draft) {
        const prompt = (0, prompts_1.vpMarketingPrompt)(topic, brief, draft);
        const raw = await this.callClaude(prompt);
        const parsed = extractJson(raw);
        return validateAIResponse(parsed, 'review');
    }
    async askEconomist(topic, brief, draft, qaHistory, question) {
        const prompt = (0, prompts_1.economistQAPrompt)(topic, brief, draft, qaHistory, question);
        return (await this.callClaude(prompt)).trim();
    }
    async runVpCorrectAnnotations(topic, draft, annotations) {
        const prompt = (0, prompts_1.vpCorrectAnnotationsPrompt)(topic, draft, annotations);
        const raw = await this.callClaude(prompt);
        const parsed = extractJson(raw);
        return validateAIResponse(parsed, 'draft');
    }
    async runVpSelfEdit(topic, draft, editNotes) {
        const prompt = (0, prompts_1.vpSelfEditPrompt)(topic, draft, editNotes);
        const raw = await this.callClaude(prompt);
        const parsed = extractJson(raw);
        return validateAIResponse(parsed, 'draft');
    }
}
exports.AIService = AIService;
