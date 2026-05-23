"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BraveSearchService = void 0;
const axios_1 = __importDefault(require("axios"));
// ─── Brave Search Service ─────────────────────────────────────────────────────
class BraveSearchService {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async search(query) {
        try {
            const response = await axios_1.default.get('https://api.search.brave.com/res/v1/web/search', {
                headers: {
                    Accept: 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': this.apiKey,
                },
                params: { q: query, count: 6, search_lang: 'en', freshness: 'pm' },
                timeout: 8000,
            });
            const results = response.data.web?.results ?? [];
            if (results.length === 0)
                return `No results found for: "${query}"`;
            return results
                .map((r, i) => `[${i + 1}] ${r.title}${r.age ? ` (${r.age})` : ''}\n${r.url}\n${r.description ?? ''}`)
                .join('\n\n');
        }
        catch (err) {
            return `Search unavailable for "${query}": ${err.message}`;
        }
    }
}
exports.BraveSearchService = BraveSearchService;
