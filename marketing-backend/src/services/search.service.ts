import axios from 'axios';

interface BraveWebResult {
  title: string;
  url: string;
  description?: string;
  age?: string;
}

interface BraveSearchResponse {
  web?: { results: BraveWebResult[] };
}

// ─── Brave Search Service ─────────────────────────────────────────────────────

export class BraveSearchService {
  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<string> {
    try {
      const response = await axios.get<BraveSearchResponse>(
        'https://api.search.brave.com/res/v1/web/search',
        {
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': this.apiKey,
          },
          params: { q: query, count: 6, search_lang: 'en', freshness: 'pm' },
          timeout: 8000,
        },
      );

      const results = response.data.web?.results ?? [];
      if (results.length === 0) return `No results found for: "${query}"`;

      return results
        .map((r, i) => `[${i + 1}] ${r.title}${r.age ? ` (${r.age})` : ''}\n${r.url}\n${r.description ?? ''}`)
        .join('\n\n');
    } catch (err) {
      return `Search unavailable for "${query}": ${(err as Error).message}`;
    }
  }
}
