import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { AIService } from '../services/ai.service';
import { ApiError } from '../types';

const VALID_AGENTS = ['economist', 'sofia', 'daniel', 'raphael'];

function getAIService(req: Request): AIService {
  const apiKey = process.env.ANTHROPIC_API_KEY
    || (req.headers?.['x-api-key'] as string | undefined);
  if (!apiKey) {
    throw new ApiError(500, 'ANTHROPIC_API_KEY is not configured on the server', 'MISSING_CONFIG');
  }
  return new AIService(new Anthropic({ apiKey }));
}

export class ChatController {
  // POST /api/chat/:agent
  async directChat(req: Request, res: Response): Promise<void> {
    const { agent } = req.params;
    const { message, history = [] } = req.body as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!VALID_AGENTS.includes(agent)) {
      res.status(400).json({
        error: { code: 'INVALID_AGENT', message: `Unknown agent: ${agent}. Valid agents: ${VALID_AGENTS.join(', ')}` },
      });
      return;
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'message is required and must be a non-empty string' },
      });
      return;
    }

    if (!Array.isArray(history)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'history must be an array' },
      });
      return;
    }

    const aiService = getAIService(req);
    const reply = await aiService.directAgentChat(agent, message.trim(), history);

    res.json({ success: true, data: { reply, agent } });
  }
}

export const chatController = new ChatController();
