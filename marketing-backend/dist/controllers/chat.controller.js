"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatController = exports.ChatController = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const ai_service_1 = require("../services/ai.service");
const types_1 = require("../types");
const VALID_AGENTS = ['economist', 'sofia', 'daniel', 'raphael', 'cfo', 'dof', 'controller', 'asst_controller', 'vc_expert'];
function getAIService(_req) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new types_1.ApiError(500, 'ANTHROPIC_API_KEY is not configured on the server', 'MISSING_CONFIG');
    }
    return new ai_service_1.AIService(new sdk_1.default({ apiKey }));
}
class ChatController {
    // POST /api/chat/:agent
    async directChat(req, res) {
        const { agent } = req.params;
        const { message, history = [] } = req.body;
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
        if (message.trim().length > 4000) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'message must be 4000 characters or fewer' },
            });
            return;
        }
        if (!Array.isArray(history)) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'history must be an array' },
            });
            return;
        }
        const aiService = getAIService();
        const reply = await aiService.directAgentChat(agent, message.trim(), history);
        res.json({ success: true, data: { reply, agent } });
    }
}
exports.ChatController = ChatController;
exports.chatController = new ChatController();
