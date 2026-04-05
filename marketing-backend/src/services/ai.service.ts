import Anthropic from '@anthropic-ai/sdk';
import {
  AIResponse,
  EconomistBrief,
  MarketingDraft,
  ApiError,
} from '../types';
import {
  chiefEconomistPrompt,
  marketingManagerPrompt,
  vpMarketingPrompt,
} from '../agents/prompts';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;

// ─── JSON Extraction Helper ───────────────────────────────────────────────────

function extractJson(raw: string): unknown {
  // Strip markdown code fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonString = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  try {
    return JSON.parse(jsonString);
  } catch {
    // Try to find the first { ... } block
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const extracted = jsonString.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(extracted);
      } catch (e2) {
        throw new ApiError(
          500,
          `Failed to parse AI response JSON: ${(e2 as Error).message}`,
          'AI_PARSE_ERROR',
          { raw: jsonString.slice(0, 500) },
        );
      }
    }
    throw new ApiError(500, 'AI response contained no valid JSON', 'AI_PARSE_ERROR', {
      raw: jsonString.slice(0, 500),
    });
  }
}

function validateAIResponse(parsed: unknown, expectedStage: AIResponse['stage']): AIResponse {
  if (!parsed || typeof parsed !== 'object') {
    throw new ApiError(500, 'AI response is not an object', 'AI_INVALID_RESPONSE');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj['stage'] !== expectedStage) {
    throw new ApiError(
      500,
      `AI response stage mismatch: expected ${expectedStage}, got ${obj['stage']}`,
      'AI_STAGE_MISMATCH',
    );
  }

  if (expectedStage === 'economist' && !obj['economist_brief']) {
    throw new ApiError(500, 'AI response missing economist_brief', 'AI_MISSING_FIELD');
  }
  if (expectedStage === 'draft' && !obj['marketing_draft']) {
    throw new ApiError(500, 'AI response missing marketing_draft', 'AI_MISSING_FIELD');
  }
  if (expectedStage === 'review' && !obj['vp_review']) {
    throw new ApiError(500, 'AI response missing vp_review', 'AI_MISSING_FIELD');
  }

  return obj as unknown as AIResponse;
}

// ─── AI Service ───────────────────────────────────────────────────────────────

export class AIService {
  constructor(private readonly client: Anthropic) {}

  private async callClaude(prompt: string): Promise<string> {
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
      throw new ApiError(500, 'Unexpected response type from Claude', 'AI_UNEXPECTED_RESPONSE');
    }

    return content.text;
  }

  async runChiefEconomist(topic: string): Promise<AIResponse> {
    const prompt = chiefEconomistPrompt(topic);
    const raw = await this.callClaude(prompt);
    const parsed = extractJson(raw);
    return validateAIResponse(parsed, 'economist');
  }

  async runMarketingManager(topic: string, brief: EconomistBrief): Promise<AIResponse> {
    const prompt = marketingManagerPrompt(topic, brief);
    const raw = await this.callClaude(prompt);
    const parsed = extractJson(raw);
    return validateAIResponse(parsed, 'draft');
  }

  async runVpMarketing(
    topic: string,
    brief: EconomistBrief,
    draft: MarketingDraft,
  ): Promise<AIResponse> {
    const prompt = vpMarketingPrompt(topic, brief, draft);
    const raw = await this.callClaude(prompt);
    const parsed = extractJson(raw);
    return validateAIResponse(parsed, 'review');
  }
}
