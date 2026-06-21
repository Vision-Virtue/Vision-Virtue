"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const types_1 = require("../types");
const prompts_1 = require("../agents/prompts");
const MODEL = 'claude-opus-4-7';
const MAX_TOKENS = 8096;
// ─── JSON Extraction Helper ───────────────────────────────────────────────────
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
function extractJson(raw) {
    // Strip markdown code fences if present
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonString = fenceMatch ? fenceMatch[1].trim() : raw.trim();
    try {
        return JSON.parse(jsonString);
    }
    catch {
        // Find the first { and its matching closing } using proper bracket counting
        const firstBrace = jsonString.indexOf('{');
        if (firstBrace !== -1) {
            const matchingBrace = findMatchingBrace(jsonString, firstBrace);
            if (matchingBrace !== -1) {
                const extracted = jsonString.slice(firstBrace, matchingBrace + 1);
                try {
                    return JSON.parse(extracted);
                }
                catch (e2) {
                    throw new types_1.ApiError(500, `Failed to parse AI response JSON: ${e2.message}`, 'AI_PARSE_ERROR', { raw: jsonString.slice(0, 500) });
                }
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
    console.log(`[AI] validateAIResponse stage=${expectedStage} keys=${Object.keys(obj).join(',')}`);
    // Accept if required data field is present, even if stage is missing or mismatched
    const hasEconomistBrief = !!obj['economist_brief'];
    const hasMarketingDraft = !!obj['marketing_draft'];
    const hasVpReview = !!obj['vp_review'];
    if (expectedStage === 'economist' && !hasEconomistBrief) {
        throw new types_1.ApiError(500, `AI response missing economist_brief. Keys present: ${Object.keys(obj).join(', ')}`, 'AI_MISSING_FIELD');
    }
    if (expectedStage === 'draft' && !hasMarketingDraft) {
        throw new types_1.ApiError(500, `AI response missing marketing_draft. Keys present: ${Object.keys(obj).join(', ')}`, 'AI_MISSING_FIELD');
    }
    if (expectedStage === 'review' && !hasVpReview) {
        throw new types_1.ApiError(500, `AI response missing vp_review. Keys present: ${Object.keys(obj).join(', ')}`, 'AI_MISSING_FIELD');
    }
    // Normalise missing stage field so downstream code isn't broken
    if (!obj['stage']) {
        obj['stage'] = expectedStage;
    }
    return obj;
}
// ─── AI Service ───────────────────────────────────────────────────────────────
class AIService {
    constructor(client) {
        this.client = client;
    }
    mapAnthropicError(err, context) {
        if (err instanceof types_1.ApiError)
            return err;
        const e = err;
        const status = e.status ?? 500;
        const msg = e.error?.error?.message ?? (err instanceof Error ? err.message : String(err));
        if (status === 401)
            return new types_1.ApiError(502, `Anthropic API key is invalid or revoked. ${msg}`, 'AI_AUTH_ERROR');
        if (status === 429)
            return new types_1.ApiError(429, `Anthropic rate limit or credit balance too low. ${msg}`, 'AI_RATE_LIMITED');
        if (status === 529)
            return new types_1.ApiError(503, `Anthropic API is overloaded. Please retry in a moment.`, 'AI_OVERLOADED');
        return new types_1.ApiError(502, `${context}: ${msg}`, 'AI_API_ERROR');
    }
    async callClaude(prompt) {
        try {
            const response = await this.client.messages.create({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                messages: [{ role: 'user', content: prompt }],
            });
            const content = response.content[0];
            if (content.type !== 'text') {
                throw new types_1.ApiError(500, 'Unexpected response type from Claude', 'AI_UNEXPECTED_RESPONSE');
            }
            return content.text;
        }
        catch (err) {
            throw this.mapAnthropicError(err, 'Claude API call failed');
        }
    }
    async runChiefEconomist(topic, searchService) {
        const today = new Date().toISOString().split('T')[0];
        if (!searchService) {
            const prompt = (0, prompts_1.chiefEconomistPrompt)(topic, today, false);
            const raw = await this.callClaude(prompt);
            console.log(`[AI] economist raw (first 300): ${raw.slice(0, 300)}`);
            const parsed = extractJson(raw);
            return validateAIResponse(parsed, 'economist');
        }
        const prompt = (0, prompts_1.chiefEconomistPrompt)(topic, today, true);
        // Agentic loop: Claude calls web_search tool to fetch live economic data
        const webSearchTool = {
            name: 'web_search',
            description: 'Search the web for current economic data, central bank decisions, market conditions, inflation figures, and news. Always search before making claims about current conditions.',
            input_schema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Specific search query for economic data or news' },
                },
                required: ['query'],
            },
        };
        const messages = [{ role: 'user', content: prompt }];
        const MAX_SEARCHES = 3; // reduced from 6 to stay well under Render's request window
        const MAX_LOOP_MS = 80000; // 80-second cap; fall back to plain call if exceeded
        let searches = 0;
        const loopStart = Date.now();
        while (true) {
            if (Date.now() - loopStart > MAX_LOOP_MS) {
                // Web-search loop is taking too long — fall back to plain Claude call
                console.warn('[AI] Economist agentic loop timed out, falling back to plain call');
                const raw = await this.callClaude(prompt);
                console.log(`[AI] economist fallback raw (first 300): ${raw.slice(0, 300)}`);
                const parsed = extractJson(raw);
                return validateAIResponse(parsed, 'economist');
            }
            let response;
            try {
                response = await this.client.messages.create({
                    model: MODEL,
                    max_tokens: MAX_TOKENS,
                    tools: [webSearchTool],
                    messages,
                });
            }
            catch (err) {
                throw this.mapAnthropicError(err, 'Economist Claude call failed');
            }
            if (response.stop_reason === 'tool_use') {
                const toolUse = response.content.find(c => c.type === 'tool_use');
                const query = toolUse.input.query;
                searches++;
                const results = searches <= MAX_SEARCHES
                    ? await searchService.search(query)
                    : 'Search limit reached — complete the brief using available information.';
                messages.push({ role: 'assistant', content: response.content });
                messages.push({
                    role: 'user',
                    content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: results }],
                });
            }
            else {
                const textBlock = response.content.find(c => c.type === 'text');
                if (!textBlock)
                    throw new types_1.ApiError(500, 'No text in economist response', 'AI_UNEXPECTED_RESPONSE');
                const parsed = extractJson(textBlock.text);
                return validateAIResponse(parsed, 'economist');
            }
        }
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
    async cfoVisibilityChat(message, history, customerContext) {
        const systemPrompt = (0, prompts_1.cfoVisibilitySystemPrompt)(customerContext);
        const messages = [
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message },
        ];
        try {
            const response = await this.client.messages.create({
                model: MODEL,
                max_tokens: 2048,
                system: systemPrompt,
                messages,
            });
            const content = response.content[0];
            if (content.type !== 'text') {
                throw new types_1.ApiError(500, 'Unexpected response type from Claude', 'AI_UNEXPECTED_RESPONSE');
            }
            return content.text.trim();
        }
        catch (err) {
            throw this.mapAnthropicError(err, 'CFO Visibility chat failed');
        }
    }
    async directAgentChat(agentKey, message, history) {
        const systemPrompt = prompts_1.AGENT_SYSTEM_PROMPTS[agentKey];
        if (!systemPrompt) {
            throw new types_1.ApiError(400, `Unknown agent: ${agentKey}`, 'INVALID_AGENT');
        }
        const messages = [
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message },
        ];
        try {
            const response = await this.client.messages.create({
                model: MODEL,
                max_tokens: 1024,
                system: systemPrompt,
                messages,
            });
            const content = response.content[0];
            if (content.type !== 'text') {
                throw new types_1.ApiError(500, 'Unexpected response type from Claude', 'AI_UNEXPECTED_RESPONSE');
            }
            return content.text.trim();
        }
        catch (err) {
            throw this.mapAnthropicError(err, 'Agent chat failed');
        }
    }
    /**
     * Agent chat with an injected customer-data context block. Used by the
     * customer portal (Ethan Caldwell consultation) AND by the admin Finance
     * AI when an authorized user is consulting any agent on a specific
     * submission.
     *
     * The context is prepended as plain text to the system prompt so the
     * agent can reference the customer's actual numbers when answering. Plain
     * conversational replies — no XML envelope — to keep the customer-facing
     * UX clean.
     */
    async agentChatWithContext(agentKey, contextBlock, message, history) {
        const persona = prompts_1.AGENT_SYSTEM_PROMPTS[agentKey];
        if (!persona) {
            throw new types_1.ApiError(400, `Unknown agent: ${agentKey}`, 'INVALID_AGENT');
        }
        // Strip the XML response envelope instruction from the vc_expert prompt
        // so the customer-facing replies come back as plain text. The persona
        // (voice + analytical lens) stays intact.
        const cleanedPersona = persona.replace(/Format your responses using this XML[\s\S]*?<\/response>\s*/i, '').trim();
        const systemPrompt = cleanedPersona +
            '\n\n' +
            'You are speaking directly with the customer in their own portal. Use plain prose. Be specific, concrete, and tie every answer back to the customer\'s actual data shown below.\n\n' +
            '=== CUSTOMER DATA (live) ===\n' +
            contextBlock +
            '\n=== END CUSTOMER DATA ===';
        const messages = [
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message },
        ];
        try {
            const response = await this.client.messages.create({
                model: MODEL,
                max_tokens: 2048,
                system: systemPrompt,
                messages,
            });
            const content = response.content[0];
            if (content.type !== 'text') {
                throw new types_1.ApiError(500, 'Unexpected response type from Claude', 'AI_UNEXPECTED_RESPONSE');
            }
            return content.text.trim();
        }
        catch (err) {
            throw this.mapAnthropicError(err, 'Agent consultation failed');
        }
    }
}
exports.AIService = AIService;
